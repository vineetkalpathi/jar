/**
 * Values the local replica needs that Postgres would otherwise have supplied.
 *
 * SQLite carries no defaults here, so anything a Postgres column defaults to —
 * `gen_random_uuid()`, `now()` — has to be written explicitly by the repository. The
 * server's default still applies to rows created server-side; these are for rows
 * created on the device, which is most of them.
 */

import { randomUUID } from "expo-crypto";

/**
 * A client-generated id.
 *
 * Every table's primary key is generated here rather than by Postgres. It has to be:
 * a row is written locally and read back long before it reaches the server, and
 * `RETURNING` is not available on `household` anyway because its select policy
 * requires a membership that does not exist yet (docs/database.md).
 */
export function newId(): string {
  return randomUUID();
}

/**
 * A timestamp in SQLite's canonical form, `YYYY-MM-DD HH:MM:SS` in UTC.
 *
 * Not `toISOString()`: the filter compiler compares times through `julianday()`, which
 * is particular about what it will parse. Writing one unambiguous form locally keeps
 * device-written rows directly comparable.
 *
 * Rows arriving from Postgres are rendered by PowerSync rather than by us, so the
 * compiler normalises whatever it finds before parsing — see `compile.ts`.
 */
export function timestamp(at: Date = new Date()): string {
  return at.toISOString().slice(0, 19).replace("T", " ");
}

/** A calendar date, `YYYY-MM-DD`. Used for `viewing.watched_on`. */
export function date(on: Date = new Date()): string {
  return on.toISOString().slice(0, 10);
}
