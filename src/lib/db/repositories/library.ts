/**
 * Titles and the Library — the set a Household has deliberately added.
 *
 * There is no watchlist. A Title in the Library that a User has no Viewing for is, by
 * definition, one they want to watch, so `LIBRARY_FOR_HOUSEHOLD` derives that rather
 * than storing it.
 */

import type { AbstractPowerSyncDatabase, LockContext } from "@powersync/react-native";
import type { TitleRow } from "../schema";
import { releaseYear, requiredText, runtimeMinutes, tmdbId } from "../constraints";
import { newId } from "../ids";
import { timestamp } from "../../time";

type TmdbPersonInput = { tmdbPersonId: number; name: string };

/**
 * A Household's Library with the facts every list view needs, derived rather than
 * stored: has this User seen it, how many times, when last, and what the Household
 * as a whole makes of it.
 *
 * `household_rating` is one number for the shelf: the mean of every Rating on the
 * Title, over the Household's members and the Categories it has activated. Flat, not
 * a mean of per-Category means — a member who rated one axis counts once, not as much
 * as a member who rated four. Null when nobody in the Household has rated it, which
 * the list shows as a dash. The `rating_aggregator` policy deliberately doesn't apply:
 * min/max are about picking a rater within one axis (`filter/compile.ts`), and mean
 * nothing spread across axes as well.
 *
 * Parameters: `[userId, householdId]`.
 */
export const LIBRARY_FOR_HOUSEHOLD = `
  select
    t.*,
    le.added_at,
    le.added_by_user_id,
    (select count(*) from viewing v
      where v.title_id = t.id and v.user_id = ?1)            as watch_count,
    (select max(v.watched_on) from viewing v
      where v.title_id = t.id and v.user_id = ?1)            as last_watched_on,
    (select avg(r.value) from rating r
      join household_member hm
        on hm.user_id = r.user_id and hm.household_id = ?2
      join household_category hc
        on hc.category_id = r.category_id and hc.household_id = ?2
      where r.title_id = t.id)                               as household_rating
  from library_entry le
  join title t on t.id = le.title_id
  where le.household_id = ?2
  order by t.name
`;

/**
 * The ids of the Household's Library titles that match a search term — by title, or by
 * the name of any credited person (cast or crew), the same "title or person" reach the
 * Explore search has. `?2` is a pre-escaped LIKE pattern (`%needle%`); an empty Library
 * search never calls this (the page shows everything unfiltered), so no all-rows guard.
 *
 * Returns ids only, deliberately: the page keeps `LIBRARY_FOR_HOUSEHOLD` live for the
 * row data and its derived seen-counts, and just intersects that list with these ids.
 *
 * Parameters: `[householdId, likePattern]`.
 */
export const LIBRARY_TITLE_IDS_MATCHING = `
  select t.id
  from library_entry le
  join title t on t.id = le.title_id
  where le.household_id = ?1
    and (
      t.name like ?2 escape '\\'
      or exists (
        select 1 from title_credit tc
        join person p on p.id = tc.person_id
        where tc.title_id = t.id
          and p.name like ?2 escape '\\'
      )
    )
`;

/** Everything known about one Title, for a detail view. Parameters: `[titleId]`. */
export const TITLE_BY_ID = `select * from title where id = ?`;

/** Genres of a Title, in TMDB's en-US display names. Parameters: `[titleId]`. */
export const GENRES_FOR_TITLE = `
  select genre from title_genre where title_id = ? order by genre
`;

/** Cast and directors. Parameters: `[titleId]`. */
export const CREDITS_FOR_TITLE = `
  select p.id, p.name, tc.role
  from title_credit tc
  join person p on p.id = tc.person_id
  where tc.title_id = ?
  order by tc.role, p.name
`;

/**
 * The distinct genres present in a Household's Library, for the filter builder's chip
 * list. A fresh Library returns nothing, so the builder falls back to TMDB's full
 * catalogue. Parameters: `[householdId]`.
 */
export const GENRES_IN_LIBRARY = `
  select distinct g.genre
  from title_genre g
  join library_entry le on le.title_id = g.title_id
  where le.household_id = ?
  order by g.genre
`;

/** The distinct original languages in a Household's Library. Parameters: `[householdId]`. */
export const LANGUAGES_IN_LIBRARY = `
  select distinct t.language
  from title t
  join library_entry le on le.title_id = t.id
  where le.household_id = ? and t.language is not null and t.language <> ''
  order by t.language
`;

/**
 * Names for a set of `person.id`s, so the builder can label a cast/director rule read
 * back from a stored Filter (which holds bare ids — ADR-0009). Build the placeholder
 * list to match the id count. Parameters: the ids.
 */
export function peopleByIds(placeholders: number): string {
  return `select id, name from person where id in (${Array(placeholders).fill("?").join(", ")})`;
}

/**
 * The Library row for a TMDB title, if this Household already has it.
 *
 * The two-part check is the point: Titles converge globally on `tmdb_id` (ADR-0007), so
 * a title can exist on this device because a *different* Household added it, without
 * this Household having it in its Library. Matching `tmdb_id` alone would say "already
 * added" for a title this Household has never touched.
 *
 * Exposed as raw SQL — rather than only the wrapper below — so a caller that wants this
 * to stay live can hand it straight to `useQuery`. That's what fixed a real bug: a
 * search result added from the TMDB preview screen wasn't reflected back on the results
 * row, because the two screens' "am I added" checks were unconnected local state. A
 * `useQuery` on this instead re-runs the moment the write lands, regardless of which
 * screen made it. Parameters: `[tmdbId, householdId]`.
 */
export const LIBRARY_ENTRY_FOR_TMDB_ID = `
  select le.title_id
  from library_entry le
  join title t on t.id = le.title_id
  where t.tmdb_id = ? and le.household_id = ?
`;

export async function libraryEntryForTmdbId(
  db: AbstractPowerSyncDatabase,
  input: { householdId: string; tmdbId: number },
): Promise<{ titleId: string } | null> {
  const row = await db.getOptional<{ title_id: string }>(LIBRARY_ENTRY_FOR_TMDB_ID, [
    input.tmdbId,
    input.householdId,
  ]);
  return row ? { titleId: row.title_id } : null;
}

export type LibraryEntryView = TitleRow & {
  added_at: string | null;
  added_by_user_id: string | null;
  watch_count: number;
  last_watched_on: string | null;
  /** Mean of the Household's Ratings across its activated Categories; null if unrated. */
  household_rating: number | null;
};

export async function library(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  userId: string,
): Promise<LibraryEntryView[]> {
  return db.getAll<LibraryEntryView>(LIBRARY_FOR_HOUSEHOLD, [userId, householdId]);
}

/**
 * Adds a Title to a Household's Library, or does nothing if it is already there.
 *
 * The check is a courtesy, not the guarantee: SQLite enforces no unique constraint, so
 * two devices doing this offline still produce two rows. Postgres rejects the second on
 * upload and the connector drops it as already applied (docs/powersync.md).
 */
export async function addToLibrary(
  db: AbstractPowerSyncDatabase,
  input: { householdId: string; titleId: string; userId: string },
): Promise<void> {
  await db.writeTransaction((tx) => addToLibraryIn(tx, input));
}

async function addToLibraryIn(
  tx: LockContext,
  input: { householdId: string; titleId: string; userId: string },
): Promise<void> {
  const existing = await tx.getOptional<{ id: string }>(
    `select id from library_entry where household_id = ? and title_id = ?`,
    [input.householdId, input.titleId],
  );
  if (existing) return;

  await tx.execute(
    `insert into library_entry (id, household_id, title_id, added_by_user_id, added_at)
     values (?, ?, ?, ?, ?)`,
    [newId(), input.householdId, input.titleId, input.userId, timestamp()],
  );
}

/**
 * Removes a Title from a Household's Library, along with the Household's Tags on it.
 *
 * Ratings and Viewings survive: they belong to Users rather than to the Household and
 * reference the Title directly. Whether that is the right behaviour is an open question
 * in data-model.md — it is recorded there, not decided here.
 */
export async function removeFromLibrary(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  titleId: string,
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `delete from title_tag where household_id = ? and title_id = ?`,
      [householdId, titleId],
    );
    await tx.execute(
      `delete from library_entry where household_id = ? and title_id = ?`,
      [householdId, titleId],
    );
  });
}

/**
 * Finds the global Title for a TMDB id, or creates it.
 *
 * Titles are global — one row per film app-wide — so two Households adding the same
 * film must converge on one row. The unique index on `tmdb_id` is what guarantees that
 * server-side; this lookup is what usually avoids the collision in the first place.
 */
export async function upsertTmdbTitle(
  db: AbstractPowerSyncDatabase,
  attributes: TmdbTitleAttributes,
): Promise<string> {
  return db.writeTransaction((tx) => upsertTmdbTitleIn(tx, attributes));
}

type TmdbTitleAttributes = {
  tmdbId: number;
  name: string;
  mediaType: "movie" | "tv";
  releaseYear?: number | null;
  runtime?: number | null;
  language?: string | null;
  posterPath?: string | null;
};

async function upsertTmdbTitleIn(
  tx: LockContext,
  attributes: TmdbTitleAttributes,
): Promise<string> {
  // TMDB is an external source and its values reach the database unchanged, so they
  // are normalised here rather than trusted. `runtime` is the one that bites: TMDB
  // returns 0 for entries it has no data for, which violates title_runtime_positive,
  // inserts happily into SQLite, and fails only on upload — where the connector drops
  // it as permanent. The Title would silently never sync.
  const attrs = {
    tmdbId: tmdbId(attributes.tmdbId),
    name: requiredText(attributes.name, "A title"),
    mediaType: attributes.mediaType,
    releaseYear: releaseYear(attributes.releaseYear),
    runtime: runtimeMinutes(attributes.runtime),
    language: attributes.language?.trim() || null,
    posterPath: attributes.posterPath?.trim() || null,
  };

  const existing = await tx.getOptional<{ id: string }>(
    `select id from title where tmdb_id = ?`,
    [attrs.tmdbId],
  );
  const now = timestamp();

  if (existing) {
    // Refreshing an existing row keeps the cache obligation in ADR-0003 honest: the
    // six-month limit is measured from attributes_refreshed_at.
    await tx.execute(
      `update title set name = ?, media_type = ?, release_year = ?, runtime = ?,
              language = ?, poster_path = ?, attributes_refreshed_at = ?
       where id = ?`,
      [
        attrs.name,
        attrs.mediaType,
        attrs.releaseYear,
        attrs.runtime,
        attrs.language,
        attrs.posterPath,
        now,
        existing.id,
      ],
    );
    return existing.id;
  }

  const id = newId();
  await tx.execute(
    `insert into title (id, tmdb_id, name, media_type, release_year, runtime, language,
                        poster_path, attributes_refreshed_at, owner_household_id, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?)`,
    [
      id,
      attrs.tmdbId,
      attrs.name,
      attrs.mediaType,
      attrs.releaseYear,
      attrs.runtime,
      attrs.language,
      attrs.posterPath,
      now,
      now,
    ],
  );
  return id;
}

/**
 * Creates a hand-entered Title — a home video, something TMDB has never heard of.
 *
 * It carries `owner_household_id`, which keeps it private to its creator, and it has no
 * attributes at all. That has a consequence worth surfacing in the UI: an attribute
 * Filter can never match it, because unknown never matches (ADR-0006). It reaches a Jar
 * by being Pinned.
 */
export async function createLocalTitle(
  db: AbstractPowerSyncDatabase,
  input: { householdId: string; name: string; userId: string },
): Promise<string> {
  const name = requiredText(input.name, "A title");

  const id = newId();
  const now = timestamp();

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into title (id, tmdb_id, name, owner_household_id, created_at)
       values (?, null, ?, ?, ?)`,
      [id, name, input.householdId, now],
    );
    await tx.execute(
      `insert into library_entry (id, household_id, title_id, added_by_user_id, added_at)
       values (?, ?, ?, ?, ?)`,
      [newId(), input.householdId, id, input.userId, now],
    );
  });

  return id;
}

/**
 * Finds a Person by their TMDB id, or creates them. `tmdb_person_id` is unique in
 * Postgres, so two Titles crediting the same actor converge on one row exactly like two
 * Households adding the same film converge on one Title.
 */
export async function findOrCreatePerson(
  db: AbstractPowerSyncDatabase,
  person: TmdbPersonInput,
): Promise<string> {
  const [id] = await findOrCreatePeople(db, [person]);
  return id;
}

/**
 * The same for a whole cast list, in one transaction and two statements.
 *
 * Resolving people one at a time was the single worst write in the app: a title import
 * fired a dozen concurrent read-then-insert pairs, each its own transaction, each
 * therefore its own change notification waking every watched query in the tree. One
 * lookup for the lot and one batched insert for the ones that are missing does the same
 * work with two statements and one notification.
 *
 * Returns one id per input, in input order — duplicates in `people` resolve to the same
 * id rather than to two rows, which the per-person loop could not do because neither
 * lookup saw the other's insert.
 */
export async function findOrCreatePeople(
  db: AbstractPowerSyncDatabase,
  people: TmdbPersonInput[],
): Promise<string[]> {
  if (people.length === 0) return [];
  return db.writeTransaction((tx) => resolvePeopleIn(tx, people));
}

async function resolvePeopleIn(
  tx: LockContext,
  people: TmdbPersonInput[],
): Promise<string[]> {
  if (people.length === 0) return [];

  // Names validated up front, and duplicates collapsed before anything touches SQL.
  const wanted = new Map<number, string>();
  for (const person of people) {
    if (wanted.has(person.tmdbPersonId)) continue;
    wanted.set(person.tmdbPersonId, requiredText(person.name, "A person"));
  }

  const tmdbIds = [...wanted.keys()];
  const existing = await tx.getAll<{ id: string; tmdb_person_id: number }>(
    `select id, tmdb_person_id from person
     where tmdb_person_id in (${tmdbIds.map(() => "?").join(", ")})`,
    tmdbIds,
  );

  const byTmdbId = new Map(existing.map((row) => [row.tmdb_person_id, row.id]));

  const rows: [string, number, string][] = [];
  for (const tmdbPersonId of tmdbIds) {
    if (byTmdbId.has(tmdbPersonId)) continue;
    const id = newId();
    byTmdbId.set(tmdbPersonId, id);
    rows.push([id, tmdbPersonId, wanted.get(tmdbPersonId)!]);
  }

  if (rows.length > 0) {
    await tx.executeBatch(
      `insert into person (id, tmdb_person_id, name) values (?, ?, ?)`,
      rows,
    );
  }

  return people.map((person) => byTmdbId.get(person.tmdbPersonId)!);
}

/**
 * Replaces a Title's cached genres with `genres`, delete-then-insert inside one
 * transaction. Never split across two transactions: ADR-0003 requires a refresh to
 * update in place, and a Title left genre-less between them would drop out of every
 * `genre = X` Jar until the insert caught up.
 */
export async function setTitleGenres(
  db: AbstractPowerSyncDatabase,
  titleId: string,
  genres: string[],
): Promise<void> {
  await db.writeTransaction((tx) => setTitleGenresIn(tx, titleId, genres));
}

async function setTitleGenresIn(
  tx: LockContext,
  titleId: string,
  genres: string[],
): Promise<void> {
  await tx.execute(`delete from title_genre where title_id = ?`, [titleId]);

  // Deduplicated because `title_genre_title_genre_key` is unique on (title_id, genre):
  // a repeated genre inserts fine locally and is dropped on upload.
  const distinct = [...new Set(genres)];
  if (distinct.length === 0) return;

  await tx.executeBatch(
    `insert into title_genre (id, title_id, genre) values (?, ?, ?)`,
    distinct.map((genre) => [newId(), titleId, genre]),
  );
}

/**
 * Replaces a Title's cast and director credits with `cast` and `directors` — same
 * replace-in-one-transaction shape as `setTitleGenres`, for the same reason.
 *
 * People are resolved inside the transaction now, not before it. The old comment here
 * argued the reverse: that `findOrInsert`'s lookup is a courtesy rather than a
 * guarantee, so the credit rows need not share its atomic unit. True, and beside the
 * point — the cost was never correctness, it was a dozen separate transactions per
 * import. `resolvePeopleIn` is two statements and shares this one.
 */
export async function setTitleCredits(
  db: AbstractPowerSyncDatabase,
  titleId: string,
  credits: { cast: TmdbPersonInput[]; directors: TmdbPersonInput[] },
): Promise<void> {
  await db.writeTransaction((tx) => setTitleCreditsIn(tx, titleId, credits));
}

async function setTitleCreditsIn(
  tx: LockContext,
  titleId: string,
  credits: { cast: TmdbPersonInput[]; directors: TmdbPersonInput[] },
): Promise<void> {
  const castIds = await resolvePeopleIn(tx, credits.cast);
  const directorIds = await resolvePeopleIn(tx, credits.directors);

  await tx.execute(`delete from title_credit where title_id = ?`, [titleId]);

  // Unique on (title_id, person_id, role), so one person may be both cast and director
  // but not twice in either. A director credited once per episode is real TMDB data.
  const seen = new Set<string>();
  const rows: [string, string, string, string][] = [];
  for (const [personId, role] of [
    ...castIds.map((id) => [id, "cast"] as const),
    ...directorIds.map((id) => [id, "director"] as const),
  ]) {
    const key = `${role}:${personId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push([newId(), titleId, personId, role]);
  }

  if (rows.length === 0) return;

  await tx.executeBatch(
    `insert into title_credit (id, title_id, person_id, role) values (?, ?, ?, ?)`,
    rows,
  );
}

/**
 * The full TMDB snapshot for a Title — the row, its genres and its credits — plus, when
 * `intoLibrary` is given, the Library entry that puts it on a Household's shelf.
 *
 * **One transaction, deliberately.** This used to be three or four calls, each opening
 * its own, and `setTitleCredits` fanned a dozen more out concurrently underneath them.
 * Every one of those commits is a change notification, and every notification re-runs
 * every watched query mounted anywhere in the app — including the compiled jar-contents
 * queries, which are not cheap. A single "add to library" tap therefore cost something
 * like sixteen notification waves across a screen holding dozens of live queries. That
 * is the write amplification behind the crashes; collapsing it to one commit is the fix.
 *
 * Adding to the Library belongs in here rather than in a call after it for the same
 * reason, and one better: a Title whose attributes landed but whose Library entry did
 * not is a row nobody can see or reach.
 */
export async function upsertTmdbTitleAttributes(
  db: AbstractPowerSyncDatabase,
  attributes: TmdbTitleAttributes & {
    genres: string[];
    cast: TmdbPersonInput[];
    directors: TmdbPersonInput[];
  },
  options?: { intoLibrary?: { householdId: string; userId: string } },
): Promise<string> {
  return db.writeTransaction(async (tx) => {
    const titleId = await upsertTmdbTitleIn(tx, attributes);
    await setTitleGenresIn(tx, titleId, attributes.genres);
    await setTitleCreditsIn(tx, titleId, {
      cast: attributes.cast,
      directors: attributes.directors,
    });

    if (options?.intoLibrary) {
      await addToLibraryIn(tx, { ...options.intoLibrary, titleId });
    }

    return titleId;
  });
}

/** Titles due a TMDB refresh, per the six-month cache limit in ADR-0003. */
export async function titlesDueRefresh(
  db: AbstractPowerSyncDatabase,
  before: Date,
): Promise<TitleRow[]> {
  return db.getAll<TitleRow>(
    `select * from title
     where tmdb_id is not null
       and (attributes_refreshed_at is null or attributes_refreshed_at < ?)
     order by attributes_refreshed_at`,
    [timestamp(before)],
  );
}
