/**
 * TMDB image URLs, and the attribution ADR-0003 requires for using them at all.
 *
 * Sizes are the fixed set TMDB's `/configuration` endpoint returns; they change rarely
 * enough that hardcoding them avoids a network round trip on every launch.
 */

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export const POSTER_SIZES = ["w92", "w154", "w185", "w342", "w500", "w780", "original"] as const;
export type PosterSize = (typeof POSTER_SIZES)[number];

export const BACKDROP_SIZES = ["w300", "w780", "w1280", "original"] as const;
export type BackdropSize = (typeof BACKDROP_SIZES)[number];

export const PROFILE_SIZES = ["w45", "w185", "h632", "original"] as const;
export type ProfileSize = (typeof PROFILE_SIZES)[number];

export function posterUrl(path: string | null, size: PosterSize = "w342"): string | null {
  return path ? `${IMAGE_BASE_URL}/${size}${path}` : null;
}

export function backdropUrl(path: string | null, size: BackdropSize = "w780"): string | null {
  return path ? `${IMAGE_BASE_URL}/${size}${path}` : null;
}

export function profileUrl(path: string | null, size: ProfileSize = "w185"): string | null {
  return path ? `${IMAGE_BASE_URL}/${size}${path}` : null;
}

/** Required wherever TMDB-sourced content is shown — the free licence's one condition. */
export const TMDB_ATTRIBUTION =
  "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.";
