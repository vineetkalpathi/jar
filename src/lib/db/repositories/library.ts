/**
 * Titles and the Library — the set a Household has deliberately added.
 *
 * There is no watchlist. A Title in the Library that a User has no Viewing for is, by
 * definition, one they want to watch, so `LIBRARY_FOR_HOUSEHOLD` derives that rather
 * than storing it.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import type { TitleRow } from "../schema";
import { releaseYear, requiredText, runtimeMinutes, tmdbId } from "../constraints";
import { newId } from "../ids";
import { findOrInsert } from "../upsert";
import { timestamp } from "../../time";

type TmdbPersonInput = { tmdbPersonId: number; name: string };

/**
 * A Household's Library with the facts every list view needs, derived rather than
 * stored: has this User seen it, how many times, and when last.
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
      where v.title_id = t.id and v.user_id = ?1)            as last_watched_on
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
  await findOrInsert(db, {
    table: "library_entry",
    where: {
      sql: "household_id = ? and title_id = ?",
      params: [input.householdId, input.titleId],
    },
    row: {
      household_id: input.householdId,
      title_id: input.titleId,
      added_by_user_id: input.userId,
      added_at: timestamp(),
    },
  });
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
  attributes: {
    tmdbId: number;
    name: string;
    mediaType: "movie" | "tv";
    releaseYear?: number | null;
    runtime?: number | null;
    language?: string | null;
    posterPath?: string | null;
  },
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

  const existing = await db.getOptional<{ id: string }>(
    `select id from title where tmdb_id = ?`,
    [attrs.tmdbId],
  );
  const now = timestamp();

  if (existing) {
    // Refreshing an existing row keeps the cache obligation in ADR-0003 honest: the
    // six-month limit is measured from attributes_refreshed_at.
    await db.execute(
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
  await db.execute(
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
  return findOrInsert(db, {
    table: "person",
    where: { sql: "tmdb_person_id = ?", params: [person.tmdbPersonId] },
    row: { tmdb_person_id: person.tmdbPersonId, name: requiredText(person.name, "A person") },
  });
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
  await db.writeTransaction(async (tx) => {
    await tx.execute(`delete from title_genre where title_id = ?`, [titleId]);
    for (const genre of genres) {
      await tx.execute(`insert into title_genre (id, title_id, genre) values (?, ?, ?)`, [
        newId(),
        titleId,
        genre,
      ]);
    }
  });
}

/**
 * Replaces a Title's cast and director credits with `cast` and `directors` — same
 * replace-in-one-transaction shape as `setTitleGenres`, for the same reason. People are
 * found-or-created first, outside the transaction: `findOrInsert`'s lookup is a
 * courtesy rather than a guarantee (upsert.ts), so nothing here depends on it running
 * inside the same atomic unit as the credit rows it feeds.
 */
export async function setTitleCredits(
  db: AbstractPowerSyncDatabase,
  titleId: string,
  credits: { cast: TmdbPersonInput[]; directors: TmdbPersonInput[] },
): Promise<void> {
  const castIds = await Promise.all(credits.cast.map((p) => findOrCreatePerson(db, p)));
  const directorIds = await Promise.all(credits.directors.map((p) => findOrCreatePerson(db, p)));

  await db.writeTransaction(async (tx) => {
    await tx.execute(`delete from title_credit where title_id = ?`, [titleId]);
    for (const personId of castIds) {
      await tx.execute(
        `insert into title_credit (id, title_id, person_id, role) values (?, ?, ?, 'cast')`,
        [newId(), titleId, personId],
      );
    }
    for (const personId of directorIds) {
      await tx.execute(
        `insert into title_credit (id, title_id, person_id, role) values (?, ?, ?, 'director')`,
        [newId(), titleId, personId],
      );
    }
  });
}

/**
 * The full TMDB snapshot for a Title — `upsertTmdbTitle` plus its genres and credits —
 * written as the three calls ADR-0003's cache needs, whether this is the first import
 * or a refresh of an existing one.
 */
export async function upsertTmdbTitleAttributes(
  db: AbstractPowerSyncDatabase,
  attributes: {
    tmdbId: number;
    name: string;
    mediaType: "movie" | "tv";
    releaseYear?: number | null;
    runtime?: number | null;
    language?: string | null;
    posterPath?: string | null;
    genres: string[];
    cast: TmdbPersonInput[];
    directors: TmdbPersonInput[];
  },
): Promise<string> {
  const titleId = await upsertTmdbTitle(db, attributes);
  await setTitleGenres(db, titleId, attributes.genres);
  await setTitleCredits(db, titleId, { cast: attributes.cast, directors: attributes.directors });
  return titleId;
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
