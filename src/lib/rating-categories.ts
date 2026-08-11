/**
 * The starter Rating Categories every new Household is seeded with.
 *
 * These ids are fixed constants, mirroring the seed in
 * `supabase/migrations/20260731000000_initial_schema.sql`.
 * Household creation writes `household_category` rows on the device and must work
 * offline — before the `categories` sync stream has necessarily delivered anything —
 * so the client cannot look these up by name at that moment.
 *
 * Categories themselves are a global find-or-create catalogue: a Household wanting an
 * axis that isn't here coins it, and thereafter everyone scoring that axis is scoring
 * the same thing. The starter set is therefore deliberately short.
 */

export const STARTER_RATING_CATEGORIES = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Plot" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Acting" },
  { id: "00000000-0000-4000-8000-000000000003", name: "Cinematography" },
  { id: "00000000-0000-4000-8000-000000000004", name: "Soundtrack" },
  { id: "00000000-0000-4000-8000-000000000005", name: "Rewatchability" },
] as const;

export type StarterRatingCategory = (typeof STARTER_RATING_CATEGORIES)[number];

export const STARTER_RATING_CATEGORY_IDS: readonly string[] =
  STARTER_RATING_CATEGORIES.map((c) => c.id);
