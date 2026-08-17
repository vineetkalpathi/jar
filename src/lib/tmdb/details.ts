/**
 * Title details, normalised to what `upsertTmdbTitle` and a Title detail screen both
 * need. `append_to_response=credits` folds a second request into the same call.
 */

import { tmdbGet } from "./client";
import type { TmdbCrewCreditRaw, TmdbMediaType, TmdbMovieDetailsRaw, TmdbTvDetailsRaw } from "./types";

export type TmdbPerson = { tmdbPersonId: number; name: string };
export type TmdbCastMember = TmdbPerson & { character: string };

export type TmdbTitleDetails = {
  tmdbId: number;
  mediaType: TmdbMediaType;
  name: string;
  releaseYear: number | null;
  runtime: number | null;
  /** TMDB's en-US display name, e.g. "English" — ADR-0008, not an ISO code. */
  language: string | null;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  /** en-US display names, e.g. "Science Fiction" — ADR-0008. */
  genres: string[];
  cast: TmdbCastMember[];
  directors: TmdbPerson[];
};

function yearOf(date: string | null | undefined): number | null {
  const year = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(year) && year > 0 ? year : null;
}

/**
 * Resolves a language code to TMDB's en-US name via the title's own `spoken_languages`
 * — avoids a separate `/configuration/languages` call for the common case. Falls back to
 * the raw code on the rare title where the original language isn't in that list.
 */
function languageName(
  original: string | undefined,
  spoken: { iso_639_1: string; english_name: string }[] | undefined,
): string | null {
  if (!original) return null;
  return spoken?.find((l) => l.iso_639_1 === original)?.english_name ?? original;
}

function topCast(
  cast: { id: number; name: string; character: string; order: number }[],
  limit = 10,
): TmdbCastMember[] {
  return [...cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, limit)
    .map((c) => ({ tmdbPersonId: c.id, name: c.name, character: c.character }));
}

function crewDirectors(crew: TmdbCrewCreditRaw[]): TmdbPerson[] {
  return crew.filter((c) => c.job === "Director").map((c) => ({ tmdbPersonId: c.id, name: c.name }));
}

export async function getMovieDetails(tmdbId: number): Promise<TmdbTitleDetails> {
  const movie = await tmdbGet<TmdbMovieDetailsRaw>(`/movie/${tmdbId}`, {
    append_to_response: "credits",
  });

  return {
    tmdbId: movie.id,
    mediaType: "movie",
    name: movie.title,
    releaseYear: yearOf(movie.release_date),
    // TMDB returns 0 for a runtime it doesn't have, not null — mirrors runtimeMinutes()
    // in db/constraints.ts, which is where this value ends up.
    runtime: movie.runtime && movie.runtime > 0 ? movie.runtime : null,
    language: languageName(movie.original_language, movie.spoken_languages),
    overview: movie.overview,
    posterPath: movie.poster_path,
    backdropPath: movie.backdrop_path,
    voteAverage: movie.vote_average || null,
    genres: movie.genres.map((g) => g.name),
    cast: topCast(movie.credits.cast),
    directors: crewDirectors(movie.credits.crew),
  };
}

export async function getTvDetails(tmdbId: number): Promise<TmdbTitleDetails> {
  const tv = await tmdbGet<TmdbTvDetailsRaw>(`/tv/${tmdbId}`, {
    append_to_response: "credits",
  });

  // Series-level credits rarely carry a "Director" job — that's an episode-level
  // credit TMDB doesn't roll up. `created_by` is a series' real analogue: whoever
  // created the show, which is what the data model's `director` role means for a Title
  // that isn't a movie.
  const directors = crewDirectors(tv.credits.crew);

  return {
    tmdbId: tv.id,
    mediaType: "tv",
    name: tv.name,
    releaseYear: yearOf(tv.first_air_date),
    runtime: tv.episode_run_time[0] || null,
    language: languageName(tv.original_language, tv.spoken_languages),
    overview: tv.overview,
    posterPath: tv.poster_path,
    backdropPath: tv.backdrop_path,
    voteAverage: tv.vote_average || null,
    genres: tv.genres.map((g) => g.name),
    cast: topCast(tv.credits.cast),
    directors: directors.length > 0 ? directors : tv.created_by.map((c) => ({ tmdbPersonId: c.id, name: c.name })),
  };
}

/** Dispatches on `mediaType`, so a caller holding a search result needs only one call. */
export function getTitleDetails(tmdbId: number, mediaType: TmdbMediaType): Promise<TmdbTitleDetails> {
  return mediaType === "movie" ? getMovieDetails(tmdbId) : getTvDetails(tmdbId);
}
