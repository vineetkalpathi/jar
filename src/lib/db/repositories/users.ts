/**
 * The signed-in User's own row.
 *
 * `app_user` is deliberately separate from `auth.users`, which owns authentication and
 * is not replicated. The row itself is provisioned server-side, by a trigger on
 * `auth.users` insert (`provision_app_user_on_signup` in the initial migration) — not
 * by the client — so there is no local "create" path here, only reads and the
 * user-initiated rename.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import type { AppUserRow } from "../schema";
import { requiredText } from "../constraints";

/** The signed-in User. Parameters: `[userId]`. */
export const USER_BY_ID = `select * from app_user where id = ?`;

export async function renameUser(
  db: AbstractPowerSyncDatabase,
  userId: string,
  displayName: string,
): Promise<void> {
  await db.execute(`update app_user set display_name = ? where id = ?`, [
    requiredText(displayName, "A display name"),
    userId,
  ]);
}

export async function getUser(
  db: AbstractPowerSyncDatabase,
  userId: string,
): Promise<AppUserRow | null> {
  return db.getOptional<AppUserRow>(USER_BY_ID, [userId]);
}
