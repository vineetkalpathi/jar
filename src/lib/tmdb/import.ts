/**
 * The seam between the TMDB client and the local database.
 *
 * Kept out of `lib/db`: repositories take plain values and know nothing about the
 * network, which is what lets them be exercised against SQLite alone. This is the one
 * place that fetches from TMDB and hands the result to `db/repositories/library.ts`.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import * as library from "../db/repositories/library";
import { getTitleDetails } from "./details";
import type { TmdbMediaType } from "./types";

/**
 * Fetches a Title's TMDB attributes and adds it to a Household's Library. Jars pick it
 * up on their own if it matches their filter — there is no separate step.
 *
 * The attributes and the Library entry go down in one transaction: see the note on
 * `upsertTmdbTitleAttributes` for why the number of commits here matters so much.
 */
export async function addTmdbTitleToLibrary(
  db: AbstractPowerSyncDatabase,
  input: { tmdbId: number; mediaType: TmdbMediaType; householdId: string; userId: string },
): Promise<string> {
  const details = await getTitleDetails(input.tmdbId, input.mediaType);
  return library.upsertTmdbTitleAttributes(db, details, {
    intoLibrary: { householdId: input.householdId, userId: input.userId },
  });
}

/**
 * Re-fetches and rewrites one Title's cached attributes. The caller to drive this from
 * `library.titlesDueRefresh` doesn't exist yet — a scheduler is deliberately deferred —
 * but the write path it will need is this one.
 */
export async function refreshTmdbTitle(
  db: AbstractPowerSyncDatabase,
  title: { tmdbId: number; mediaType: TmdbMediaType },
): Promise<string> {
  const details = await getTitleDetails(title.tmdbId, title.mediaType);
  return library.upsertTmdbTitleAttributes(db, details);
}

/**
 * Fills `poster_path` on a Title that predates the column.
 *
 * A narrow one-shot, not a refresh: it writes only that column, leaving genres, credits
 * and `attributes_refreshed_at` untouched, so a list view can self-heal its artwork
 * without triggering the full six-month cache rewrite. No-ops when there is nothing to
 * fetch (no poster on TMDB) so a caller can fire it per row without guarding.
 */
export async function backfillPosterPath(
  db: AbstractPowerSyncDatabase,
  title: { id: string; tmdbId: number; mediaType: TmdbMediaType },
): Promise<void> {
  const details = await getTitleDetails(title.tmdbId, title.mediaType);
  const posterPath = details.posterPath?.trim() || null;
  if (!posterPath) return;
  await db.execute(`update title set poster_path = ? where id = ?`, [posterPath, title.id]);
}
