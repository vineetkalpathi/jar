import {
  ConstraintError,
  drawSize,
  nonEmpty,
  ratingValue,
  releaseYear,
  requiredText,
  runtimeMinutes,
  tmdbId,
} from "./constraints";

describe("requiredText", () => {
  it("trims", () => {
    expect(requiredText("  Heat  ", "A title")).toBe("Heat");
  });

  it("rejects a name that is only whitespace", () => {
    // Satisfies `not null` and satisfies nobody else.
    expect(() => requiredText("   ", "A jar")).toThrow(ConstraintError);
    expect(() => requiredText("", "A jar")).toThrow(/A jar needs a name/);
  });
});

describe("ratingValue", () => {
  it("accepts 0 through 10", () => {
    for (const value of [0, 1, 5, 10]) expect(ratingValue(value)).toBe(value);
  });

  it("keeps one decimal place and rounds anything finer", () => {
    expect(ratingValue(7.5)).toBe(7.5);
    expect(ratingValue(6.24)).toBe(6.2);
    expect(ratingValue(6.28)).toBe(6.3);
  });

  it("rejects out of range and non-numbers", () => {
    for (const bad of [-0.1, 11, -3, NaN]) {
      expect(() => ratingValue(bad)).toThrow(ConstraintError);
    }
  });
});

describe("runtimeMinutes", () => {
  it("keeps a real runtime", () => {
    expect(runtimeMinutes(170)).toBe(170);
  });

  it("reads TMDB's zero as unknown rather than failing the import", () => {
    // The bug this exists for: 0 violates title_runtime_positive, inserts fine into
    // SQLite, and fails silently on upload. It means "no data", and the column is
    // nullable for exactly that.
    expect(runtimeMinutes(0)).toBeNull();
    expect(runtimeMinutes(-5)).toBeNull();
    expect(runtimeMinutes(null)).toBeNull();
    expect(runtimeMinutes(undefined)).toBeNull();
    expect(runtimeMinutes(NaN)).toBeNull();
  });

  it("rounds, since the column is an integer", () => {
    expect(runtimeMinutes(101.6)).toBe(102);
  });
});

describe("drawSize", () => {
  it("accepts one or more", () => {
    expect(drawSize(1)).toBe(1);
    expect(drawSize(5)).toBe(5);
  });

  it("rejects zero, negatives and fractions", () => {
    for (const bad of [0, -1, 2.5]) expect(() => drawSize(bad)).toThrow(ConstraintError);
  });
});

describe("releaseYear", () => {
  it("keeps a real year and discards nonsense", () => {
    expect(releaseYear(1995)).toBe(1995);
    expect(releaseYear(null)).toBeNull();
    expect(releaseYear(NaN)).toBeNull();
    expect(releaseYear(0)).toBeNull();
  });
});

describe("tmdbId", () => {
  it("requires a positive whole number", () => {
    expect(tmdbId(949)).toBe(949);
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => tmdbId(bad)).toThrow(ConstraintError);
    }
  });
});

describe("nonEmpty", () => {
  it("rejects an empty list", () => {
    expect(() => nonEmpty([], "A draw's participants")).toThrow(ConstraintError);
    expect(nonEmpty(["alice"], "A draw's participants")).toEqual(["alice"]);
  });
});
