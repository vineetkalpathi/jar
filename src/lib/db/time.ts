/**
 * Reading and writing the time values SQLite stores as text.
 *
 * SQLite has no date type and carries no column defaults here, so anything Postgres
 * would have supplied with `now()` is written explicitly by the repositories.
 *
 * The awkward part is reading. A timestamp column holds two renderings at once: rows
 * written on this device, and rows replicated from Postgres and rendered by PowerSync.
 * Both must parse. The filter compiler solves the same problem in SQL — see
 * `normaliseTime` in `filter/compile.ts` — and this is the JavaScript half of it.
 */

/** A timestamp in SQLite's canonical form, `YYYY-MM-DD HH:MM:SS`, in UTC. */
export function timestamp(at: Date = new Date()): string {
  return at.toISOString().slice(0, 19).replace("T", " ");
}

/** A calendar date, `YYYY-MM-DD`. Used for `viewing.watched_on`. */
export function date(on: Date = new Date()): string {
  return on.toISOString().slice(0, 10);
}

/**
 * Parses any of the renderings that reach these columns, returning null for anything
 * unrecognisable rather than an Invalid Date — a bad value should read as "no
 * timestamp", not poison every comparison downstream of it.
 *
 * Values are UTC: `timestamp()` writes UTC and PowerSync replicates `timestamptz` in
 * UTC, so a form carrying no zone is read as UTC rather than as local time. That is the
 * difference between this and `new Date(value)`, which would treat
 * `'2026-08-01 12:00:00'` as noon wherever the device happens to be.
 */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;

  const [datePart, timePart] = value.trim().replace("T", " ").split(" ");
  if (!datePart) return null;

  if (!timePart) {
    // A bare date, `YYYY-MM-DD`.
    const parsed = new Date(`${datePart}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // Strip whatever zone suffix is present — `Z`, `+00`, `+00:00`, `-05:30` — then read
  // the remainder as UTC. Offsets other than UTC do not occur in these columns.
  const withoutZone = timePart.replace(/(Z|[+-]\d{2}(:?\d{2})?)$/, "");
  const parsed = new Date(`${datePart}T${withoutZone}Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
