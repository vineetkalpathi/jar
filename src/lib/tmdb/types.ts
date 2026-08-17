/** Raw TMDB v3 response shapes — only the fields this module actually reads. */

export type TmdbMediaType = "movie" | "tv";

export type TmdbGenre = { id: number; name: string };

export type TmdbSpokenLanguage = { iso_639_1: string; english_name: string };

export type TmdbSearchResponse<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

export type TmdbMovieSearchItem = {
  id: number;
  title: string;
  release_date: string | null;
  overview: string;
  poster_path: string | null;
  popularity: number;
};

export type TmdbTvSearchItem = {
  id: number;
  name: string;
  first_air_date: string | null;
  overview: string;
  poster_path: string | null;
  popularity: number;
};

export type TmdbCastCreditRaw = {
  id: number;
  name: string;
  character: string;
  order: number;
};

export type TmdbCrewCreditRaw = {
  id: number;
  name: string;
  job: string;
};

export type TmdbCredits = {
  cast: TmdbCastCreditRaw[];
  crew: TmdbCrewCreditRaw[];
};

export type TmdbMovieDetailsRaw = {
  id: number;
  title: string;
  release_date: string | null;
  runtime: number | null;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  genres: TmdbGenre[];
  original_language: string;
  spoken_languages: TmdbSpokenLanguage[];
  credits: TmdbCredits;
};

export type TmdbCreatedBy = { id: number; name: string };

export type TmdbTvDetailsRaw = {
  id: number;
  name: string;
  first_air_date: string | null;
  // Deprecated by TMDB in favour of per-episode runtimes, but still the only
  // series-level figure the API returns — one entry per season, most recent last.
  episode_run_time: number[];
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  genres: TmdbGenre[];
  original_language: string;
  spoken_languages: TmdbSpokenLanguage[];
  created_by: TmdbCreatedBy[];
  credits: TmdbCredits;
};
