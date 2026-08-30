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

/** How much of a `watched_on` date is a real claim. Null in the column means `day`. */
export type WatchPrecision = "year" | "month" | "day";

export type ApproxDateParts = { year: number; month?: number | null; day?: number | null };

/** `year` alone → `year`; `year` + `month` → `month`; all three → `day`. */
export function watchPrecision(parts: ApproxDateParts): WatchPrecision {
  if (parts.month == null) return "year";
  if (parts.day == null) return "month";
  return "day";
}

/**
 * An approximate calendar date as the `YYYY-MM-DD` the column stores: omitted month or
 * day fall back to `01`, so the value stays a real date for recency comparisons. Pair
 * it with `watchPrecision(parts)` so the omission is still known when rendering back.
 */
export function approxDate(parts: ApproxDateParts): string {
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month ?? 1).padStart(2, "0");
  const d = String(parts.day ?? 1).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Splits a stored `watched_on` back into parts, ignoring any time component. */
export function watchedOnParts(watchedOn: string): { year: number; month: number; day: number } {
  const [y, m, d] = watchedOn.slice(0, 10).split("-").map(Number);
  return { year: y, month: m, day: d };
}

/**
 * A stored `watched_on` shown to the precision it was actually logged at:
 * `2024`, `March 2024`, or `12 March 2024`. A null precision reads as `day`.
 */
export function formatWatchedOn(watchedOn: string, precision: WatchPrecision | null): string {
  const { year, month, day } = watchedOnParts(watchedOn);
  const name = MONTHS[month - 1] ?? "";
  if (precision === "year") return String(year);
  if (precision === "month") return `${name} ${year}`;
  return `${day} ${name} ${year}`;
}

/** Month names, index 0 = January — for a month picker. */
export const MONTH_NAMES = MONTHS;

/** Days in a given 1-indexed month of a year (handles leap February). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type DurationUnit = "day" | "week" | "month" | "year";

/**
 * `from` minus a whole number of units, clamping the day to the target month's length.
 *
 * The clamp is the entire point. JavaScript's own setters keep the day-of-month fixed
 * and let an impossible date roll forward, so `setUTCMonth(m - 1)` on 31 March asks for
 * 31 February and lands on 3 March. A jar filtering `lastWatched older_than 1 month`
 * would then use a cutoff three days into March and admit Viewings three days old as
 * though they were over a month old.
 *
 * It misfires only when the day-of-month exceeds the target month's length — the 29th
 * to 31st, and 29 February for years — and always in the direction of admitting titles
 * that should have been excluded. ADR-0006 makes the relative form the one the builder
 * offers first, so this is the common path rather than an edge.
 *
 * 31 March minus one month is therefore 28 February, not 3 March.
 */
export function subtract(from: Date, amount: number, unit: DurationUnit): Date {
  const result = new Date(from.getTime());

  switch (unit) {
    case "day":
      result.setUTCDate(result.getUTCDate() - amount);
      return result;
    case "week":
      result.setUTCDate(result.getUTCDate() - amount * 7);
      return result;
    case "month":
      return subtractMonths(result, amount);
    case "year":
      return subtractMonths(result, amount * 12);
  }
}

function subtractMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();

  // Move to the 1st before shifting the month, so the shift itself cannot roll over.
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();

  date.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return date;
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
