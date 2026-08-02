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
import { timestamp } from "../time";

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
  const existing = await db.getOptional<{ id: string }>(
    `select id from library_entry where household_id = ? and title_id = ?`,
    [input.householdId, input.titleId],
  );
  if (existing) return;

  await db.execute(
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
  attributes: {
    tmdbId: number;
    name: string;
    mediaType: "movie" | "tv";
    releaseYear?: number | null;
    runtime?: number | null;
    language?: string | null;
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
              language = ?, attributes_refreshed_at = ?
       where id = ?`,
      [
        attrs.name,
        attrs.mediaType,
        attrs.releaseYear,
        attrs.runtime,
        attrs.language,
        now,
        existing.id,
      ],
    );
    return existing.id;
  }

  const id = newId();
  await db.execute(
    `insert into title (id, tmdb_id, name, media_type, release_year, runtime, language,
                        attributes_refreshed_at, owner_household_id, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, null, ?)`,
    [
      id,
      attrs.tmdbId,
      attrs.name,
      attrs.mediaType,
      attrs.releaseYear,
      attrs.runtime,
      attrs.language,
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
