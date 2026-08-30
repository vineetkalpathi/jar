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
import { ratingValue, requiredText } from "../constraints";
import { newId } from "../ids";
import { findOrInsert } from "../upsert";
import {
  approxDate,
  date,
  timestamp,
  watchPrecision,
  type ApproxDateParts,
} from "../../time";

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
  const trimmed = requiredText(name, "A tag");

  return findOrInsert(db, {
    table: "tag",
    where: {
      sql: "household_id = ? and lower(name) = lower(?)",
      params: [householdId, trimmed],
    },
    row: { household_id: householdId, name: trimmed },
  });
}

export async function tagTitle(
  db: AbstractPowerSyncDatabase,
  input: { householdId: string; titleId: string; tagId: string },
): Promise<void> {
  await findOrInsert(db, {
    table: "title_tag",
    where: {
      sql: "household_id = ? and title_id = ? and tag_id = ?",
      params: [input.householdId, input.titleId, input.tagId],
    },
    row: {
      household_id: input.householdId,
      title_id: input.titleId,
      tag_id: input.tagId,
    },
  });
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
 * The 1–10 bound comes from `constraints.ts`, which mirrors `rating_value_range`.
 */
export async function rate(
  db: AbstractPowerSyncDatabase,
  input: { userId: string; titleId: string; categoryId: string; value: number },
): Promise<void> {
  const value = ratingValue(input.value);

  const existing = await db.getOptional<{ id: string }>(
    `select id from rating where user_id = ? and title_id = ? and category_id = ?`,
    [input.userId, input.titleId, input.categoryId],
  );
  const now = timestamp();

  if (existing) {
    await db.execute(`update rating set value = ?, updated_at = ? where id = ?`, [
      value,
      now,
      existing.id,
    ]);
    return;
  }

  await db.execute(
    `insert into rating (id, user_id, title_id, category_id, value, updated_at)
     values (?, ?, ?, ?, ?, ?)`,
    [newId(), input.userId, input.titleId, input.categoryId, value, now],
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
 * Records that a User watched a Title.
 *
 * With no `on`, it is just "seen" — the date is today at `day` precision but that is a
 * placeholder, not a claim. With `on`, the User has given a rough date: a year, maybe a
 * month; `watched_precision` records how much of it to trust (see `time.ts`).
 *
 * Deliberately not idempotent and not keyed on (title, user): rewatches are separate
 * rows, which is what makes watch count, recency and watched-ness all derivable rather
 * than stored. Watching something twice in one day is a real thing.
 */
export async function recordViewing(
  db: AbstractPowerSyncDatabase,
  input: { userId: string; titleId: string; on?: ApproxDateParts },
): Promise<string> {
  const id = newId();
  const watchedOn = input.on ? approxDate(input.on) : date();
  const precision = input.on ? watchPrecision(input.on) : "day";
  await db.execute(
    `insert into viewing (id, title_id, user_id, watched_on, watched_precision, created_at)
     values (?, ?, ?, ?, ?, ?)`,
    [id, input.titleId, input.userId, watchedOn, precision, timestamp()],
  );
  return id;
}

/** Re-dates an existing Viewing — the "set / refine the date" path on the Title screen. */
export async function setViewingDate(
  db: AbstractPowerSyncDatabase,
  viewingId: string,
  on: ApproxDateParts,
): Promise<void> {
  await db.execute(`update viewing set watched_on = ?, watched_precision = ? where id = ?`, [
    approxDate(on),
    watchPrecision(on),
    viewingId,
  ]);
}

export async function deleteViewing(
  db: AbstractPowerSyncDatabase,
  viewingId: string,
): Promise<void> {
  await db.execute(`delete from viewing where id = ?`, [viewingId]);
}

/**
 * Drops the User's most recent Viewing of a Title — the "un-mark" half of the seen
 * toggle. Only the latest row, so toggling a title seen then unseen doesn't wipe a
 * genuine rewatch history in one tap.
 */
export async function unmarkLatestViewing(
  db: AbstractPowerSyncDatabase,
  input: { userId: string; titleId: string },
): Promise<void> {
  await db.execute(
    `delete from viewing where id = (
       select id from viewing where user_id = ? and title_id = ?
       order by watched_on desc, created_at desc limit 1
     )`,
    [input.userId, input.titleId],
  );
}

export async function viewingsByUser(
  db: AbstractPowerSyncDatabase,
  userId: string,
  titleId: string,
): Promise<ViewingRow[]> {
  return db.getAll<ViewingRow>(VIEWINGS_BY_USER_FOR_TITLE, [userId, titleId]);
}
