/**
 * Search across TMDB's movie and tv catalogues in one call.
 *
 * TMDB's `/search/multi` also returns `person` results the app has no use for and would
 * need filtering out downstream anyway, so this fires the two typed searches instead and
 * merges them.
 */

import { tmdbGet } from "./client";
import type { TmdbMediaType, TmdbMovieSearchItem, TmdbSearchResponse, TmdbTvSearchItem } from "./types";

export type TmdbSearchResult = {
  tmdbId: number;
  mediaType: TmdbMediaType;
  name: string;
  releaseYear: number | null;
  posterPath: string | null;
  overview: string;
  popularity: number;
};

function yearOf(date: string | null | undefined): number | null {
  const year = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(year) && year > 0 ? year : null;
}

/** Searches movies and tv shows for `query`, merged and ranked by TMDB's popularity. */
export async function searchTitles(query: string, page = 1): Promise<TmdbSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [movies, tv] = await Promise.all([
    tmdbGet<TmdbSearchResponse<TmdbMovieSearchItem>>("/search/movie", {
      query: trimmed,
      page,
      include_adult: false,
    }),
    tmdbGet<TmdbSearchResponse<TmdbTvSearchItem>>("/search/tv", {
      query: trimmed,
      page,
      include_adult: false,
    }),
  ]);

  const results: TmdbSearchResult[] = [
    ...movies.results.map(
      (m): TmdbSearchResult => ({
        tmdbId: m.id,
        mediaType: "movie",
        name: m.title,
        releaseYear: yearOf(m.release_date),
        posterPath: m.poster_path,
        overview: m.overview,
        popularity: m.popularity,
      }),
    ),
    ...tv.results.map(
      (t): TmdbSearchResult => ({
        tmdbId: t.id,
        mediaType: "tv",
        name: t.name,
        releaseYear: yearOf(t.first_air_date),
        posterPath: t.poster_path,
        overview: t.overview,
        popularity: t.popularity,
      }),
    ),
  ];

  return results.sort((a, b) => b.popularity - a.popularity);
}
