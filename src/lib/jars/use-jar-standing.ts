/**
 * A Title's standing in one Jar, live: Pinned in, Hidden, present via the Filter, or
 * none of those.
 *
 * Same shape as `useJarCount` — an override lookup settles it outright, and only when
 * there is no override does the Jar's Filter get compiled (async, in an effect) and then
 * watched for whether this Title falls in its contents.
 */

import { useQuery, usePowerSync } from "@powersync/react";
import { useEffect, useState } from "react";
import { jars, type JarRow } from "@/lib/db";
import type { CompiledQuery } from "@/lib/filter";

export type JarStanding =
  "pinned" | "hidden" | "present" | "absent" | "resolving";

/** Valid, cheap, returns nothing — used before the compiled query exists. */
const NO_QUERY = "select 0 as n limit 0";

export function useJarStanding(
  jar: Pick<JarRow, "id" | "filter">,
  titleId: string,
): JarStanding {
  const db = usePowerSync();
  const [compiled, setCompiled] = useState<CompiledQuery | null>(null);

  const { data: overrideRows } = useQuery<{ kind: string }>(
    jars.OVERRIDE_FOR_JAR_TITLE,
    [jar.id, titleId],
  );
  const overrideKind = overrideRows[0]?.kind as "pin" | "exclusion" | undefined;

  useEffect(() => {
    if (overrideKind) return; // an override settles it; no need to compile
    let active = true;
    setCompiled(null);

    jars
      .jarContentsQuery(db, jar.id)
      .then((query) => {
        if (active) setCompiled(query);
      })
      .catch((cause) => {
        if (active)
          console.warn(`[jars] could not read standing for ${jar.id}:`, cause);
      });

    return () => {
      active = false;
    };
  }, [db, jar.id, jar.filter, overrideKind]);

  const { data } = useQuery<{ n: number }>(
    compiled && !overrideKind
      ? `select count(*) as n from (${compiled.sql}) where id = ?`
      : NO_QUERY,
    compiled && !overrideKind ? [...compiled.params, titleId] : [],
  );

  if (overrideKind === "pin") return "pinned";
  if (overrideKind === "exclusion") return "hidden";
  if (compiled == null) return "resolving";
  return data.length > 0 && data[0].n > 0 ? "present" : "absent";
}
