import {
  approxDate,
  date,
  daysInMonth,
  formatWatchedOn,
  parseTimestamp,
  subtract,
  timestamp,
  watchedOnParts,
  watchPrecision,
} from "./time";

const INSTANT = new Date("2026-08-01T12:34:56.789Z");

describe("writing", () => {
  it("writes SQLite's canonical form in UTC", () => {
    expect(timestamp(INSTANT)).toBe("2026-08-01 12:34:56");
  });

  it("writes plain calendar dates", () => {
    expect(date(INSTANT)).toBe("2026-08-01");
  });
});

describe("reading", () => {
  it("round-trips what we write", () => {
    expect(parseTimestamp(timestamp(INSTANT))?.toISOString()).toBe(
      "2026-08-01T12:34:56.000Z",
    );
  });

  it("reads every rendering that reaches these columns as the same instant", () => {
    // Device-written, and the forms PowerSync renders from Postgres.
    const renderings = [
      "2026-08-01 12:34:56",
      "2026-08-01T12:34:56Z",
      "2026-08-01T12:34:56.000Z",
      "2026-08-01 12:34:56+00",
      "2026-08-01 12:34:56+00:00",
    ];

    for (const rendering of renderings) {
      expect(parseTimestamp(rendering)?.toISOString()).toBe("2026-08-01T12:34:56.000Z");
    }
  });

  it("reads a zoneless timestamp as UTC, not as device-local time", () => {
    // `new Date('2026-08-01 12:00:00')` would read this as noon wherever the phone is,
    // which would shift every cooldown by the user's offset.
    expect(parseTimestamp("2026-08-01 12:00:00")?.toISOString()).toBe(
      "2026-08-01T12:00:00.000Z",
    );
  });

  it("reads a bare date as midnight UTC", () => {
    expect(parseTimestamp("2026-08-01")?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("returns null rather than an Invalid Date", () => {
    // A bad value should read as "no timestamp", not poison comparisons downstream.
    for (const bad of [null, undefined, "", "   ", "not a date", "2026-13-45"]) {
      expect(parseTimestamp(bad)).toBeNull();
    }
  });
});

describe("approximate viewing dates", () => {
  it("fills omitted month and day with the 1st, keeping a real date", () => {
    expect(approxDate({ year: 2024 })).toBe("2024-01-01");
    expect(approxDate({ year: 2024, month: 3 })).toBe("2024-03-01");
    expect(approxDate({ year: 2024, month: 3, day: 12 })).toBe("2024-03-12");
    expect(approxDate({ year: 2024, month: null, day: null })).toBe("2024-01-01");
  });

  it("derives precision from which parts are present", () => {
    expect(watchPrecision({ year: 2024 })).toBe("year");
    expect(watchPrecision({ year: 2024, month: 3 })).toBe("month");
    expect(watchPrecision({ year: 2024, month: 3, day: 12 })).toBe("day");
    expect(watchPrecision({ year: 2024, month: null, day: 12 })).toBe("year");
  });

  it("renders back to the precision it was logged at", () => {
    expect(formatWatchedOn("2024-03-12", "year")).toBe("2024");
    expect(formatWatchedOn("2024-03-12", "month")).toBe("March 2024");
    expect(formatWatchedOn("2024-03-12", "day")).toBe("12 March 2024");
    // A null precision — every row that predates the column — reads as a full date.
    expect(formatWatchedOn("2024-03-12", null)).toBe("12 March 2024");
  });

  it("splits a stored date, ignoring any time component", () => {
    expect(watchedOnParts("2024-03-12")).toEqual({ year: 2024, month: 3, day: 12 });
    expect(watchedOnParts("2024-03-12 00:00:00")).toEqual({ year: 2024, month: 3, day: 12 });
  });

  it("knows month lengths, leap years included", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 12)).toBe(31);
  });
});

describe("subtract", () => {
  it("handles days and weeks plainly", () => {
    const from = new Date("2026-08-07T12:00:00Z");
    expect(subtract(from, 7, "day").toISOString()).toBe("2026-07-31T12:00:00.000Z");
    expect(subtract(from, 1, "week").toISOString()).toBe("2026-07-31T12:00:00.000Z");
  });

  it("clamps the day rather than rolling into the next month", () => {
    // 31 March minus one month is 31 February, which JavaScript's own setters resolve
    // to 3 March — a cutoff three days too late, admitting Viewings three days old as
    // though they were over a month old.
    expect(subtract(new Date("2026-03-31T00:00:00Z"), 1, "month").toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(subtract(new Date("2026-05-31T00:00:00Z"), 1, "month").toISOString()).toBe(
      "2026-04-30T00:00:00.000Z",
    );
  });

  it("clamps into a leap February", () => {
    expect(subtract(new Date("2028-03-31T00:00:00Z"), 1, "month").toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("clamps a year subtracted from a leap day", () => {
    expect(subtract(new Date("2028-02-29T00:00:00Z"), 1, "year").toISOString()).toBe(
      "2027-02-28T00:00:00.000Z",
    );
  });

  it("leaves a day that exists in the target month alone", () => {
    expect(subtract(new Date("2026-08-15T00:00:00Z"), 1, "month").toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    );
    expect(subtract(new Date("2026-08-15T00:00:00Z"), 2, "year").toISOString()).toBe(
      "2024-08-15T00:00:00.000Z",
    );
  });

  it("crosses year boundaries by whole months", () => {
    expect(subtract(new Date("2026-01-31T00:00:00Z"), 2, "month").toISOString()).toBe(
      "2025-11-30T00:00:00.000Z",
    );
  });

  it("does not mutate its argument", () => {
    const from = new Date("2026-03-31T00:00:00Z");
    subtract(from, 1, "month");
    expect(from.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });
});
