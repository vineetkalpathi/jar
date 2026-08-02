import { date, parseTimestamp, timestamp } from "./time";

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
