/**
 * Compiles a Filter to SQL against the local SQLite replica.
 *
 * The encoding is [ADR-0009](../../../docs/adr/0009-filter-json-encoding.md); the
 * semantics this file has to preserve are
 * [ADR-0006](../../../docs/adr/0006-filter-evaluation-semantics.md), and most of the
 * care here is spent on one rule from it: **unknown never matches, and negation does
 * not rescue it**.
 *
 * SQL gives that rule away for free wherever a predicate compares a column directly —
 * `t.runtime <= 100` is NULL for an unlinked Title, and a NULL `WHERE` is not a match.
 * It does *not* give it away where a predicate is a `NOT EXISTS` over a child table:
 * "no genre row saying Horror" is true both for a comedy and for a Title we know
 * nothing about. Those leaves therefore carry an explicit "we know something" guard,
 * and they are the reason this file is longer than it looks like it should be.
 *
 * Tags and Viewings are deliberately *not* guarded that way — see `tag` and the Viewing
 * leaves below.
 *
 * ## Parameter binding
 *
 * Placeholders are positional, so **every `param()` call must happen in the order its
 * `?` appears in the finished SQL**. Two rules keep that true, and both were learned
 * from getting it wrong:
 *
 *   - Bind inside the template literal, at the position the placeholder occupies.
 *     Template expressions evaluate left to right, so this is self-enforcing; hoisting
 *     a sub-expression to a `const` above the template is what breaks it.
 *   - Any sub-expression that might be emitted more than once, or not at all, is a
 *     thunk. A `const` holding SQL with placeholders in it has already bound its
 *     parameters once, so emitting it twice yields more `?` than values, and building
 *     one that is then discarded leaves a value with no `?`.
 */

import {
  LEAF_SPECS,
  type ComparisonOp,
  type Duration,
  type Filter,
  type FilterNode,
  type FilterPredicate,
} from "./types";

export type SqlValue = string | number | null;

export type CompiledQuery = { sql: string; params: SqlValue[] };

export type CompileContext = {
  /** Whose Library is being filtered. */
  householdId: string;
  /** Everyone in that Household — the default population for people-spanning leaves. */
  members: string[];
  /** The Household's Rating Policy, which unset predicate modifiers inherit. */
  coverage: "any" | "all";
  aggregator: "avg" | "min" | "max";
  /** Required only by `lastDrawn` with the default `this_jar` scope. */
  jarId?: string;
  /** Injectable so relative durations are testable. Defaults to now. */
  now?: Date;
};

export class FilterCompileError extends Error {}

/** A SQL fragment producer. Called once per occurrence, binding as it goes. */
type Sql = () => string;

/**
 * Title ids in the Household's Library matching `filter`.
 *
 * This is the Filter half only. Jar contents are
 * `(Library ∩ filter) ∪ Pins − Exclusions` — use `compileJarContents`.
 */
export function compileFilter(
  filter: Filter | null,
  ctx: CompileContext,
): CompiledQuery {
  const c = new Compiler(ctx);

  const sql =
    `select le.title_id\n` +
    `from library_entry le\n` +
    `join title t on t.id = le.title_id\n` +
    `where le.household_id = ${c.param(ctx.householdId)}\n` +
    `  and (${filter ? c.node(filter.root) : "1"})`;

  return { sql, params: c.params };
}

/**
 * The contents of a Jar: `(Library ∩ filter) ∪ Pins − Exclusions`.
 *
 * A Jar with no Filter is its Pins alone, which is how a hand-entered Title with no
 * attributes reaches a Jar at all (ADR-0006).
 */
export function compileJarContents(
  jar: { id: string; filter: Filter | null },
  ctx: CompileContext,
): CompiledQuery {
  const c = new Compiler({ ...ctx, jarId: jar.id });

  // A null filter must contribute nothing rather than everything: "no filter" means a
  // hand-curated Jar, not the whole Library.
  const matched = jar.filter
    ? `select le.title_id\n` +
      `from library_entry le\n` +
      `join title t on t.id = le.title_id\n` +
      `where le.household_id = ${c.param(ctx.householdId)}\n` +
      `  and (${c.node(jar.filter.root)})`
    : `select null as title_id where 0`;

  const pinned =
    `select jo.title_id from jar_override jo\n` +
    `where jo.jar_id = ${c.param(jar.id)} and jo.kind = 'pin'`;

  const excluded =
    `select jo.title_id from jar_override jo\n` +
    `where jo.jar_id = ${c.param(jar.id)} and jo.kind = 'exclusion'`;

  const sql =
    `select title_id from (\n${matched}\nunion\n${pinned}\n)\n` +
    `where title_id not in (${excluded})`;

  return { sql, params: c.params };
}

// ---------------------------------------------------------------------------

const COMPARISONS: Record<ComparisonOp, string> = {
  eq: "=",
  ne: "<>",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
};

class Compiler {
  readonly params: SqlValue[] = [];
  private readonly ctx: CompileContext;
  private readonly now: Date;

  constructor(ctx: CompileContext) {
    this.ctx = ctx;
    this.now = ctx.now ?? new Date();
  }

  param(value: SqlValue): string {
    this.params.push(value);
    return "?";
  }

  node(node: FilterNode): string {
    if (node.kind === "group") {
      const joiner = node.op === "and" ? " and " : " or ";
      return `(${node.children.map((child) => this.node(child)).join(joiner)})`;
    }
    return this.predicate(node);
  }

  private predicate(p: FilterPredicate): string {
    switch (p.leaf) {
      // --- Title Attributes -------------------------------------------------
      //
      // Direct column comparisons, so SQL's own three-valued logic already does
      // what ADR-0006 asks: NULL compares to NULL, and the row drops out.

      case "mediaType":
        return `t.media_type ${p.op === "is" ? "=" : "<>"} ${this.param(p.value)}`;

      case "language":
        if (p.op === "is_null") return `t.language is null`;
        return `t.language ${p.op === "is" ? "=" : "<>"} ${this.param(p.value)}`;

      case "releaseYear":
        return this.numeric("t.release_year", p);

      case "runtime":
        return this.numeric("t.runtime", p);

      // Multi-valued, so `not_contains` needs the guard: a Title with no genre rows
      // must fail both polarities rather than passing the negative one.
      case "genre": {
        const anyGenre = `exists (select 1 from title_genre g where g.title_id = t.id)`;
        if (p.op === "is_null") return `not ${anyGenre}`;

        // Narrowed before the closure captures it, so `value` is known to exist.
        const { value } = p;
        const hasGenre: Sql = () =>
          `exists (select 1 from title_genre g\n` +
          `        where g.title_id = t.id and g.genre = ${this.param(value)})`;

        return p.op === "contains" ? hasGenre() : `(${anyGenre} and not ${hasGenre()})`;
      }

      case "castMember":
      case "director": {
        const role = p.leaf === "castMember" ? "cast" : "director";
        const anyCredit: Sql = () =>
          `exists (select 1 from title_credit c\n` +
          `        where c.title_id = t.id and c.role = ${this.param(role)})`;
        const hasCredit: Sql = () =>
          `exists (select 1 from title_credit c\n` +
          `        where c.title_id = t.id and c.role = ${this.param(role)}\n` +
          `          and c.person_id = ${this.param(p.personId)})`;

        // `contains` must not build the guard at all — doing so would bind a value
        // with no placeholder to sit in.
        return p.op === "contains"
          ? hasCredit()
          : `(${anyCredit()} and not ${hasCredit()})`;
      }

      // --- Tags -------------------------------------------------------------
      //
      // Closed-world, unlike the attribute leaves above, and deliberately so: a Tag is
      // the Household's own vocabulary applied to its own Library. An untagged Title is
      // not a Title whose cosiness is unknown — the group simply hasn't called it cozy,
      // which is knowledge. ADR-0006's unknown rule is scoped to Attributes and
      // Ratings, both of which come from outside the group.

      case "tag": {
        const hasTag: Sql = () =>
          `exists (select 1 from title_tag tt\n` +
          `        where tt.title_id = t.id\n` +
          `          and tt.household_id = ${this.param(this.ctx.householdId)}\n` +
          `          and tt.tag_id = ${this.param(p.tagId)})`;
        return p.op === "has" ? hasTag() : `not ${hasTag()}`;
      }

      // --- Ratings ----------------------------------------------------------

      case "rating":
        return this.rating(p);

      // --- Viewings ---------------------------------------------------------
      //
      // Closed-world: a Viewing row exists or it does not. `not_by_any` genuinely means
      // "nobody has seen it" and needs no guard.

      case "watched": {
        const people = this.people(p.population);
        const watchers: Sql = () =>
          `(select count(distinct v.user_id) from viewing v\n` +
          `  where v.title_id = t.id and v.user_id in (${this.inList(people)}))`;

        switch (p.op) {
          case "by_any":
            return `${watchers()} > 0`;
          case "not_by_any":
            return `${watchers()} = 0`;
          case "by_all":
            return `${watchers()} = ${people.length}`;
          case "not_by_all":
            return `${watchers()} < ${people.length}`;
        }
      }

      case "watchCount": {
        const people = this.people(p.population);
        return (
          `(select count(*) from viewing v\n` +
          `  where v.title_id = t.id and v.user_id in (${this.inList(people)}))` +
          ` ${COMPARISONS[p.op]} ${this.param(p.value)}`
        );
      }

      // Aggregated MAX over the population, per ADR-0006: "we haven't seen it in two
      // years" is the most recent Viewing by anyone. MAX over no rows is NULL, so a
      // Title nobody has watched fails every operator here — ADR-0009 makes that
      // explicit, and "never watched" is `watched not_by_any` instead.
      case "lastWatched": {
        const people = this.people(p.population);
        const lastSeen: Sql = () =>
          `(select max(v.watched_on) from viewing v\n` +
          `  where v.title_id = t.id and v.user_id in (${this.inList(people)}))`;
        return this.time(lastSeen, p, "date");
      }

      // --- Library and Draw history ----------------------------------------

      case "addedToLibrary":
        return this.time(() => "le.added_at", p, "timestamp");

      case "addedBy":
        return `le.added_by_user_id ${p.op === "is" ? "=" : "<>"} ${this.param(p.userId)}`;

      case "lastDrawn": {
        const scope = p.scope ?? "this_jar";

        if (scope === "this_jar" && !this.ctx.jarId) {
          throw new FilterCompileError(
            "lastDrawn with scope 'this_jar' needs a jarId in the compile context",
          );
        }

        const lastDrawn: Sql = () =>
          scope === "this_jar"
            ? `(select max(d.drawn_at) from draw_candidate dc\n` +
              `  join draw d on d.id = dc.draw_id\n` +
              `  where dc.title_id = t.id and d.jar_id = ${this.param(this.ctx.jarId!)})`
            : `(select max(d.drawn_at) from draw_candidate dc\n` +
              `  join draw d on d.id = dc.draw_id\n` +
              `  join jar j on j.id = d.jar_id\n` +
              `  where dc.title_id = t.id\n` +
              `    and j.household_id = ${this.param(this.ctx.householdId)})`;

        // "Never drawn" — the one null case the Draw leaf has, because unlike
        // "never watched" there is no other leaf that expresses it.
        if (p.op === "is_null") return `${lastDrawn()} is null`;
        return this.time(lastDrawn, p, "timestamp");
      }
    }
  }

  // -------------------------------------------------------------------------

  private numeric(
    column: string,
    p: Extract<FilterPredicate, { leaf: "releaseYear" | "runtime" }>,
  ): string {
    if (p.op === "is_null") return `${column} is null`;
    if (p.op === "between") {
      return `(${column} >= ${this.param(p.min)} and ${column} <= ${this.param(p.max)})`;
    }
    return `${column} ${COMPARISONS[p.op]} ${this.param(p.value)}`;
  }

  private rating(p: Extract<FilterPredicate, { leaf: "rating" }>): string {
    const raters = this.people(p.raters);
    const coverage = p.coverage ?? this.ctx.coverage;
    const aggregator = p.aggregator ?? this.ctx.aggregator;

    const ratedBy: Sql = () =>
      `(select count(distinct r.user_id) from rating r\n` +
      `  where r.title_id = t.id and r.category_id = ${this.param(p.categoryId)}\n` +
      `    and r.user_id in (${this.inList(raters)}))`;

    if (p.op === "is_null") return `${ratedBy()} = 0`;
    if (p.op === "is_not_null") return `${ratedBy()} > 0`;

    const score: Sql = () =>
      `(select ${aggregator}(r.value) from rating r\n` +
      `  where r.title_id = t.id and r.category_id = ${this.param(p.categoryId)}\n` +
      `    and r.user_id in (${this.inList(raters)}))`;

    const comparison: Sql = () =>
      p.op === "between"
        ? `(${score()} >= ${this.param(p.min)} and ${score()} <= ${this.param(p.max)})`
        : `${score()} ${COMPARISONS[p.op as ComparisonOp]} ${this.param(p.value)}`;

    // Under `any` coverage the aggregate is NULL when nobody rated it, and a NULL
    // comparison already excludes the row — three-valued logic, for free. Under `all`
    // the population must be complete before the aggregate means anything.
    return coverage === "all"
      ? `(${ratedBy()} = ${raters.length} and ${comparison()})`
      : comparison();
  }

  /**
   * Time comparisons run through `julianday()` on both sides rather than comparing
   * text. Lexicographic comparison would be correct for dates but is a trap for
   * timestamps, where `2026-08-01T00:00:00Z` and `2026-08-01 00:00:00+00` denote the
   * same instant and sort differently.
   *
   * Both renderings genuinely occur in the same column: rows written on the device use
   * SQLite's canonical form (`src/lib/db/values.ts`), while rows replicated from
   * Postgres are rendered by PowerSync. `normaliseTime` reduces either to something
   * `julianday` will parse — which matters because `julianday` returns NULL on a form
   * it dislikes, and a NULL comparison is indistinguishable from "does not match".
   * That failure would be invisible: a Jar would simply come back emptier than it
   * should.
   */
  private time(
    expr: Sql,
    p: Extract<
      FilterPredicate,
      { leaf: "lastWatched" | "addedToLibrary" | "lastDrawn" }
    >,
    precision: "date" | "timestamp",
  ): string {
    const col: Sql = () => `julianday(${normaliseTime(expr())})`;
    const bind = (value: string) => `julianday(${this.param(value)})`;

    switch (p.op) {
      case "older_than":
        return `${col()} < ${bind(this.ago(p.duration, precision))}`;
      case "within":
        return `${col()} >= ${bind(this.ago(p.duration, precision))}`;
      case "before":
        return `${col()} < ${bind(p.date)}`;
      case "after":
        return `${col()} > ${bind(p.date)}`;
      case "between":
        // Inclusive of both ends: an absolute window is picked off a calendar, and a
        // user choosing 1–31 January means the whole of January.
        return `(${col()} >= ${bind(p.from)} and ${col()} <= ${bind(endOfDay(p.to))})`;
      default:
        // `lastDrawn` also admits is_null, which its own branch handles before
        // reaching here. Anything else is a validator gap rather than a filter.
        throw new FilterCompileError(
          `${p.leaf} cannot be compiled with operator ${(p as { op: string }).op}`,
        );
    }
  }

  /** The instant `duration` before now, formatted for SQLite's date parser. */
  private ago(duration: Duration, precision: "date" | "timestamp"): string {
    const d = new Date(this.now.getTime());

    switch (duration.unit) {
      case "day":
        d.setUTCDate(d.getUTCDate() - duration.amount);
        break;
      case "week":
        d.setUTCDate(d.getUTCDate() - duration.amount * 7);
        break;
      case "month":
        d.setUTCMonth(d.getUTCMonth() - duration.amount);
        break;
      case "year":
        d.setUTCFullYear(d.getUTCFullYear() - duration.amount);
        break;
    }

    return precision === "date" ? isoDate(d) : isoTimestamp(d);
  }

  /**
   * Resolves a people-spanning leaf's population. Omitting the modifier means the whole
   * Household — inherit, not a value frozen at save time (ADR-0009).
   */
  private people(explicit?: string[]): string[] {
    return explicit ?? this.ctx.members;
  }

  /** Binds one placeholder per id. Emitted fresh at each occurrence. */
  private inList(ids: string[]): string {
    // A Household always has at least one member, so the empty case is defence against
    // a caller passing nothing rather than a state the app can reach. Matching nobody
    // is the safe direction: it under-fills a Jar instead of leaking another group's
    // rows into it.
    if (ids.length === 0) return "null";
    return ids.map((id) => this.param(id)).join(", ");
  }
}

// ---------------------------------------------------------------------------

/**
 * Reduces any ISO-8601-ish timestamp to `YYYY-MM-DD HH:MM:SS`, which `julianday` parses
 * without complaint — dropping the `T` separator, sub-second precision and the zone
 * suffix, whether that is `Z`, `+00` or `+00:00`.
 *
 * Discarding the offset is safe rather than lossy: PowerSync replicates `timestamptz`
 * in UTC and `values.ts` writes UTC, so every value in these columns is already UTC.
 * A plain date (`YYYY-MM-DD`) passes through untouched, being shorter than the cut.
 */
function normaliseTime(expr: string): string {
  return `replace(substr(${expr}, 1, 19), 'T', ' ')`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoTimestamp(d: Date): string {
  // SQLite's canonical form. `julianday` accepts the 'T' variant too, but not every
  // offset spelling, so normalising here keeps both sides of the comparison agreeing.
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/** Absolute `between` is inclusive, so the upper bound extends to the day's end. */
function endOfDay(date: string): string {
  return `${date} 23:59:59`;
}

/** Every leaf in the catalogue has a compiler branch. Fails to build if one is added. */
const _exhaustive: Record<keyof typeof LEAF_SPECS, true> = {
  mediaType: true,
  genre: true,
  releaseYear: true,
  runtime: true,
  language: true,
  castMember: true,
  director: true,
  tag: true,
  rating: true,
  watched: true,
  watchCount: true,
  lastWatched: true,
  addedToLibrary: true,
  addedBy: true,
  lastDrawn: true,
};
void _exhaustive;
