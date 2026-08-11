/**
 * Insert-unless-it-exists, which four repositories were each writing out longhand.
 *
 * A word on what this does and does not promise. SQLite carries none of the unique
 * constraints the schema declares, so the lookup is a courtesy that avoids the common
 * case — not a guarantee. Two devices doing the same thing offline still produce two
 * rows with one natural key; Postgres rejects the second on upload and the connector
 * drops it as already applied. That is the actual convergence mechanism, and it is in
 * `connector.ts`, not here.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import { newId } from "./ids";

type SqlValue = string | number | null;

/**
 * Returns the id of the row matching `where`, inserting `row` first if there is none.
 *
 * `table` and the column names in `row` are interpolated into SQL rather than bound.
 * Every call site passes literals from this module's own callers — no value reaching
 * this function from a user ever names a table or a column, and everything that does
 * come from a user is bound.
 */
export async function findOrInsert(
  db: AbstractPowerSyncDatabase,
  spec: {
    table: string;
    where: { sql: string; params: SqlValue[] };
    row: Record<string, SqlValue>;
  },
): Promise<string> {
  const existing = await db.getOptional<{ id: string }>(
    `select id from ${spec.table} where ${spec.where.sql}`,
    spec.where.params,
  );
  if (existing) return existing.id;

  const row = { id: newId(), ...spec.row };
  const columns = Object.keys(row);

  await db.execute(
    `insert into ${spec.table} (${columns.join(", ")}) values (${columns
      .map(() => "?")
      .join(", ")})`,
    Object.values(row),
  );

  return row.id as string;
}
