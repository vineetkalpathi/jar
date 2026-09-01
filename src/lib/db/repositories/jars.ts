/**
 * Jars, their Filters, and what is actually in them.
 *
 * The interesting function here is `jarContentsQuery`, which is where the filter
 * compiler meets real data. Everything else is bookkeeping around it.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import {
  compileJarContents,
  parseFilter,
  type CompiledQuery,
  type CompileContext,
  type Filter,
  type SqlValue,
} from "../../filter";
import type { JarRow, TitleRow } from "../schema";
import { requiredText } from "../constraints";
import { NotFoundError } from "../errors";
import { newId } from "../ids";
import { timestamp } from "../../time";
import { getHousehold, memberIds } from "./households";

/** Jars belonging to a Household. Parameters: `[householdId]`. */
export const JARS_FOR_HOUSEHOLD = `
  select * from jar where household_id = ? order by name
`;

/**
 * A Jar's manual overrides — the Titles Pinned into it or Excluded from it — with
 * enough of each Title to list it. Parameters: `[jarId]`.
 *
 * `left join`, and `id` taken from the override rather than the Title, because the two
 * tables sync independently: an override can land before the Title it names. An inner
 * join drops those rows, and a pin made on another device then reads on this one as
 * "nothing pinned or hidden" — indistinguishable from the pin having failed. Left-joined
 * they arrive with a null `name`, which the caller can render as unresolved.
 *
 * Columns are listed rather than `t.*` so the shape is `OverrideRow` and nothing else;
 * `t.*` also put a `title.kind` column one migration away from shadowing `jo.kind`.
 */
export const OVERRIDES_FOR_JAR = `
  select jo.title_id as id,
         jo.kind,
         t.tmdb_id,
         t.name,
         t.media_type,
         t.release_year,
         t.runtime,
         t.poster_path
  from jar_override jo
  left join title t on t.id = jo.title_id
  where jo.jar_id = ?
  order by jo.kind, t.name
`;

/** A row of {@link OVERRIDES_FOR_JAR}. `name` is null until the Title has synced. */
export type OverrideRow = {
  /** The Title's id — from the override, so it is present even unresolved. */
  id: string;
  kind: "pin" | "exclusion";
  tmdb_id: number | null;
  name: string | null;
  media_type: string | null;
  release_year: number | null;
  runtime: number | null;
  poster_path: string | null;
};

/**
 * The override `kind` for one Title in one Jar, or no rows. Parameters: `[jarId, titleId]`.
 */
export const OVERRIDE_FOR_JAR_TITLE = `
  select kind from jar_override where jar_id = ? and title_id = ?
`;

/**
 * Every override on one Title across a Household's Jars — the same answer as running
 * `OVERRIDE_FOR_JAR_TITLE` once per Jar, in one indexed query instead of N watched
 * ones. Parameters: `[titleId, householdId]`.
 */
export const OVERRIDES_FOR_TITLE = `
  select jo.jar_id, jo.kind
  from jar_override jo
  join jar j on j.id = jo.jar_id
  where jo.title_id = ? and j.household_id = ?
`;

export class JarFilterError extends Error {}

/**
 * Resolves everything a Filter needs that isn't in the Filter itself: whose Library to
 * search, who counts as "the Household" for a rating or viewing predicate, and the
 * Rating Policy that unset modifiers inherit.
 *
 * Read fresh each time rather than cached, because a predicate omitting `coverage`
 * inherits the Household's current policy — that is what makes changing the policy
 * change what existing Jars mean (ADR-0009).
 */
export async function loadCompileContext(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  jarId?: string,
): Promise<CompileContext> {
  const household = await getHousehold(db, householdId);
  if (!household) throw new NotFoundError(`No household ${householdId}`);

  return {
    householdId,
    jarId,
    members: await memberIds(db, householdId),
    coverage: (household.rating_coverage ?? "any") as "any" | "all",
    aggregator: (household.rating_aggregator ?? "avg") as "avg" | "min" | "max",
  };
}

/**
 * Parses a Jar's stored filter.
 *
 * A stored Filter that no longer validates is an error rather than a null filter.
 * Treating it as "no filter" would quietly turn the Jar into its Pins alone, which
 * looks like data loss and gives no clue why.
 */
export function parseJarFilter(
  jar: Pick<JarRow, "id" | "filter">,
): Filter | null {
  if (jar.filter == null || jar.filter === "") return null;

  const result = parseFilter(jar.filter);
  if (!result.ok) {
    const detail = result.issues
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ");
    throw new JarFilterError(
      `Jar ${jar.id} has an unreadable filter — ${detail}`,
    );
  }

  return result.value;
}

/**
 * The SQL selecting just the `title_id`s of a Jar's contents — the inner query that
 * `jarContentsQuery` wraps in `select t.*`.
 *
 * For callers that intersect the contents with another query rather than list the
 * rows: `where t.id in (${sql})` needs a single-column subselect, which the full-row
 * form is not. Cooldown weighting (`draws.weighUp`) is the one that needs this.
 */
export async function jarContentIdsQuery(
  db: AbstractPowerSyncDatabase,
  jarId: string,
): Promise<CompiledQuery> {
  const jar = await db.getOptional<JarRow>(`select * from jar where id = ?`, [
    jarId,
  ]);
  if (!jar) throw new NotFoundError(`No jar ${jarId}`);

  return compileJarContents(
    { id: jar.id, filter: parseJarFilter(jar) },
    await loadCompileContext(db, jar.household_id!, jar.id),
  );
}

/**
 * The SQL selecting a Jar's contents, as full Title rows.
 *
 * Returned rather than executed so the caller can hand it to `useQuery` and get a
 * result that updates as the Library, Ratings and Viewings underneath it change.
 */
export async function jarContentsQuery(
  db: AbstractPowerSyncDatabase,
  jarId: string,
): Promise<CompiledQuery> {
  const contents = await jarContentIdsQuery(db, jarId);

  return {
    sql: `select t.* from title t where t.id in (${contents.sql}) order by t.name`,
    params: contents.params,
  };
}

/**
 * Which of a Household's Jars contain one Title — as a single query selecting the
 * `jar_id` of each Jar that does.
 *
 * The Title screen wants this for every Jar at once (a count badge, a pin button, a pin
 * sheet), and asking per Jar meant two watched queries each, one of them a compiled
 * Filter over the whole Library, re-run on every write anywhere in the app. Unioning
 * the per-Jar membership tests into one query makes that one subscription regardless of
 * how many Jars the Household has.
 *
 * `unreadable` names the Jars left out because their stored Filter no longer parses.
 * They are reported rather than skipped silently: absent from the union means "does not
 * contain", and for a Jar we simply cannot evaluate that would be a lie.
 *
 * One bound worth knowing: this binds roughly `jars × filter parameters`, so a
 * Household with dozens of elaborate Jars approaches SQLite's per-statement parameter
 * limit. Nothing near that is reachable today; split the union if it ever is.
 */
export async function jarMembershipQuery(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  titleId: string,
): Promise<{ query: CompiledQuery; unreadable: string[] }> {
  const jarRows = await db.getAll<JarRow>(JARS_FOR_HOUSEHOLD, [householdId]);
  if (jarRows.length === 0) return { query: MATCHES_NO_JAR, unreadable: [] };

  // Loaded once and shared: every Jar here belongs to the same Household, so the
  // membership and Rating Policy a Filter inherits are the same for all of them.
  const context = await loadCompileContext(db, householdId);

  const parts: string[] = [];
  const params: SqlValue[] = [];
  const unreadable: string[] = [];

  for (const jar of jarRows) {
    let contents: CompiledQuery;
    try {
      contents = compileJarContents(
        { id: jar.id, filter: parseJarFilter(jar) },
        { ...context, jarId: jar.id },
      );
    } catch (cause) {
      console.warn(`[jars] skipping ${jar.id} in a membership query:`, cause);
      unreadable.push(jar.id);
      continue;
    }

    // Bound in the order the placeholders appear: the literal jar id in the select
    // list, then the contents query's own, then the title being tested.
    parts.push(`select ? as jar_id from (${contents.sql}) where title_id = ?`);
    params.push(jar.id, ...contents.params, titleId);
  }

  if (parts.length === 0) return { query: MATCHES_NO_JAR, unreadable };

  return { query: { sql: parts.join("\nunion all\n"), params }, unreadable };
}

/** Valid, cheap, and selects the same shape as the union: no Jar contains the Title. */
const MATCHES_NO_JAR: CompiledQuery = {
  sql: `select null as jar_id where 0`,
  params: [],
};

/** A Jar's contents, resolved once. Use `jarContentsQuery` where reactivity matters. */
export async function jarContents(
  db: AbstractPowerSyncDatabase,
  jarId: string,
): Promise<TitleRow[]> {
  const { sql, params } = await jarContentsQuery(db, jarId);
  return db.getAll<TitleRow>(sql, params);
}

export async function createJar(
  db: AbstractPowerSyncDatabase,
  input: { householdId: string; name: string; filter?: Filter | null },
): Promise<string> {
  const name = requiredText(input.name, "A jar");

  const id = newId();
  await db.execute(
    `insert into jar (id, household_id, name, filter, created_at) values (?, ?, ?, ?, ?)`,
    [id, input.householdId, name, serialiseFilter(input.filter), timestamp()],
  );
  return id;
}

export async function renameJar(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  name: string,
): Promise<void> {
  await db.execute(`update jar set name = ? where id = ?`, [
    requiredText(name, "A jar"),
    jarId,
  ]);
}

/** Replaces a Jar's Filter. `null` makes it hand-curated: its Pins alone. */
export async function setJarFilter(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  filter: Filter | null,
): Promise<void> {
  await db.execute(`update jar set filter = ? where id = ?`, [
    serialiseFilter(filter),
    jarId,
  ]);
}

export async function deleteJar(
  db: AbstractPowerSyncDatabase,
  jarId: string,
): Promise<void> {
  // No cascade locally — SQLite has no foreign keys here, so the overrides and draws
  // Postgres would clean up have to be removed explicitly.
  await db.writeTransaction(async (tx) => {
    await tx.execute(`delete from jar_override where jar_id = ?`, [jarId]);
    await tx.execute(
      `delete from draw_candidate where draw_id in (select id from draw where jar_id = ?)`,
      [jarId],
    );
    await tx.execute(
      `delete from draw_participant where draw_id in (select id from draw where jar_id = ?)`,
      [jarId],
    );
    await tx.execute(`delete from draw where jar_id = ?`, [jarId]);
    await tx.execute(`delete from jar where id = ?`, [jarId]);
  });
}

/**
 * Pins a Title into a Jar regardless of its Filter, or Excludes one despite it
 * matching.
 *
 * The two share a row, so setting one clears the other — which is the point: a Title
 * may not be both, and rejecting a Title should never require lying about its Tags.
 */
export async function setOverride(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  titleId: string,
  kind: "pin" | "exclusion",
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `delete from jar_override where jar_id = ? and title_id = ?`,
      [jarId, titleId],
    );
    await tx.execute(
      `insert into jar_override (id, jar_id, title_id, kind) values (?, ?, ?, ?)`,
      [newId(), jarId, titleId, kind],
    );
  });
}

export async function clearOverride(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  titleId: string,
): Promise<void> {
  await db.execute(
    `delete from jar_override where jar_id = ? and title_id = ?`,
    [jarId, titleId],
  );
}

/**
 * A Jar with no Filter stores SQL NULL, never an empty tree — an empty group would be
 * ambiguous about whether it matches everything or nothing (ADR-0009).
 */
function serialiseFilter(filter: Filter | null | undefined): string | null {
  return filter ? JSON.stringify(filter) : null;
}
