/**
 * The checks Postgres performs, performed again before a row is written locally.
 *
 * SQLite carries none of the schema's `check` constraints or `not null` declarations,
 * so a value Postgres would reject inserts happily on the device, reads back everywhere
 * as though it were real, and fails only when the upload queue reaches it. At that
 * point the connector classifies it as permanent, drops it, and logs a warning nobody
 * is reading — so the row silently never syncs, and the app looks fine.
 *
 * Catching it here turns that into an error at the point of the mistake.
 *
 * Each function below names the constraint it mirrors. They are in one file rather than
 * inline at each call site because they have to stay in step with
 * `supabase/migrations/20260731000000_initial_schema.sql`, and scattered copies drift
 * from it quietly.
 */

export class ConstraintError extends Error {}

// ---------------------------------------------------------------------------
// Mirroring a database constraint
// ---------------------------------------------------------------------------

/**
 * Mirrors the `not null` on every `name` and `display_name` column.
 *
 * Trims, because a name of spaces satisfies `not null` and satisfies nobody else.
 */
export function requiredText(value: string, subject: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new ConstraintError(`${subject} needs a name`);
  return trimmed;
}

/** Mirrors `rating_value_range check (value between 1 and 10)`. */
export function ratingValue(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new ConstraintError(
      `A rating must be a whole number from 1 to 10, got ${value}`,
    );
  }
  return value;
}

/**
 * Mirrors `title_runtime_positive check (runtime is null or runtime > 0)`.
 *
 * Coerces rather than throws, and that is the point. TMDB returns `0` for entries it
 * has no runtime for — plenty of TV, anything unreleased — and that means *unknown*,
 * not *invalid*. The column is nullable for exactly that case, so a zero becomes null
 * instead of failing an import that is otherwise perfectly good.
 *
 * A Title with an unknown runtime then behaves as ADR-0006 says it should: it fails
 * `runtime <= 100` and `NOT runtime <= 100` alike, rather than claiming to be zero
 * minutes long and matching every upper bound ever written.
 */
export function runtimeMinutes(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

/** Mirrors `draw_n_positive check (n > 0)`. */
export function drawSize(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ConstraintError(`A draw serves at least one candidate, got ${value}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Guarding values SQLite would accept and nothing else would
//
// No constraint in the schema covers these. They exist because SQLite is untyped
// enough to store `NaN` in an integer column, and the result is a row that is neither
// null nor a number and confuses everything downstream of it.
// ---------------------------------------------------------------------------

/** A release year, or null when TMDB has no usable date. */
export function releaseYear(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

/** A TMDB id. Not nullable on the paths that use it: an unlinked Title takes another. */
export function tmdbId(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConstraintError(`A TMDB id must be a positive whole number, got ${value}`);
  }
  return value;
}

/**
 * Not a database constraint — `draw_participant` is deliberately unconstrained so a
 * Guest can take part. But a Draw with nobody in it is meaningless, and the mistake is
 * easier to explain here than to discover later.
 */
export function nonEmpty<T>(values: T[], subject: string): T[] {
  if (values.length === 0) throw new ConstraintError(`${subject} cannot be empty`);
  return values;
}
