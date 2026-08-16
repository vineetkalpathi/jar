/**
 * The bridge between the local replica and Supabase.
 *
 * Two jobs, per docs/powersync.md §5: hand PowerSync a fresh Supabase token so it can
 * authenticate a sync connection, and drain the local write queue through the Data API
 * — which is where the RLS policies apply. Reads never come through here.
 *
 * ## Why error classification matters more than it looks
 *
 * The upload queue is strictly ordered and blocking. Throwing tells PowerSync "retry
 * later", which is right for a flat tyre — no network, a 5xx, an expired token. It is
 * wrong for anything that can never succeed: a rejected write retried forever wedges
 * the queue, and every subsequent local change silently stops reaching the server while
 * the app carries on looking fine. Those have to be dropped and logged instead.
 */

import {
  UpdateType,
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
} from "@powersync/react-native";
import { supabase } from "./supabase";

const POWERSYNC_URL = process.env.EXPO_PUBLIC_POWERSYNC_URL;

/**
 * Postgres SQLSTATEs that will fail identically on every retry.
 *
 * `23505` is the one that is expected rather than exceptional. The join tables carry
 * surrogate ids, so two devices doing the same thing offline — both adding a Title to
 * the Library, both tagging it `cozy` — generate two rows with different ids and the
 * same natural key. The second upload violates the unique constraint, and that means
 * "already applied". Dropping it is the convergence rule, not error recovery.
 * See docs/powersync.md.
 */
const PERMANENT_FAILURES = new Set([
  "23505", // unique_violation — already applied; see above
  "23502", // not_null_violation
  "23503", // foreign_key_violation — the referent is gone, not late: order is preserved
  "23514", // check_violation — e.g. a rating outside 1–10
  "22P02", // invalid_text_representation — a malformed uuid or enum
  "42501", // insufficient_privilege — RLS refused it, and will again
]);

function isPermanent(error: { code?: string } | null): boolean {
  return !!error?.code && PERMANENT_FAILURES.has(error.code);
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    if (!POWERSYNC_URL) {
      throw new Error(
        "EXPO_PUBLIC_POWERSYNC_URL must be set — see .env.example and docs/powersync.md",
      );
    }

    // Deliberately not cached: getSession refreshes an expired token, and a stale one
    // fails the sync handshake rather than reconnecting.
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) return null; // signed out — PowerSync waits rather than retrying

    return {
      endpoint: POWERSYNC_URL,
      token: data.session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    for (const op of transaction.crud) {
      const error = await this.apply(op);

      if (!error) continue;

      if (isPermanent(error)) {
        // Completing the transaction discards it. The local row stays as it is and
        // will be corrected by the next sync from the server, which is authoritative.
        console.warn(
          `[sync] dropping ${op.op} on ${op.table}/${op.id}: ${error.code} ${error.message}`,
        );
        continue;
      }

      // Transient. Leave the transaction on the queue and let PowerSync retry it whole.
      throw error;
    }

    await transaction.complete();
  }

  /** Returns the error rather than throwing, so the caller decides retry or drop. */
  private async apply(op: CrudEntry): Promise<{ code?: string; message: string } | null> {
    const table = supabase.from(op.table);

    switch (op.op) {
      case UpdateType.PUT: {
        // `id` lives in the entry rather than in opData, and every table has a real id
        // column in Postgres, so this needs no per-table translation.
        //
        // Must stay a plain insert. `upsert` (ON CONFLICT) and `return=representation`
        // (RETURNING) both make Postgres apply the table's SELECT policy to the new
        // row, and `household_select` requires a membership that does not exist yet —
        // so creating a household 42501s and is dropped. A re-upload then surfaces as
        // 23505 instead of merging, which is the convergence rule above.
        const { error } = await table.insert({ ...op.opData, id: op.id });
        return error;
      }
      case UpdateType.PATCH: {
        // A PATCH carries only the changed columns. No columns means nothing to send —
        // PostgREST rejects an empty body rather than treating it as a no-op.
        if (!op.opData || Object.keys(op.opData).length === 0) return null;
        const { error } = await table.update(op.opData).eq("id", op.id);
        return error;
      }
      case UpdateType.DELETE: {
        const { error } = await table.delete().eq("id", op.id);
        return error;
      }
    }
  }
}
