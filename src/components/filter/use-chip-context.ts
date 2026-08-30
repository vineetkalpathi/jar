/**
 * The display-name lookups `draftToChips` needs — tag, rating-category, member and
 * person names — resolved from live queries for a household. Split out of the filter
 * builder so the Library page's applied-filter bar can render the same chips.
 */

import { useQuery } from "@powersync/react";
import { useMemo } from "react";
import { useUserId } from "@/lib/auth/session";
import {
  annotations,
  households,
  library,
  type RatingCategoryRow,
  type TagRow,
} from "@/lib/db";
import type { FilterDraft, PersonRef } from "@/lib/filter";
import type { ChipContext } from "@/lib/filter/chips";

export function useChipContext(householdId: string, draft: FilterDraft): ChipContext {
  const userId = useUserId();
  const { data: tags } = useQuery<TagRow>(annotations.TAGS_FOR_HOUSEHOLD, [householdId]);
  const { data: categories } = useQuery<RatingCategoryRow>(
    households.CATEGORIES_FOR_HOUSEHOLD,
    [householdId],
  );
  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [householdId],
  );

  // Names for cast/director rules read back from a stored filter, where the ref only
  // carries a `personId`. Freshly added people already carry their name.
  const personIds = useMemo(
    () =>
      [...draft.cast, ...draft.directors]
        .filter((p) => !p.name && p.personId)
        .map((p) => p.personId as string),
    [draft.cast, draft.directors],
  );
  const { data: people } = useQuery<{ id: string; name: string }>(
    personIds.length > 0
      ? library.peopleByIds(personIds.length)
      : "select id, name from person where 0",
    personIds,
  );

  return useMemo<ChipContext>(() => {
    const tagMap = new Map(tags.map((t) => [t.id, t.name ?? "tag"]));
    const catMap = new Map(categories.map((c) => [c.id, c.name ?? "rating"]));
    const memberMap = new Map(members.map((m) => [m.id, m.display_name]));
    const personMap = new Map(people.map((p) => [p.id, p.name]));
    return {
      currentUserId: userId,
      tagName: (id) => tagMap.get(id) ?? "tag",
      categoryName: (id) => catMap.get(id) ?? "Rating",
      memberName: (id) => memberMap.get(id) ?? "someone",
      personName: (ref: PersonRef) =>
        ref.name || (ref.personId ? personMap.get(ref.personId) : undefined) || "someone",
    };
  }, [tags, categories, members, people, userId]);
}
