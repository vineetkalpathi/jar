/**
 * Turning a `FilterDraft` into a stored `Filter`, ready to persist.
 *
 * The one step the pure `draftToFilter` cannot do is resolve people: a cast/director
 * chip carries a TMDB id, and the Filter stores a local `person.id` (ADR-0009). That
 * needs the database, so it lives here rather than in `draft.ts`.
 *
 * Not re-exported from `./index.ts` on purpose — this imports `@/lib/db`, and the
 * repositories import the filter module back. Import it by path where you need it.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import { library } from "@/lib/db";
import { draftToFilter, type FilterDraft } from "./draft";
import type { Filter } from "./types";
import { parseFilter } from "./validate";

export class FilterDraftInvalid extends Error {
  constructor(readonly issues: { path: string; message: string }[]) {
    super(
      `The filter didn't validate: ${issues
        .map((i) => `${i.path || "root"} — ${i.message}`)
        .join("; ")}`,
    );
  }
}

/**
 * Resolves every unresolved person in `draft`, assembles the Filter, and validates it.
 *
 * Returns `null` when the draft carries no rules — a hand-curated Jar, or a cleared
 * Library view. Throws `FilterDraftInvalid` if the assembled tree somehow fails the
 * validator, which would be a builder bug rather than user error.
 */
export async function resolveDraftFilter(
  db: AbstractPowerSyncDatabase,
  draft: FilterDraft,
  currentUserId: string,
): Promise<Filter | null> {
  // Resolved as a batch rather than one call per chip: `findOrCreatePeople` is a single
  // transaction and two statements, where the per-person loop was one transaction each,
  // fired concurrently — a write burst for no reason on every jar save.
  const resolvePeople = async (
    people: FilterDraft["cast"],
  ): Promise<FilterDraft["cast"]> => {
    const unresolved = people.filter((person) => !person.personId);
    if (unresolved.length === 0) return people;

    const ids = await library.findOrCreatePeople(
      db,
      unresolved.map((person) => ({
        tmdbPersonId: person.tmdbPersonId,
        name: person.name,
      })),
    );
    const byTmdbId = new Map(
      unresolved.map((person, i) => [person.tmdbPersonId, ids[i]]),
    );

    return people.map((person) =>
      person.personId
        ? person
        : { ...person, personId: byTmdbId.get(person.tmdbPersonId) },
    );
  };

  const resolved: FilterDraft = {
    ...draft,
    cast: await resolvePeople(draft.cast),
    directors: await resolvePeople(draft.directors),
  };

  const filter = draftToFilter(resolved, currentUserId);
  if (filter === null) return null;

  const result = parseFilter(filter);
  if (!result.ok) throw new FilterDraftInvalid(result.issues);
  return result.value;
}
