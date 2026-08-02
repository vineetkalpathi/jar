/**
 * The compiler is tested by running its SQL against a real SQLite database rather than
 * by asserting on the strings it emits. Filter semantics live in how SQL treats NULL,
 * and a string assertion would happily pass on SQL that means the wrong thing.
 *
 * `unlinked` is the fixture that matters most: a hand-entered Title with no TMDB link,
 * so no media type, runtime, genres or credits. ADR-0006 says it must fail attribute
 * predicates in *both* polarities, and most of the ways to get this wrong show up as
 * that Title appearing somewhere it shouldn't.
 */

import { DatabaseSync } from "node:sqlite";
import { compileFilter, compileJarContents, type CompileContext } from "./compile";
import type { Filter, FilterNode } from "./types";

const ALICE = "alice";
const BOB = "bob";
const HOUSE = "house";
const JAR = "jar-1";
const PLOT = "cat-plot";
const COZY = "tag-cozy";
const PACINO = "p-pacino";
const HAWKE = "p-hawke";

/** Fixed, so relative durations are deterministic. */
const NOW = new Date("2026-08-01T12:00:00Z");

let db: DatabaseSync;

beforeAll(() => {
  db = new DatabaseSync(":memory:");
  db.exec(`
    create table title (id text primary key, name text, media_type text,
                        release_year integer, runtime integer, language text);
    create table title_genre (title_id text, genre text);
    create table title_credit (title_id text, person_id text, role text);
    create table title_tag (household_id text, title_id text, tag_id text);
    create table library_entry (household_id text, title_id text,
                               added_by_user_id text, added_at text);
    create table rating (user_id text, title_id text, category_id text, value integer);
    create table viewing (title_id text, user_id text, watched_on text);
    create table jar (id text primary key, household_id text);
    create table jar_override (jar_id text, title_id text, kind text);
    create table draw (id text primary key, jar_id text, drawn_at text);
    create table draw_candidate (draw_id text, title_id text);

    insert into title (id, name, media_type, release_year, runtime, language) values
      ('heat',    'Heat',           'movie', 1995, 170, 'English'),
      ('sunrise', 'Before Sunrise', 'movie', 1995, 101, 'English'),
      ('walle',   'WALL-E',         'movie', 2008,  98, 'English'),
      ('friends', 'Friends',        'tv',    1994,  22, 'English');

    -- Hand-entered: every attribute unknown.
    insert into title (id, name) values ('unlinked', 'Grandma''s 80th');

    insert into title_genre (title_id, genre) values
      ('heat', 'Action'), ('heat', 'Crime'), ('heat', 'Thriller'),
      ('sunrise', 'Drama'), ('sunrise', 'Romance'),
      ('walle', 'Animation'), ('walle', 'Family'),
      ('friends', 'Comedy');

    insert into title_credit (title_id, person_id, role) values
      ('heat', 'p-pacino', 'cast'),
      ('heat', 'p-mann', 'director'),
      ('sunrise', 'p-hawke', 'cast');

    insert into title_tag (household_id, title_id, tag_id) values
      ('house', 'walle', 'tag-cozy');

    insert into library_entry (household_id, title_id, added_by_user_id, added_at) values
      ('house', 'heat',     'alice', '2025-12-01 10:00:00'),
      ('house', 'sunrise',  'alice', '2026-03-01 10:00:00'),
      ('house', 'walle',    'bob',   '2026-07-10 10:00:00'),
      ('house', 'friends',  'bob',   '2026-07-30 10:00:00'),
      ('house', 'unlinked', 'alice', '2025-08-01 10:00:00');

    -- Alice and Bob both rate Heat; only Alice rates Before Sunrise.
    insert into rating (user_id, title_id, category_id, value) values
      ('alice', 'heat',    'cat-plot', 8),
      ('bob',   'heat',    'cat-plot', 6),
      ('alice', 'sunrise', 'cat-plot', 9);

    -- Heat watched by both, twice by Alice, over a year ago. WALL-E only by Alice,
    -- recently. Nobody has seen Before Sunrise.
    insert into viewing (title_id, user_id, watched_on) values
      ('heat',  'alice', '2025-06-27'),
      ('heat',  'alice', '2024-08-30'),
      ('heat',  'bob',   '2025-06-27'),
      ('walle', 'alice', '2026-07-02');

    insert into jar (id, household_id) values ('jar-1', 'house'), ('jar-2', 'house');
    insert into draw (id, jar_id, drawn_at) values
      ('draw-1', 'jar-1', '2026-07-20 20:00:00'),
      ('draw-2', 'jar-2', '2026-01-05 20:00:00');
    insert into draw_candidate (draw_id, title_id) values
      ('draw-1', 'heat'),
      ('draw-2', 'sunrise');
  `);
});

afterAll(() => db.close());

const baseContext: CompileContext = {
  householdId: HOUSE,
  members: [ALICE, BOB],
  coverage: "any",
  aggregator: "avg",
  jarId: JAR,
  now: NOW,
};

/** Title ids matching `root`, sorted, so assertions read as sets. */
function matching(root: FilterNode, ctx: Partial<CompileContext> = {}): string[] {
  const filter: Filter = { version: 1, root };
  const { sql, params } = compileFilter(filter, { ...baseContext, ...ctx });
  return db
    .prepare(sql)
    .all(...params)
    .map((r) => r.title_id as string)
    .sort();
}

const and = (...children: FilterNode[]): FilterNode => ({
  kind: "group",
  op: "and",
  children,
});
const or = (...children: FilterNode[]): FilterNode => ({
  kind: "group",
  op: "or",
  children,
});

// ---------------------------------------------------------------------------

describe("unknown never matches, and negation does not rescue it", () => {
  it("excludes a Title with no runtime from a runtime filter", () => {
    expect(
      matching({ kind: "predicate", leaf: "runtime", op: "lte", value: 110 }),
    ).toEqual(["friends", "sunrise", "walle"]);
  });

  it("excludes it from the negative polarity too", () => {
    // The trap: `not exists (genre = 'Horror')` is true for a Title with no genres
    // at all, so the guard is what keeps `unlinked` out.
    expect(
      matching({ kind: "predicate", leaf: "genre", op: "not_contains", value: "Horror" }),
    ).toEqual(["friends", "heat", "sunrise", "walle"]);
  });

  it("offers is_null as the escape hatch", () => {
    expect(matching({ kind: "predicate", leaf: "genre", op: "is_null" })).toEqual([
      "unlinked",
    ]);
  });

  it("lets an ANY-group say 'not horror, unknowns welcome'", () => {
    expect(
      matching(
        or(
          { kind: "predicate", leaf: "genre", op: "not_contains", value: "Horror" },
          { kind: "predicate", leaf: "genre", op: "is_null" },
        ),
      ),
    ).toEqual(["friends", "heat", "sunrise", "unlinked", "walle"]);
  });

  it("excludes unknown media type from `is not`", () => {
    expect(
      matching({ kind: "predicate", leaf: "mediaType", op: "is_not", value: "movie" }),
    ).toEqual(["friends"]);
  });

  it("guards negated credit predicates the same way", () => {
    // Only Titles with a cast credit at all: Heat has Pacino, Before Sunrise has Hawke.
    expect(
      matching({
        kind: "predicate",
        leaf: "castMember",
        op: "not_contains",
        personId: PACINO,
      }),
    ).toEqual(["sunrise"]);

    expect(
      matching({
        kind: "predicate",
        leaf: "castMember",
        op: "contains",
        personId: HAWKE,
      }),
    ).toEqual(["sunrise"]);
  });
});

describe("tags are closed-world", () => {
  it("matches a tagged Title", () => {
    expect(matching({ kind: "predicate", leaf: "tag", op: "has", tagId: COZY })).toEqual([
      "walle",
    ]);
  });

  it("includes unlinked Titles in `does not have`, unlike attribute leaves", () => {
    // A Tag is the Household's own vocabulary. An untagged Title is not one whose
    // cosiness is unknown — the group simply hasn't called it cozy.
    expect(
      matching({ kind: "predicate", leaf: "tag", op: "not_has", tagId: COZY }),
    ).toEqual(["friends", "heat", "sunrise", "unlinked"]);
  });
});

describe("ratings", () => {
  const rating = (extra: object): FilterNode =>
    ({ kind: "predicate", leaf: "rating", categoryId: PLOT, ...extra }) as FilterNode;

  it("aggregates with the household default under `any` coverage", () => {
    // Heat averages (8 + 6) / 2 = 7; Before Sunrise is 9 on Alice's rating alone.
    expect(matching(rating({ op: "gte", value: 7 }))).toEqual(["heat", "sunrise"]);
  });

  it("drops partially-rated Titles under `all` coverage", () => {
    expect(matching(rating({ op: "gte", value: 7, coverage: "all" }))).toEqual(["heat"]);
  });

  it("honours an aggregator override", () => {
    // min(8, 6) = 6 for Heat, so only Before Sunrise survives.
    expect(matching(rating({ op: "gte", value: 7, aggregator: "min" }))).toEqual([
      "sunrise",
    ]);
  });

  it("honours an explicit rater list", () => {
    expect(matching(rating({ op: "gte", value: 7, raters: [BOB] }))).toEqual([]);
    expect(matching(rating({ op: "gte", value: 7, raters: [ALICE] }))).toEqual([
      "heat",
      "sunrise",
    ]);
  });

  it("inherits the household policy rather than freezing it", () => {
    // Same filter, different Household policy, different answer — the point of
    // omitting the modifier (ADR-0009).
    expect(matching(rating({ op: "gte", value: 7 }), { aggregator: "min" })).toEqual([
      "sunrise",
    ]);
  });

  it("treats unrated as unknown in both polarities", () => {
    expect(matching(rating({ op: "lt", value: 7 }))).toEqual([]);
    expect(matching(rating({ op: "is_null" }))).toEqual([
      "friends",
      "unlinked",
      "walle",
    ]);
  });
});

describe("viewings are closed-world", () => {
  it("matches by any and by all over the household", () => {
    expect(matching({ kind: "predicate", leaf: "watched", op: "by_any" })).toEqual([
      "heat",
      "walle",
    ]);
    // Only Alice has seen WALL-E.
    expect(matching({ kind: "predicate", leaf: "watched", op: "by_all" })).toEqual([
      "heat",
    ]);
  });

  it("means plainly 'nobody has seen it' when negated", () => {
    expect(matching({ kind: "predicate", leaf: "watched", op: "not_by_any" })).toEqual([
      "friends",
      "sunrise",
      "unlinked",
    ]);
  });

  it("counts rewatches", () => {
    expect(
      matching({ kind: "predicate", leaf: "watchCount", op: "gte", value: 2 }),
    ).toEqual(["heat"]);
    expect(
      matching({
        kind: "predicate",
        leaf: "watchCount",
        op: "gte",
        value: 2,
        population: [ALICE],
      }),
    ).toEqual(["heat"]);
    expect(
      matching({
        kind: "predicate",
        leaf: "watchCount",
        op: "gte",
        value: 2,
        population: [BOB],
      }),
    ).toEqual([]);
  });

  it("aggregates lastWatched with MAX over the population", () => {
    expect(
      matching({
        kind: "predicate",
        leaf: "lastWatched",
        op: "older_than",
        duration: { amount: 1, unit: "year" },
      }),
    ).toEqual(["heat"]);

    expect(
      matching({
        kind: "predicate",
        leaf: "lastWatched",
        op: "within",
        duration: { amount: 2, unit: "month" },
      }),
    ).toEqual(["walle"]);
  });

  it("fails lastWatched entirely for a Title nobody has watched", () => {
    // Both directions: never-watched is not "infinitely long ago" (ADR-0009).
    const older = matching({
      kind: "predicate",
      leaf: "lastWatched",
      op: "older_than",
      duration: { amount: 1, unit: "day" },
    });
    expect(older).not.toContain("sunrise");
    expect(older).not.toContain("unlinked");
  });
});

describe("library and draw history", () => {
  it("filters on when a Title was added", () => {
    expect(
      matching({
        kind: "predicate",
        leaf: "addedToLibrary",
        op: "within",
        duration: { amount: 1, unit: "month" },
      }),
    ).toEqual(["friends", "walle"]);
  });

  it("filters on who added it", () => {
    expect(
      matching({ kind: "predicate", leaf: "addedBy", op: "is", userId: BOB }),
    ).toEqual(["friends", "walle"]);
  });

  it("scopes lastDrawn to this jar by default", () => {
    expect(
      matching({
        kind: "predicate",
        leaf: "lastDrawn",
        op: "within",
        duration: { amount: 30, unit: "day" },
      }),
    ).toEqual(["heat"]);
  });

  it("treats is_null as never drawn, scoped the same way", () => {
    // Before Sunrise was drawn, but by jar-2 — so from jar-1's view it is undrawn.
    expect(matching({ kind: "predicate", leaf: "lastDrawn", op: "is_null" })).toEqual([
      "friends",
      "sunrise",
      "unlinked",
      "walle",
    ]);

    expect(
      matching({
        kind: "predicate",
        leaf: "lastDrawn",
        op: "is_null",
        scope: "household",
      }),
    ).toEqual(["friends", "unlinked", "walle"]);
  });

  it("reads both timestamp renderings out of the same column", () => {
    // Rows written on the device use SQLite's canonical form; rows replicated from
    // Postgres are rendered by PowerSync. Both land in added_at, and julianday returns
    // NULL on a form it dislikes — which would look exactly like "does not match".
    db.exec(`
      insert into title (id, name, runtime) values ('iso', 'ISO row', 90);
      insert into library_entry (household_id, title_id, added_by_user_id, added_at)
      values ('house', 'iso', 'alice', '2026-07-15T10:00:00.000Z');

      insert into title (id, name, runtime) values ('offset', 'Offset row', 90);
      insert into library_entry (household_id, title_id, added_by_user_id, added_at)
      values ('house', 'offset', 'alice', '2026-07-16 10:00:00+00');
    `);

    const recent = matching({
      kind: "predicate",
      leaf: "addedToLibrary",
      op: "within",
      duration: { amount: 1, unit: "month" },
    });

    expect(recent).toContain("iso");
    expect(recent).toContain("offset");

    db.exec(`
      delete from library_entry where title_id in ('iso', 'offset');
      delete from title where id in ('iso', 'offset');
    `);
  });

  it("supports absolute windows inclusively at both ends", () => {
    expect(
      matching({
        kind: "predicate",
        leaf: "addedToLibrary",
        op: "between",
        from: "2026-07-10",
        to: "2026-07-30",
      }),
    ).toEqual(["friends", "walle"]);
  });
});

describe("the worked examples from filter-leaves.md", () => {
  it("short weeknight pick", () => {
    expect(
      matching(
        and(
          { kind: "predicate", leaf: "runtime", op: "lte", value: 110 },
          { kind: "predicate", leaf: "watched", op: "not_by_any" },
        ),
      ),
    ).toEqual(["friends", "sunrise"]);
  });

  it("comfort rewatch", () => {
    expect(
      matching(
        and(
          { kind: "predicate", leaf: "watchCount", op: "gte", value: 2 },
          {
            kind: "predicate",
            leaf: "lastWatched",
            op: "older_than",
            duration: { amount: 1, unit: "year" },
          },
        ),
      ),
    ).toEqual(["heat"]);
  });

  it("anything with Al Pacino", () => {
    expect(
      matching(
        and(
          or(
            { kind: "predicate", leaf: "mediaType", op: "is", value: "movie" },
            { kind: "predicate", leaf: "mediaType", op: "is", value: "tv" },
          ),
          { kind: "predicate", leaf: "castMember", op: "contains", personId: PACINO },
        ),
      ),
    ).toEqual(["heat"]);
  });

  it("action thriller movies", () => {
    expect(
      matching(
        and(
          { kind: "predicate", leaf: "genre", op: "contains", value: "Action" },
          { kind: "predicate", leaf: "genre", op: "contains", value: "Thriller" },
          { kind: "predicate", leaf: "mediaType", op: "is", value: "movie" },
        ),
      ),
    ).toEqual(["heat"]);
  });
});

describe("jar contents", () => {
  const contents = (filter: Filter | null, jarId = JAR): string[] => {
    const { sql, params } = compileJarContents({ id: jarId, filter }, baseContext);
    return db
      .prepare(sql)
      .all(...params)
      .map((r) => r.title_id as string)
      .sort();
  };

  beforeAll(() => {
    db.exec(`
      insert into jar_override (jar_id, title_id, kind) values
        ('jar-1', 'unlinked', 'pin'),
        ('jar-1', 'friends', 'exclusion');
    `);
  });

  it("is (library ∩ filter) ∪ pins − exclusions", () => {
    const filter: Filter = {
      version: 1,
      root: { kind: "predicate", leaf: "runtime", op: "lte", value: 110 },
    };
    // runtime ≤ 110 gives friends, sunrise, walle. The pin adds unlinked despite it
    // having no runtime; the exclusion removes friends despite it matching.
    expect(contents(filter)).toEqual(["sunrise", "unlinked", "walle"]);
  });

  it("is pins alone when there is no filter", () => {
    // Which is the only way a Title with no attributes reaches a Jar.
    expect(contents(null)).toEqual(["unlinked"]);
  });

  it("excludes a pinned Title if it is also excluded", () => {
    expect(contents(null, "jar-2")).toEqual([]);
  });
});
