/**
 * TMDB's genre catalogues, cached in memory for the process lifetime.
 *
 * Search results carry only `genre_ids`; this is what a list view would resolve them
 * against without refetching per row. Genres change on the order of once a year, so a
 * one-time fetch per app session is not staleness worth worrying about.
 */

import { tmdbGet } from "./client";
import type { TmdbGenre } from "./types";

let movieGenresCache: Promise<TmdbGenre[]> | null = null;
let tvGenresCache: Promise<TmdbGenre[]> | null = null;

export function movieGenres(): Promise<TmdbGenre[]> {
  movieGenresCache ??= tmdbGet<{ genres: TmdbGenre[] }>("/genre/movie/list").then((r) => r.genres);
  return movieGenresCache;
}

export function tvGenres(): Promise<TmdbGenre[]> {
  tvGenresCache ??= tmdbGet<{ genres: TmdbGenre[] }>("/genre/tv/list").then((r) => r.genres);
  return tvGenresCache;
}
