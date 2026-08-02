/**
 * Tags, Ratings and Viewings — the three things people put on a Title.
 *
 * They are together because they are one concept in the filter language and three in
 * the schema, and the difference between them is worth keeping in view:
 *
 *   - a **Tag** belongs to a Household and carries no value
 *   - a **Rating** belongs to a User and travels with them between Households
 *   - a **Viewing** belongs to a User and is one sitting, so rewatches are separate rows
 */

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import type { RatingRow, TagRow, ViewingRow } from "../schema";
import { newId } from "../ids";
import { date, timestamp } from "../time";

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** A Household's tag vocabulary, with how many Titles carry each. `[householdId]`. */
export const TAGS_FOR_HOUSEHOLD = `
  select t.*, (select count(*) from title_tag tt where tt.tag_id = t.id) as title_count
  from tag t
  where t.household_id = ?
  order by t.name
`;

/** Tags a Household has put on one Title. Parameters: `[householdId, titleId]`. */
export const TAGS_FOR_TITLE = `
  select t.*
  from title_tag tt
  join tag t on t.id = tt.tag_id
  where tt.household_id = ? and tt.title_id = ?
  order by t.name
`;

/**
 * Finds a Household's Tag by name, or coins it. Case-insensitive, matching the unique
 * index in Postgres, so `Cozy` and `cozy` are the same Tag.
 */
export async function findOrCreateTag(
  db: AbstractPowerSyncDatabase,
  householdId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A tag needs a name");

  const existing = await db.getOptional<{ id: string }>(
    `select id from tag where household_id = ? and lower(name) = lower(?)`,
    [householdId, trimmed],
  );
  if (existing) return existing.id;

  const id = newId();
  await db.execute(`insert into tag (id, household_id, name) values (?, ?, ?)`, [
    id,
    householdId,
    trimmed,
  ]);
  return id;
}

export async function tagTitle(
  db: AbstractPowerSyncDatabase,
  input: { householdId: string; titleId: string; tagId: string },
): Promise<void> {
  const existing = await db.getOptional<{ id: string }>(
    `select id from title_tag where household_id = ? and title_id = ? and tag_id = ?`,
    [input.householdId, input.titleId, input.tagId],
  );
  if (existing) return;

  await db.execute(
    `insert into title_tag (id, household_id, title_id, tag_id) values (?, ?, ?, ?)`,
    [newId(), input.householdId, input.titleId, input.tagId],
  );
}

export async function untagTitle(
  db: AbstractPowerSyncDatabase,
  input: { householdId: string; titleId: string; tagId: string },
): Promise<void> {
  await db.execute(
    `delete from title_tag where household_id = ? and title_id = ? and tag_id = ?`,
    [input.householdId, input.titleId, input.tagId],
  );
}

/** Deletes a Tag and removes it from every Title. */
export async function deleteTag(
  db: AbstractPowerSyncDatabase,
  tagId: string,
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute(`delete from title_tag where tag_id = ?`, [tagId]);
    await tx.execute(`delete from tag where id = ?`, [tagId]);
  });
}

export async function tagsForHousehold(
  db: AbstractPowerSyncDatabase,
  householdId: string,
): Promise<(TagRow & { title_count: number })[]> {
  return db.getAll(TAGS_FOR_HOUSEHOLD, [householdId]);
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

/** One User's Ratings for a Title, across every Category. `[userId, titleId]`. */
export const RATINGS_BY_USER_FOR_TITLE = `
  select r.*, c.name as category_name
  from rating r
  join rating_category c on c.id = r.category_id
  where r.user_id = ? and r.title_id = ?
  order by c.name
`;

/**
 * Every Household member's Ratings for a Title, for the "what did everyone think"
 * view. Parameters: `[titleId, householdId]`.
 */
export const RATINGS_FOR_TITLE_IN_HOUSEHOLD = `
  select r.*, c.name as category_name, u.display_name
  from rating r
  join rating_category c on c.id = r.category_id
  join app_user u on u.id = r.user_id
  join household_member hm on hm.user_id = r.user_id
  where r.title_id = ? and hm.household_id = ?
  order by c.name, u.display_name
`;

/**
 * Sets a User's score for one Title on one Category, replacing any existing one.
 *
 * The 1–10 bound is checked here because SQLite carries no check constraint. Without
 * it, a 47 inserts locally, reads back everywhere as though it were real, and fails
 * only on upload.
 */
export async function rate(
  db: AbstractPowerSyncDatabase,
  input: { userId: string; titleId: string; categoryId: string; value: number },
): Promise<void> {
  if (!Number.isInteger(input.value) || input.value < 1 || input.value > 10) {
    throw new Error(`A rating must be a whole number from 1 to 10, got ${input.value}`);
  }

  const existing = await db.getOptional<{ id: string }>(
    `select id from rating where user_id = ? and title_id = ? and category_id = ?`,
    [input.userId, input.titleId, input.categoryId],
  );
  const now = timestamp();

  if (existing) {
    await db.execute(`update rating set value = ?, updated_at = ? where id = ?`, [
      input.value,
      now,
      existing.id,
    ]);
    return;
  }

  await db.execute(
    `insert into rating (id, user_id, title_id, category_id, value, updated_at)
     values (?, ?, ?, ?, ?, ?)`,
    [newId(), input.userId, input.titleId, input.categoryId, input.value, now],
  );
}

export async function clearRating(
  db: AbstractPowerSyncDatabase,
  input: { userId: string; titleId: string; categoryId: string },
): Promise<void> {
  await db.execute(
    `delete from rating where user_id = ? and title_id = ? and category_id = ?`,
    [input.userId, input.titleId, input.categoryId],
  );
}

export async function ratingsByUser(
  db: AbstractPowerSyncDatabase,
  userId: string,
  titleId: string,
): Promise<(RatingRow & { category_name: string })[]> {
  return db.getAll(RATINGS_BY_USER_FOR_TITLE, [userId, titleId]);
}

// ---------------------------------------------------------------------------
// Viewings
// ---------------------------------------------------------------------------

/** A User's Viewings of a Title, most recent first. `[userId, titleId]`. */
export const VIEWINGS_BY_USER_FOR_TITLE = `
  select * from viewing where user_id = ? and title_id = ? order by watched_on desc
`;

/**
 * Records that a User watched a Title on a given day.
 *
 * Deliberately not idempotent and deliberately not keyed on (title, user): rewatches
 * are separate rows, which is what makes watch count, recency and watched-ness all
 * derivable rather than stored. Watching something twice in one day is a real thing.
 */
export async function recordViewing(
  db: AbstractPowerSyncDatabase,
  input: { userId: string; titleId: string; watchedOn?: Date },
): Promise<string> {
  const id = newId();
  await db.execute(
    `insert into viewing (id, title_id, user_id, watched_on, created_at)
     values (?, ?, ?, ?, ?)`,
    [id, input.titleId, input.userId, date(input.watchedOn), timestamp()],
  );
  return id;
}

export async function deleteViewing(
  db: AbstractPowerSyncDatabase,
  viewingId: string,
): Promise<void> {
  await db.execute(`delete from viewing where id = ?`, [viewingId]);
}

export async function viewingsByUser(
  db: AbstractPowerSyncDatabase,
  userId: string,
  titleId: string,
): Promise<ViewingRow[]> {
  return db.getAll<ViewingRow>(VIEWINGS_BY_USER_FOR_TITLE, [userId, titleId]);
}
