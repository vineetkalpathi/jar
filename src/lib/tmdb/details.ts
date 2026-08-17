/**
 * Title details, normalised to what `upsertTmdbTitle` and a Title detail screen both
 * need. `append_to_response=credits,watch/providers,external_ids` folds all three into
 * this one request.
 */

import { tmdbGet } from "./client";
import type {
  TmdbCrewCreditRaw,
  TmdbMediaType,
  TmdbMovieDetailsRaw,
  TmdbTvDetailsRaw,
  TmdbWatchProvidersRaw,
} from "./types";

export type TmdbPerson = { tmdbPersonId: number; name: string };
export type TmdbCastMember = TmdbPerson & { character: string };

export type TmdbWatchProvider = { providerId: number; name: string; logoPath: string | null };

export type TmdbWatchProviders = {
  /** ISO 3166-1 region these providers apply to — pinned to `"US"`; see `watchProviders` below. */
  region: string;
  /** TMDB's own watch page for this title, not any one provider's. */
  link: string;
  /** Subscription-included providers only — rent/buy are a different intent this doesn't cover yet. */
  flatrate: TmdbWatchProvider[];
};

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
  /** Null when nothing streams it (or nothing streams it in `region`) — not an error. */
  watchProviders: TmdbWatchProviders | null;
  /** Null when TMDB has no IMDB match — not every title has one. */
  imdbId: string | null;
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

// Pinned rather than resolved from the user's locale, matching ADR-0008's reasoning for
// `language=en-US`: there is no per-user region setting yet, and provider availability
// genuinely differs by country, so this is US availability specifically — not a stand-in
// for "wherever the household actually is."
const WATCH_REGION = "US";

function watchProviders(raw: TmdbWatchProvidersRaw): TmdbWatchProviders | null {
  const region = raw.results[WATCH_REGION];
  if (!region?.flatrate || region.flatrate.length === 0) return null;

  return {
    region: WATCH_REGION,
    link: region.link,
    flatrate: [...region.flatrate]
      .sort((a, b) => a.display_priority - b.display_priority)
      .map((p) => ({ providerId: p.provider_id, name: p.provider_name, logoPath: p.logo_path })),
  };
}

export async function getMovieDetails(tmdbId: number): Promise<TmdbTitleDetails> {
  const movie = await tmdbGet<TmdbMovieDetailsRaw>(`/movie/${tmdbId}`, {
    append_to_response: "credits,watch/providers,external_ids",
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
    watchProviders: watchProviders(movie["watch/providers"]),
    imdbId: movie.external_ids.imdb_id,
  };
}

export async function getTvDetails(tmdbId: number): Promise<TmdbTitleDetails> {
  const tv = await tmdbGet<TmdbTvDetailsRaw>(`/tv/${tmdbId}`, {
    append_to_response: "credits,watch/providers,external_ids",
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
    watchProviders: watchProviders(tv["watch/providers"]),
    imdbId: tv.external_ids.imdb_id,
  };
}

/** Dispatches on `mediaType`, so a caller holding a search result needs only one call. */
export function getTitleDetails(tmdbId: number, mediaType: TmdbMediaType): Promise<TmdbTitleDetails> {
  return mediaType === "movie" ? getMovieDetails(tmdbId) : getTvDetails(tmdbId);
}
