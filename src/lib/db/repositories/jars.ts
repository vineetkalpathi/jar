/**
 * Jars, their Filters, and what is actually in them.
 *
 * The interesting function here is `jarContentsQuery`, which is where the filter
 * compiler meets real data. Everything else is bookkeeping around it.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import {
  compileJarContents,
  parseFilter,
  type CompiledQuery,
  type CompileContext,
  type Filter,
} from "../../filter";
import type { JarRow, TitleRow } from "../schema";
import { requiredText } from "../constraints";
import { newId } from "../ids";
import { timestamp } from "../time";
import { getHousehold, memberIds } from "./households";

/** Jars belonging to a Household. Parameters: `[householdId]`. */
export const JARS_FOR_HOUSEHOLD = `
  select * from jar where household_id = ? order by name
`;

export class JarFilterError extends Error {}

/**
 * Resolves everything a Filter needs that isn't in the Filter itself: whose Library to
 * search, who counts as "the Household" for a rating or viewing predicate, and the
 * Rating Policy that unset modifiers inherit.
 *
 * Read fresh each time rather than cached, because a predicate omitting `coverage`
 * inherits the Household's current policy — that is what makes changing the policy
 * change what existing Jars mean (ADR-0009).
 */
export async function loadCompileContext(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  jarId?: string,
): Promise<CompileContext> {
  const household = await getHousehold(db, householdId);
  if (!household) throw new Error(`No household ${householdId}`);

  return {
    householdId,
    jarId,
    members: await memberIds(db, householdId),
    coverage: (household.rating_coverage ?? "any") as "any" | "all",
    aggregator: (household.rating_aggregator ?? "avg") as "avg" | "min" | "max",
  };
}

/**
 * Parses a Jar's stored filter.
 *
 * A stored Filter that no longer validates is an error rather than a null filter.
 * Treating it as "no filter" would quietly turn the Jar into its Pins alone, which
 * looks like data loss and gives no clue why.
 */
export function parseJarFilter(jar: Pick<JarRow, "id" | "filter">): Filter | null {
  if (jar.filter == null || jar.filter === "") return null;

  const result = parseFilter(jar.filter);
  if (!result.ok) {
    const detail = result.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    throw new JarFilterError(`Jar ${jar.id} has an unreadable filter — ${detail}`);
  }

  return result.value;
}

/**
 * The SQL selecting a Jar's contents, as full Title rows.
 *
 * Returned rather than executed so the caller can hand it to `useQuery` and get a
 * result that updates as the Library, Ratings and Viewings underneath it change.
 */
export async function jarContentsQuery(
  db: AbstractPowerSyncDatabase,
  jarId: string,
): Promise<CompiledQuery> {
  const jar = await db.getOptional<JarRow>(`select * from jar where id = ?`, [jarId]);
  if (!jar) throw new Error(`No jar ${jarId}`);

  const contents = compileJarContents(
    { id: jar.id, filter: parseJarFilter(jar) },
    await loadCompileContext(db, jar.household_id!, jar.id),
  );

  return {
    sql: `select t.* from title t where t.id in (${contents.sql}) order by t.name`,
    params: contents.params,
  };
}

/** A Jar's contents, resolved once. Use `jarContentsQuery` where reactivity matters. */
export async function jarContents(
  db: AbstractPowerSyncDatabase,
  jarId: string,
): Promise<TitleRow[]> {
  const { sql, params } = await jarContentsQuery(db, jarId);
  return db.getAll<TitleRow>(sql, params);
}

export async function createJar(
  db: AbstractPowerSyncDatabase,
  input: { householdId: string; name: string; filter?: Filter | null },
): Promise<string> {
  const name = requiredText(input.name, "A jar");

  const id = newId();
  await db.execute(
    `insert into jar (id, household_id, name, filter, created_at) values (?, ?, ?, ?, ?)`,
    [id, input.householdId, name, serialiseFilter(input.filter), timestamp()],
  );
  return id;
}

export async function renameJar(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  name: string,
): Promise<void> {
  await db.execute(`update jar set name = ? where id = ?`, [
    requiredText(name, "A jar"),
    jarId,
  ]);
}

/** Replaces a Jar's Filter. `null` makes it hand-curated: its Pins alone. */
export async function setJarFilter(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  filter: Filter | null,
): Promise<void> {
  await db.execute(`update jar set filter = ? where id = ?`, [
    serialiseFilter(filter),
    jarId,
  ]);
}

export async function deleteJar(
  db: AbstractPowerSyncDatabase,
  jarId: string,
): Promise<void> {
  // No cascade locally — SQLite has no foreign keys here, so the overrides and draws
  // Postgres would clean up have to be removed explicitly.
  await db.writeTransaction(async (tx) => {
    await tx.execute(`delete from jar_override where jar_id = ?`, [jarId]);
    await tx.execute(
      `delete from draw_candidate where draw_id in (select id from draw where jar_id = ?)`,
      [jarId],
    );
    await tx.execute(
      `delete from draw_participant where draw_id in (select id from draw where jar_id = ?)`,
      [jarId],
    );
    await tx.execute(`delete from draw where jar_id = ?`, [jarId]);
    await tx.execute(`delete from jar where id = ?`, [jarId]);
  });
}

/**
 * Pins a Title into a Jar regardless of its Filter, or Excludes one despite it
 * matching.
 *
 * The two share a row, so setting one clears the other — which is the point: a Title
 * may not be both, and rejecting a Title should never require lying about its Tags.
 */
export async function setOverride(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  titleId: string,
  kind: "pin" | "exclusion",
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute(`delete from jar_override where jar_id = ? and title_id = ?`, [
      jarId,
      titleId,
    ]);
    await tx.execute(
      `insert into jar_override (id, jar_id, title_id, kind) values (?, ?, ?, ?)`,
      [newId(), jarId, titleId, kind],
    );
  });
}

export async function clearOverride(
  db: AbstractPowerSyncDatabase,
  jarId: string,
  titleId: string,
): Promise<void> {
  await db.execute(`delete from jar_override where jar_id = ? and title_id = ?`, [
    jarId,
    titleId,
  ]);
}

/**
 * A Jar with no Filter stores SQL NULL, never an empty tree — an empty group would be
 * ambiguous about whether it matches everything or nothing (ADR-0009).
 */
function serialiseFilter(filter: Filter | null | undefined): string | null {
  return filter ? JSON.stringify(filter) : null;
}
