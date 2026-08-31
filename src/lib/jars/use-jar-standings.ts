/**
 * A Title's standing in every Jar of a Household, live: Pinned in, Hidden, present via
 * the Filter, or none of those.
 *
 * ## Why this is plural
 *
 * It used to be `useJarStanding`, one Jar per call, and the Title screen mounted it
 * once per Jar — twice over, because the count badge and the pin button each kept their
 * own set of hidden probes computing the identical answer, and a third time whenever
 * the pin sheet opened. Each probe was two watched queries, one of them a compiled
 * Filter over the whole Library. Six Jars therefore meant two dozen live queries on one
 * screen, every one of them re-running on every write anywhere in the app.
 *
 * Asking for every Jar at once collapses that to two subscriptions total, whatever the
 * Jar count: one union of the per-Jar membership tests (`jarMembershipQuery`) and one
 * pass over the Title's overrides. Call it once per screen and pass the result down.
 */

import { useQuery, usePowerSync } from "@powersync/react";
import { useEffect, useMemo, useState } from "react";
import { jars, type JarRow } from "@/lib/db";
import type { CompiledQuery } from "@/lib/filter";

export type JarStanding =
  | "pinned"
  | "hidden"
  | "present"
  | "absent"
  | "resolving";

export type JarStandings = {
  /** The Household's Jars, in the order the grid shows them. */
  jars: JarRow[];
  /** This Title's standing in one of them. Unknown Jars read as `resolving`. */
  standing: (jarId: string) => JarStanding;
  /** True once every Jar has an answer — what a tally should wait for. */
  settled: boolean;
};

/** Valid, cheap, returns nothing — used before the compiled query exists. */
const NO_QUERY = "select null as jar_id where 0";
/** A stable empty params reference, so `useQuery` doesn't re-subscribe every render. */
const NO_PARAMS: never[] = [];

export function useJarStandings(
  householdId: string,
  titleId: string,
): JarStandings {
  const db = usePowerSync();

  const { data: jarRows } = useQuery<JarRow>(jars.JARS_FOR_HOUSEHOLD, [
    householdId,
  ]);
  const { data: overrideRows } = useQuery<{ jar_id: string; kind: string }>(
    jars.OVERRIDES_FOR_TITLE,
    [titleId, householdId],
  );

  const [membership, setMembership] = useState<CompiledQuery | null>(null);
  const [unreadable, setUnreadable] = useState<Set<string>>(() => new Set());

  // Recompiled when a Jar is added or removed, and when any Filter changes — the row
  // identities alone would not catch an edit in place.
  const key = jarRows.map((jar) => `${jar.id}:${jar.filter ?? ""}`).join("|");

  useEffect(() => {
    let active = true;
    setMembership(null);

    jars
      .jarMembershipQuery(db, householdId, titleId)
      .then((result) => {
        if (!active) return;
        setMembership(result.query);
        setUnreadable(new Set(result.unreadable));
      })
      .catch((cause) => {
        // The Household went away, or its Rating Policy could not be read. Neither is
        // worth taking the screen down for: every Jar stays `resolving`.
        if (active)
          console.warn(`[jars] could not read standings for ${titleId}:`, cause);
      });

    return () => {
      active = false;
    };
    // `key` stands in for jarRows, which is a new array on every result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, titleId, key]);

  const { data: memberRows } = useQuery<{ jar_id: string }>(
    membership ? membership.sql : NO_QUERY,
    membership ? membership.params : NO_PARAMS,
  );

  const containing = useMemo(
    () => new Set(memberRows.map((row) => row.jar_id)),
    [memberRows],
  );

  const overrides = useMemo(
    () => new Map(overrideRows.map((row) => [row.jar_id, row.kind])),
    [overrideRows],
  );

  return useMemo(() => {
    const standing = (jarId: string): JarStanding => {
      // An override settles it outright, and does so before the compile lands — which
      // is what keeps a pin's filled state instant rather than waiting on a requery.
      const override = overrides.get(jarId);
      if (override === "pin") return "pinned";
      if (override === "exclusion") return "hidden";

      if (membership == null || unreadable.has(jarId)) return "resolving";
      return containing.has(jarId) ? "present" : "absent";
    };

    return {
      jars: jarRows,
      standing,
      settled:
        membership != null &&
        jarRows.every((jar) => standing(jar.id) !== "resolving"),
    };
  }, [jarRows, overrides, containing, membership, unreadable]);
}
