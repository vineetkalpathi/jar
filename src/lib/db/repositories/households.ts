/**
 * Households, membership, and the vocabulary a Household activates.
 *
 * Reads are exported as SQL so a caller can hand them to `useQuery` and get a live
 * result that re-runs when the underlying rows change. Writes are functions. That split
 * is what makes the UI reactive without the repository knowing React exists.
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import { STARTER_RATING_CATEGORIES } from "../../rating-categories";
import type { HouseholdRow, RatingCategoryRow } from "../schema";
import { requiredText } from "../constraints";
import { newId } from "../ids";
import { findOrInsert } from "../upsert";
import { timestamp } from "../../time";

/** Households the signed-in user belongs to. Parameters: `[userId]`. */
export const HOUSEHOLDS_FOR_USER = `
  select h.*
  from household h
  join household_member hm on hm.household_id = h.id
  where hm.user_id = ?
  order by h.name
`;

/** Everyone in a Household, with their display names. Parameters: `[householdId]`. */
export const MEMBERS_OF_HOUSEHOLD = `
  select u.id, u.display_name, hm.joined_at
  from household_member hm
  join app_user u on u.id = hm.user_id
  where hm.household_id = ?
  order by u.display_name
`;

/**
 * The Rating Categories a Household has activated, which is what the rating UI and the
 * filter builder offer. Archived Categories stay visible so existing Ratings and
 * Filters keep their meaning. Parameters: `[householdId]`.
 */
export const CATEGORIES_FOR_HOUSEHOLD = `
  select c.*
  from household_category hc
  join rating_category c on c.id = hc.category_id
  where hc.household_id = ?
  order by c.archived_at is not null, c.name
`;

/**
 * Creates a Household, makes its creator the first member, and activates the starter
 * Rating Categories.
 *
 * All three in one local transaction, and all three on the device. Doing this as a
 * Postgres function would be tempting and wrong: writes go through PowerSync's upload
 * queue, so an RPC would need connectivity and household creation must work offline.
 *
 * The starter Category ids are compile-time constants for exactly this reason — the
 * `household_category` rows can reference them before the `categories` sync stream has
 * delivered a single row, and the foreign key still holds when the write reaches
 * Postgres, because the Categories are seeded there by migration.
 */
export async function createHousehold(
  db: AbstractPowerSyncDatabase,
  input: { name: string; userId: string },
): Promise<string> {
  const name = requiredText(input.name, "A household");

  const householdId = newId();
  const now = timestamp();

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `insert into household (id, name, rating_coverage, rating_aggregator, created_at)
       values (?, ?, ?, ?, ?)`,
      // Lenient defaults, matching the Postgres column defaults, so jars stay useful
      // while ratings are sparse.
      [householdId, name, "any", "avg", now],
    );

    await tx.execute(
      `insert into household_member (id, household_id, user_id, joined_at)
       values (?, ?, ?, ?)`,
      [newId(), householdId, input.userId, now],
    );

    for (const category of STARTER_RATING_CATEGORIES) {
      await tx.execute(
        `insert into household_category (id, household_id, category_id) values (?, ?, ?)`,
        [newId(), householdId, category.id],
      );
    }
  });

  return householdId;
}

export async function renameHousehold(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  name: string,
): Promise<void> {
  await db.execute(`update household set name = ? where id = ?`, [
    requiredText(name, "A household"),
    householdId,
  ]);
}

/**
 * Sets the Household's Rating Policy — how several members' Ratings resolve to one
 * answer in a Filter.
 *
 * This changes what existing Jars mean, and deliberately so: a predicate that omits
 * `coverage` or `aggregator` inherits from here rather than freezing a value at save
 * time (ADR-0009). Worth saying plainly in the UI.
 */
export async function setRatingPolicy(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  policy: { coverage: "any" | "all"; aggregator: "avg" | "min" | "max" },
): Promise<void> {
  await db.execute(
    `update household set rating_coverage = ?, rating_aggregator = ? where id = ?`,
    [policy.coverage, policy.aggregator, householdId],
  );
}

/** Activates a Rating Category for a Household, or does nothing if already active. */
export async function activateCategory(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  categoryId: string,
): Promise<void> {
  await findOrInsert(db, {
    table: "household_category",
    where: {
      sql: "household_id = ? and category_id = ?",
      params: [householdId, categoryId],
    },
    row: { household_id: householdId, category_id: categoryId },
  });
}

export async function deactivateCategory(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  categoryId: string,
): Promise<void> {
  await db.execute(
    `delete from household_category where household_id = ? and category_id = ?`,
    [householdId, categoryId],
  );
}

export async function getHousehold(
  db: AbstractPowerSyncDatabase,
  householdId: string,
): Promise<HouseholdRow | null> {
  return db.getOptional<HouseholdRow>(`select * from household where id = ?`, [
    householdId,
  ]);
}

export async function memberIds(
  db: AbstractPowerSyncDatabase,
  householdId: string,
): Promise<string[]> {
  const rows = await db.getAll<{ user_id: string }>(
    `select user_id from household_member where household_id = ? order by user_id`,
    [householdId],
  );
  return rows.map((r) => r.user_id);
}

export async function activeCategories(
  db: AbstractPowerSyncDatabase,
  householdId: string,
): Promise<RatingCategoryRow[]> {
  return db.getAll<RatingCategoryRow>(CATEGORIES_FOR_HOUSEHOLD, [householdId]);
}
