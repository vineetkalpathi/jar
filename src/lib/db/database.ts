/**
 * The local database, and the one place that knows how it is opened.
 *
 * Everything above this file — repositories, the filter compiler, the UI — talks to a
 * PowerSync database handle and nothing else. That seam is what makes adding web later
 * a matter of swapping this module for a `@powersync/web` equivalent rather than
 * touching anything that uses it.
 */

import { PowerSyncDatabase } from "@powersync/react-native";
import { SupabaseConnector } from "./connector";
import { AppSchema } from "./schema";

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: "jar.db" },
});

let connecting: Promise<void> | null = null;

/**
 * Starts syncing. Idempotent, because both the auth listener and app startup have a
 * reason to call it and connecting twice throws.
 */
export function connectSync(): Promise<void> {
  connecting ??= db.connect(new SupabaseConnector());
  return connecting;
}

/** Stops syncing and forgets the local replica. Call this on sign-out. */
export async function disconnectAndClear(): Promise<void> {
  connecting = null;
  await db.disconnectAndClear();
}

export { AppSchema } from "./schema";
export type * from "./schema";
