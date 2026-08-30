/**
 * The local SQLite schema, mirroring `supabase/migrations/20260731000000_initial_schema.sql`.
 *
 * This declares what PowerSync materialises on the device. It has to agree with three
 * other things, and a disagreement is silent in every direction:
 *
 *   - the Postgres schema, or uploads fail on columns that don't exist
 *   - `powersync/sync-rules.yaml`, or rows arrive for tables that aren't declared here
 *     and are dropped
 *   - `src/lib/filter/compile.ts`, which writes SQL against these table and column names
 *
 * Three things SQLite cannot carry over from Postgres, and which therefore stop being
 * enforced once a row is on the device:
 *
 *   - **`id` is implicit.** PowerSync adds a TEXT `id` to every table and requires it to
 *     be the whole primary key, which is why the ten join tables carry a surrogate id
 *     (docs/powersync.md). Do not declare it here.
 *   - **Only TEXT, INTEGER and REAL exist.** uuids, timestamps, dates, enums and the
 *     `jsonb` filter are all TEXT. Timestamps arrive in Postgres' rendering, which is
 *     why the filter compiler compares them through `julianday()` rather than as text.
 *   - **No constraints.** Not null, checks, foreign keys and unique constraints are all
 *     absent locally. A rating of 47 or a duplicate library entry will insert happily on
 *     the device and fail on upload, so validation belongs in the repositories.
 */

import { column, Schema, Table } from "@powersync/react-native";

// --- People ----------------------------------------------------------------

const app_user = new Table({
  display_name: column.text,
  created_at: column.text,
});

const household = new Table({
  name: column.text,
  rating_coverage: column.text, // 'any' | 'all'
  rating_aggregator: column.text, // 'avg' | 'min' | 'max'
  created_at: column.text,
});

const household_member = new Table(
  {
    household_id: column.text,
    user_id: column.text,
    joined_at: column.text,
  },
  { indexes: { household: ["household_id"], user: ["user_id"] } },
);

// --- Catalogue (global) ----------------------------------------------------

const title = new Table(
  {
    tmdb_id: column.integer,
    name: column.text,
    media_type: column.text, // 'movie' | 'tv'
    release_year: column.integer,
    runtime: column.integer, // minutes
    language: column.text, // TMDB's en-US name, not a code (ADR-0008)
    poster_path: column.text, // TMDB poster path, cached for list views (ADR-0003)
    attributes_refreshed_at: column.text,
    owner_household_id: column.text, // set only for hand-entered Titles
    created_at: column.text,
  },
  { indexes: { tmdb: ["tmdb_id"], owner: ["owner_household_id"] } },
);

const person = new Table({
  tmdb_person_id: column.integer,
  name: column.text,
});

const title_credit = new Table(
  {
    title_id: column.text,
    person_id: column.text,
    role: column.text, // 'cast' | 'director'
  },
  // The compiler filters by (title_id, role), then by person_id.
  { indexes: { title: ["title_id", "role"], person: ["person_id"] } },
);

const title_genre = new Table(
  {
    title_id: column.text,
    genre: column.text, // TMDB's en-US display name (ADR-0008)
  },
  { indexes: { title: ["title_id"], genre: ["genre"] } },
);

// --- Library (household) ---------------------------------------------------

const library_entry = new Table(
  {
    household_id: column.text,
    title_id: column.text,
    added_by_user_id: column.text,
    added_at: column.text,
  },
  // Every jar query starts by scoping to a household's library.
  { indexes: { household: ["household_id"], title: ["title_id"] } },
);

// --- Annotations -----------------------------------------------------------

const tag = new Table(
  {
    household_id: column.text,
    name: column.text,
  },
  { indexes: { household: ["household_id"] } },
);

const title_tag = new Table(
  {
    household_id: column.text,
    title_id: column.text,
    tag_id: column.text,
  },
  { indexes: { title: ["title_id", "household_id"], tag: ["tag_id"] } },
);

const rating_category = new Table({
  name: column.text,
  archived_at: column.text, // archived, never deleted
  created_at: column.text,
});

const household_category = new Table(
  {
    household_id: column.text,
    category_id: column.text,
  },
  { indexes: { household: ["household_id"] } },
);

const rating = new Table(
  {
    user_id: column.text,
    title_id: column.text,
    category_id: column.text,
    value: column.integer, // 1–10, enforced in the repositories
    updated_at: column.text,
  },
  { indexes: { title: ["title_id", "category_id"], user: ["user_id"] } },
);

// Deliberately not unique per (title_id, user_id): rewatches are the point, and
// watched-ness, rewatch count and recency are all derived from these rows.
const viewing = new Table(
  {
    title_id: column.text,
    user_id: column.text,
    watched_on: column.text, // date, YYYY-MM-DD
    created_at: column.text,
  },
  { indexes: { title: ["title_id", "user_id"], user: ["user_id"] } },
);

// --- Jars ------------------------------------------------------------------

const jar = new Table(
  {
    household_id: column.text,
    name: column.text,
    filter: column.text, // the ADR-0009 tree, as JSON text
    created_at: column.text,
  },
  { indexes: { household: ["household_id"] } },
);

const jar_override = new Table(
  {
    jar_id: column.text,
    title_id: column.text,
    kind: column.text, // 'pin' | 'exclusion'
  },
  { indexes: { jar: ["jar_id"], title: ["title_id"] } },
);

// --- Draws -----------------------------------------------------------------

const draw = new Table(
  {
    jar_id: column.text,
    drawn_at: column.text,
    n: column.integer,
    outcome: column.text, // 'in_progress' | 'watched' | 'abandoned' | 'no_pick'
    result_title_id: column.text,
  },
  { indexes: { jar: ["jar_id", "drawn_at"] } },
);

// user_id may reference someone who is not a household member: that is a Guest.
const draw_participant = new Table(
  {
    draw_id: column.text,
    user_id: column.text,
  },
  { indexes: { draw: ["draw_id"], user: ["user_id"] } },
);

const draw_candidate = new Table(
  {
    draw_id: column.text,
    title_id: column.text,
    knocked_out_at: column.text, // null means still in play
  },
  // `lastDrawn` looks up by title; a Draw's slate is read by draw_id.
  { indexes: { title: ["title_id"], draw: ["draw_id"] } },
);

export const AppSchema = new Schema({
  app_user,
  household,
  household_member,
  title,
  person,
  title_credit,
  title_genre,
  library_entry,
  tag,
  title_tag,
  rating_category,
  household_category,
  rating,
  viewing,
  jar,
  jar_override,
  draw,
  draw_participant,
  draw_candidate,
});

/** Row types for every table, with the implicit `id` included. */
export type Database = (typeof AppSchema)["types"];

export type AppUserRow = Database["app_user"];
export type HouseholdRow = Database["household"];
export type HouseholdMemberRow = Database["household_member"];
export type TitleRow = Database["title"];
export type PersonRow = Database["person"];
export type TitleCreditRow = Database["title_credit"];
export type TitleGenreRow = Database["title_genre"];
export type LibraryEntryRow = Database["library_entry"];
export type TagRow = Database["tag"];
export type TitleTagRow = Database["title_tag"];
export type RatingCategoryRow = Database["rating_category"];
export type HouseholdCategoryRow = Database["household_category"];
export type RatingRow = Database["rating"];
export type ViewingRow = Database["viewing"];
export type JarRow = Database["jar"];
export type JarOverrideRow = Database["jar_override"];
export type DrawRow = Database["draw"];
export type DrawParticipantRow = Database["draw_participant"];
export type DrawCandidateRow = Database["draw_candidate"];
