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
  const resolvePeople = async (
    people: FilterDraft["cast"],
  ): Promise<FilterDraft["cast"]> =>
    Promise.all(
      people.map(async (person) => {
        if (person.personId) return person;
        const personId = await library.findOrCreatePerson(db, {
          tmdbPersonId: person.tmdbPersonId,
          name: person.name,
        });
        return { ...person, personId };
      }),
    );

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
