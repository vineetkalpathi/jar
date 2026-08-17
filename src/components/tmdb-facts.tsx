/**
 * The parts of a TMDB response that are display-only — never cached locally (see
 * `title/[id].tsx`'s note on why) and shown identically wherever a Title's TMDB details
 * are on screen: the read-only detail view and the pre-add preview.
 */

import { DarkMeta } from "./text";

export function TmdbRating({
  voteAverage,
}: {
  voteAverage: number | null | undefined;
}) {
  if (!voteAverage) return null;
  return <DarkMeta>TMDB {voteAverage.toFixed(1)}/10</DarkMeta>;
}

export function CastAndCrew({
  cast,
  directors,
}: {
  cast: { name: string }[];
  directors: { name: string }[];
}) {
  if (cast.length === 0 && directors.length === 0) return null;
  return (
    <>
      {cast.length > 0 ? (
        <DarkMeta>Starring {cast.slice(0, 4).map((c) => c.name).join(", ")}</DarkMeta>
      ) : null}
      {directors.length > 0 ? (
        <DarkMeta>Directed by {directors.map((d) => d.name).join(", ")}</DarkMeta>
      ) : null}
    </>
  );
}
