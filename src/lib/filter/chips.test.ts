import { draftToChips, formatRuntime, type ChipContext } from "./chips";
import { emptyDraft, type FilterDraft } from "./draft";

const ctx: ChipContext = {
  currentUserId: "u-me",
  tagName: (id) => ({ "t-cozy": "cozy", "t-scary": "scary" })[id] ?? id,
  categoryName: (id) => ({ "c-plot": "Plot", "c-rw": "Rewatchability" })[id] ?? id,
  memberName: (id) => ({ "u-me": "Me", "u-sam": "Sam", "u-jo": "Jo" })[id] ?? id,
  personName: (ref) => ref.name || ref.personId || "someone",
};

/** Flattens one chip to the sentence it renders as. */
function text(draft: FilterDraft): string[] {
  return draftToChips(draft, ctx).map((c) => c.segments.map((s) => s.text).join(" "));
}

describe("formatRuntime", () => {
  it("renders minutes, whole hours, and hours + minutes", () => {
    expect(formatRuntime(45)).toBe("45 min");
    expect(formatRuntime(120)).toBe("2 hr");
    expect(formatRuntime(185)).toBe("3 hr 5 min");
  });
});

describe("draftToChips", () => {
  it("is empty for an untouched draft", () => {
    expect(draftToChips(emptyDraft(), ctx)).toEqual([]);
  });

  it("title type", () => {
    expect(text({ ...emptyDraft(), mediaType: "movie" })).toEqual(["Title type is Movie"]);
  });

  it("runtime — both bounds is a between, one bound is at least / at most", () => {
    expect(text({ ...emptyDraft(), runtime: { min: 60, max: 180 } })).toEqual([
      "Runtime is between 1 hr and 3 hr",
    ]);
    expect(text({ ...emptyDraft(), runtime: { min: 90, max: null } })).toEqual([
      "Runtime is at least 1 hr 30 min",
    ]);
    expect(text({ ...emptyDraft(), runtime: { min: null, max: 100 } })).toEqual([
      "Runtime is at most 1 hr 40 min",
    ]);
  });

  it("release year stays numeric", () => {
    expect(text({ ...emptyDraft(), releaseYear: { min: 1990, max: null } })).toEqual([
      "Release year is at least 1990",
    ]);
  });

  it("genre — include is one chip, exclude another, match-all and unknown noted", () => {
    const d = emptyDraft();
    d.genres = {
      include: ["Action", "Comedy"],
      exclude: ["Horror"],
      includeUnknown: true,
      matchAll: false,
    };
    expect(text(d)).toEqual([
      "Genre is Action or Comedy or no genre",
      "Genre is not Horror",
    ]);

    d.genres.matchAll = true;
    d.genres.includeUnknown = false;
    expect(text(d)[0]).toBe("Genre is all of Action and Comedy");
  });

  it("original language", () => {
    expect(text({ ...emptyDraft(), languages: ["English", "French"] })).toEqual([
      "Original language is English or French",
    ]);
  });

  it("cast — one chip per person, by name", () => {
    const d = emptyDraft();
    d.cast = [
      { tmdbPersonId: 1, name: "Zendaya", personId: "p-z" },
      { tmdbPersonId: 2, name: "Tom Holland" },
    ];
    expect(text(d)).toEqual([
      "Cast member includes Zendaya",
      "Cast member includes Tom Holland",
    ]);
  });

  it("tags — has and doesn't have", () => {
    const d = emptyDraft();
    d.tags = { include: ["t-cozy"], exclude: ["t-scary"] };
    expect(text(d)).toEqual(["Tag has cozy", "Tag doesn't have scary"]);
  });

  it("rating — operator, scope note, and the null forms", () => {
    const base = emptyDraft();
    expect(
      text({
        ...base,
        ratings: [{ categoryId: "c-plot", op: "gte", value: 7.5, scope: "household" }],
      }),
    ).toEqual(["Plot is at least 7.5"]);

    expect(
      text({
        ...base,
        ratings: [{ categoryId: "c-plot", op: "gte", value: 8, scope: "me" }],
      }),
    ).toEqual(["Plot is at least 8 · my rating"]);

    expect(
      text({
        ...base,
        ratings: [{ categoryId: "c-rw", op: "is_null", scope: "household" }],
      }),
    ).toEqual(["Rewatchability is unrated"]);
  });

  it("seen by, with a picked population", () => {
    expect(
      text({
        ...emptyDraft(),
        watched: { mode: "nobody", population: null },
      }),
    ).toEqual(["Seen by nobody"]);

    expect(
      text({
        ...emptyDraft(),
        watched: { mode: "anyone", population: ["u-sam", "u-jo"] },
      }),
    ).toEqual(["Seen by anyone · Sam & Jo"]);
  });

  it("last watched — relative reads as 'over N ago'", () => {
    expect(
      text({
        ...emptyDraft(),
        lastWatched: { mode: "older_than", amount: 2, unit: "year", population: null },
      }),
    ).toEqual(["Last watched over 2 years ago"]);
  });

  it("draw history — never drawn carries the scope", () => {
    expect(
      text({
        ...emptyDraft(),
        lastDrawn: { mode: "never", scope: "this_jar" },
      }),
    ).toEqual(["Draw history never drawn · this jar"]);

    expect(
      text({
        ...emptyDraft(),
        lastDrawn: { mode: "within", amount: 1, unit: "month", scope: "household" },
      }),
    ).toEqual(["Last drawn in the last 1 month · any jar"]);
  });

  it("added by — negated", () => {
    expect(
      text({ ...emptyDraft(), addedBy: { userId: "u-sam", negate: true } }),
    ).toEqual(["Added by is not Sam"]);
  });

  it("gives multi-attribute chips a stable ref id", () => {
    const d = emptyDraft();
    d.tags = { include: ["t-cozy"], exclude: [] };
    d.ratings = [{ categoryId: "c-plot", op: "gte", value: 7, scope: "household" }];
    const chips = draftToChips(d, ctx);
    expect(chips.find((c) => c.attr === "tag")?.refId).toBe("t-cozy");
    expect(chips.find((c) => c.attr === "rating")?.refId).toBe("c-plot");
  });
});
