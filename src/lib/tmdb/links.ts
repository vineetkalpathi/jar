/**
 * Deep links to where a Title lives outside this app.
 *
 * TMDB's own page needs no extra API field — it's built from the id and media type
 * every caller already has. IMDB does need one: `external_ids.imdb_id`, which
 * `getTitleDetails` fetches via `append_to_response=external_ids` and normalises onto
 * `TmdbTitleDetails.imdbId`.
 */

import type { TmdbMediaType } from "./types";

/** TMDB redirects a bare id fine — no slug required. */
export function tmdbUrl(tmdbId: number, mediaType: TmdbMediaType): string {
  return `https://www.themoviedb.org/${mediaType}/${tmdbId}`;
}

/** Null when TMDB has no IMDB match for this title — not every title has one. */
export function imdbUrl(imdbId: string | null): string | null {
  return imdbId ? `https://www.imdb.com/title/${imdbId}/` : null;
}
