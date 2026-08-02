import { randomUUID } from "expo-crypto";

/**
 * A client-generated id.
 *
 * Every primary key is generated here rather than by Postgres. It has to be: a row is
 * written locally and read back long before it reaches the server, and `RETURNING` is
 * not available on `household` anyway, because its select policy requires a membership
 * that does not exist yet (docs/database.md).
 */
export function newId(): string {
  return randomUUID();
}
