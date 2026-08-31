/**
 * The Library search term, as the two screens that have one need it.
 *
 * `LIBRARY_TITLE_IDS_MATCHING` reaches through `title_credit` into `person`, so it is
 * the most expensive read either screen runs, and both used to hand it straight to
 * `useQuery` off raw component state. That had two costs worth naming:
 *
 *   - **Every keystroke re-planned it.** A watched query re-subscribes whenever its
 *     parameters change, so typing eight characters ran it eight times.
 *   - **An empty box ran it at all.** The pattern came out `%%`, which matches
 *     everything — a full scan of the Household's Library joined against every credit
 *     and every person, kept live and re-run on every write anywhere in the app, to
 *     produce a set the screen then ignores because an empty search shows everything
 *     unfiltered.
 *
 * `useLibrarySearch` settles the term for ~250 ms and reports when there is nothing to
 * search for, so the caller can park the query on a cheap stand-in instead.
 */

import { useEffect, useMemo, useState } from "react";

export type LibrarySearch = {
  /** The settled term, trimmed. Empty when there is nothing to search for. */
  needle: string;
  /** True when `needle` is empty — the caller should skip the query entirely. */
  idle: boolean;
  /** `needle` as a LIKE pattern with wildcards escaped. Empty when idle. */
  pattern: string;
};

export function useLibrarySearch(query: string, delayMs = 250): LibrarySearch {
  const trimmed = query.trim();
  const [needle, setNeedle] = useState(trimmed);

  useEffect(() => {
    // Clearing the box is not a search, so it takes effect at once — waiting would
    // leave the last term's results on screen after the text is gone.
    if (trimmed === "") {
      setNeedle("");
      return;
    }
    const timer = setTimeout(() => setNeedle(trimmed), delayMs);
    return () => clearTimeout(timer);
  }, [trimmed, delayMs]);

  return useMemo(
    () => ({
      needle,
      idle: needle === "",
      // Escaped so a title with a literal % or _ still matches itself; the queries
      // declare `escape '\'` to match.
      pattern: needle === "" ? "" : `%${needle.replace(/[\\%_]/g, "\\$&")}%`,
    }),
    [needle],
  );
}
