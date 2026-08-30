/**
 * A debounced, validated Filter for the builder's live match count.
 *
 * The builder's draft changes on every keystroke and chip tap; recompiling and
 * re-querying that fast is wasteful and janky. This settles for ~250 ms, then produces
 * the preview Filter (`draftToPreviewFilter` — unresolved people dropped, never
 * persisted). `null` means "no rules yet", which the count reads as the whole Library.
 */

import { useEffect, useState } from "react";
import { draftToPreviewFilter, type FilterDraft } from "./draft";
import type { Filter } from "./types";

export function usePreviewFilter(
  draft: FilterDraft,
  currentUserId: string,
  delayMs = 250,
): Filter | null {
  const key = JSON.stringify(draft);
  const [filter, setFilter] = useState<Filter | null>(() =>
    draftToPreviewFilter(draft, currentUserId),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter(draftToPreviewFilter(draft, currentUserId));
    }, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, currentUserId, delayMs]);

  return filter;
}
