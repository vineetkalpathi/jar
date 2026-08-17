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
 */
export async function addTmdbTitleToLibrary(
  db: AbstractPowerSyncDatabase,
  input: { tmdbId: number; mediaType: TmdbMediaType; householdId: string; userId: string },
): Promise<string> {
  const details = await getTitleDetails(input.tmdbId, input.mediaType);
  const titleId = await library.upsertTmdbTitleAttributes(db, details);
  await library.addToLibrary(db, {
    householdId: input.householdId,
    titleId,
    userId: input.userId,
  });
  return titleId;
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
