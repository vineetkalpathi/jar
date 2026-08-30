/**
 * Searching for a person, and what they've been in — the path to "add something because
 * of who's in it" rather than because of its own title.
 */

import { tmdbGet } from "./client";
import type {
  TmdbCombinedCreditsRaw,
  TmdbMediaType,
  TmdbPersonSearchItem,
  TmdbSearchResponse,
} from "./types";

export type TmdbPersonResult = {
  tmdbPersonId: number;
  name: string;
  profilePath: string | null;
};

/** Searches TMDB people by name. TMDB's own relevance order is left as-is. */
export async function searchPeople(query: string, page = 1): Promise<TmdbPersonResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const response = await tmdbGet<TmdbSearchResponse<TmdbPersonSearchItem>>("/search/person", {
    query: trimmed,
    page,
    include_adult: false,
  });

  return response.results.map((p) => ({
    tmdbPersonId: p.id,
    name: p.name,
    profilePath: p.profile_path,
  }));
}

export type TmdbCredit = {
  tmdbId: number;
  mediaType: TmdbMediaType;
  name: string;
  releaseYear: number | null;
  posterPath: string | null;
  popularity: number;
  /** A cast credit's character, or a crew-only credit's job title. Never both. */
  role: string;
  /**
   * A cast credit for playing "Self" — talk shows, award shows, documentary
   * interviews. Real for a prolific person: these can outnumber their actual roles and,
   * ranked on popularity alone, a single Tonight Show appearance can outrank a real
   * supporting part in a well-known film. Demoted in `getPersonCredits`'s own ordering,
   * not filtered out — exposed here too so a caller merging these with other rows (e.g.
   * the Explore screen) can preserve that ordering instead of re-sorting on popularity alone.
   */
  selfAppearance: boolean;
};

function yearOf(date: string | null | undefined): number | null {
  const year = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(year) && year > 0 ? year : null;
}

/** Only ever true for a cast credit — a job title is never "Self." */
function isSelfAppearance(character: string): boolean {
  return /^(self|himself|herself|themselves)\b/i.test(character.trim());
}

/** Non-self-appearances first; popularity descending within each group. */
function byRelevance(a: TmdbCredit, b: TmdbCredit): number {
  if (a.selfAppearance !== b.selfAppearance) return a.selfAppearance ? 1 : -1;
  return b.popularity - a.popularity;
}

/**
 * One person's filmography, cast and crew credits merged into one list — ranked by
 * relevance, since a prolific actor or director can have several hundred credits and
 * only the notable ones are worth scrolling to.
 *
 * Cast wins when a title has both: playing a role and, say, also producing it is
 * normal, and the character is the more useful line to show than the job title.
 */
export async function getPersonCredits(personId: number): Promise<TmdbCredit[]> {
  const { cast, crew } = await tmdbGet<TmdbCombinedCreditsRaw>(
    `/person/${personId}/combined_credits`,
  );

  const byKey = new Map<string, TmdbCredit>();

  for (const c of crew) {
    byKey.set(`${c.media_type}:${c.id}`, {
      tmdbId: c.id,
      mediaType: c.media_type,
      name: c.title ?? c.name ?? "",
      releaseYear: yearOf(c.release_date ?? c.first_air_date),
      posterPath: c.poster_path,
      popularity: c.popularity,
      role: c.job ?? "",
      selfAppearance: false,
    });
  }
  // Cast second, so it overwrites a crew entry for the same title rather than the
  // reverse — the map key is the whole point.
  for (const c of cast) {
    const character = c.character ?? "";
    byKey.set(`${c.media_type}:${c.id}`, {
      tmdbId: c.id,
      mediaType: c.media_type,
      name: c.title ?? c.name ?? "",
      releaseYear: yearOf(c.release_date ?? c.first_air_date),
      posterPath: c.poster_path,
      popularity: c.popularity,
      role: character,
      selfAppearance: isSelfAppearance(character),
    });
  }

  return [...byKey.values()].sort(byRelevance);
}
