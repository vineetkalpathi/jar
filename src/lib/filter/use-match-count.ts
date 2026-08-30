/**
 * What a Filter matches in the Library, live.
 *
 * `useFilterMatches` returns the matching Title ids (and their count); the builder's
 * footer uses `useFilterMatchCount` for just the number. Same two-step shape as
 * `useJarCount` (`src/lib/jars/use-jar-count.ts`): compiling reads the Household's
 * Rating Policy and membership so it runs in an effect, and the query itself is watched
 * so the result tracks the Library, Ratings and Viewings changing underneath it.
 *
 * The caller passes a Filter it has already validated with `parseFilter`, or `null`.
 * `null` is "no rules yet" and matches the whole Library rather than nothing — the
 * builder is a narrowing tool, and an empty one narrows to everything.
 */

import { useQuery, usePowerSync } from "@powersync/react";
import { useEffect, useMemo, useState } from "react";
import { compileFilter, type CompiledQuery, type Filter } from "./index";
import { jars } from "@/lib/db";

const NO_QUERY = "select null as title_id limit 0";

export type FilterMatches = {
  /** Matching Title ids, or null while the first compile is in flight or it failed. */
  ids: Set<string> | null;
  count: number | null;
  /** True between an input change and its result landing. */
  pending: boolean;
};

export function useFilterMatches(
  householdId: string,
  filter: Filter | null,
  jarId?: string,
): FilterMatches {
  const db = usePowerSync();
  const [compiled, setCompiled] = useState<CompiledQuery | null>(null);
  const [failed, setFailed] = useState(false);

  const key = filter ? JSON.stringify(filter) : null;

  useEffect(() => {
    let active = true;
    setCompiled(null);
    setFailed(false);

    if (!householdId) return;

    if (!filter) {
      setCompiled({
        sql: `select title_id from library_entry where household_id = ?`,
        params: [householdId],
      });
      return;
    }

    jars
      .loadCompileContext(db, householdId, jarId)
      .then((ctx) => {
        if (!active) return;
        setCompiled(compileFilter(filter, ctx));
      })
      .catch((cause) => {
        // A leaf that can't be previewed here — `lastDrawn` scoped to a jar that
        // doesn't exist yet is the known one. Saving still works; the count shows a dash.
        if (!active) return;
        setFailed(true);
        console.warn("[filter] could not compile for preview:", cause);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, jarId, key]);

  const { data } = useQuery<{ title_id: string }>(
    compiled ? compiled.sql : NO_QUERY,
    compiled?.params ?? [],
  );

  const ids = useMemo(
    () => (compiled && !failed ? new Set(data.map((r) => r.title_id)) : null),
    [compiled, failed, data],
  );

  return {
    ids,
    count: ids ? ids.size : null,
    pending: !failed && !compiled,
  };
}

export function useFilterMatchCount(
  householdId: string,
  filter: Filter | null,
  jarId?: string,
): { count: number | null; pending: boolean } {
  const { count, pending } = useFilterMatches(householdId, filter, jarId);
  return { count, pending };
}
