/**
 * How many Titles are in a Jar, live.
 *
 * A Jar's contents are not stored — they are its Filter evaluated over the Library,
 * plus Pins, minus Exclusions. So the count is a compiled query, and it has to be
 * recompiled whenever the Filter changes and re-run whenever the Library, Ratings or
 * Viewings underneath it change.
 *
 * Two steps, and both matter:
 *
 * 1. Compiling is async (it reads the Household's Rating Policy and membership), so it
 *    cannot happen during render. It runs in an effect and the result is held.
 * 2. Running is a watched query, which is what makes the fill level rise on its own
 *    when a Title is added rather than on the next visit to the screen.
 */

import { useQuery, usePowerSync } from "@powersync/react";
import { useEffect, useState } from "react";
import { jars, type JarRow } from "@/lib/db";
import type { CompiledQuery } from "@/lib/filter";

/** A query that is valid, cheap, and returns nothing — used before the real one exists. */
const NO_QUERY = "select 0 as n limit 0";

export function useJarCount(jar: Pick<JarRow, "id" | "filter">): number | null {
  const db = usePowerSync();
  const [compiled, setCompiled] = useState<CompiledQuery | null>(null);

  // Keyed on the filter as well as the id: editing a Jar's Filter must recompile, and
  // the row identity alone would not change.
  useEffect(() => {
    let active = true;
    setCompiled(null);

    jars
      .jarContentsQuery(db, jar.id)
      .then((query) => {
        if (active) setCompiled(query);
      })
      .catch((cause) => {
        // An unreadable Filter, or a Jar deleted mid-flight. Neither is worth taking
        // the screen down for — the tile shows no count and everything else works.
        if (active) console.warn(`[jars] could not count ${jar.id}:`, cause);
      });

    return () => {
      active = false;
    };
  }, [db, jar.id, jar.filter]);

  const { data } = useQuery<{ n: number }>(
    compiled ? `select count(*) as n from (${compiled.sql})` : NO_QUERY,
    compiled?.params ?? [],
  );

  return compiled && data.length > 0 ? data[0].n : null;
}
