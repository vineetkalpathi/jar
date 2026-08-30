import {
  draftToFilter,
  emptyDraft,
  filterToDraft,
  isEmptyDraft,
  type FilterDraft,
} from "./draft";
import { parseFilter } from "./validate";

const CATEGORY = "00000000-0000-4000-8000-000000000005";
const PERSON = "00000000-0000-4000-8000-00000000000a";
const TAG = "00000000-0000-4000-8000-00000000000b";
const USER = "00000000-0000-4000-8000-00000000000c";
const ME = "00000000-0000-4000-8000-00000000000d";

/** Every filter the builder can emit must survive the validator. */
const valid = (draft: FilterDraft) => {
  const filter = draftToFilter(draft, ME);
  expect(filter).not.toBeNull();
  const result = parseFilter(filter);
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return filter!;
};

describe("emptyDraft", () => {
  it("produces no filter", () => {
    expect(draftToFilter(emptyDraft(), ME)).toBeNull();
    expect(isEmptyDraft(emptyDraft())).toBe(true);
  });
});

describe("the worked examples from filter-leaves.md", () => {
  it("action thriller movies", () => {
    const d = emptyDraft();
    d.mediaType = "movie";
    d.genres.include = ["Action", "Thriller"];
    d.genres.matchAll = true;
    const filter = valid(d);
    expect(filter.root).toMatchObject({
      kind: "group",
      op: "and",
      children: [
        { leaf: "mediaType", op: "is", value: "movie" },
        { leaf: "genre", op: "contains", value: "Action" },
        { leaf: "genre", op: "contains", value: "Thriller" },
      ],
    });
  });

  it("rewatchable tv", () => {
    const d = emptyDraft();
    d.mediaType = "tv";
    d.ratings = [{ categoryId: CATEGORY, op: "gt", value: 5, scope: "household" }];
    const filter = valid(d);
    expect(filter.root).toMatchObject({
      children: [
        { leaf: "mediaType", op: "is", value: "tv" },
        { leaf: "rating", categoryId: CATEGORY, op: "gt", value: 5 },
      ],
    });
  });

  it("anything with a given actor (media type left open)", () => {
    const d = emptyDraft();
    d.cast = [{ tmdbPersonId: 1, name: "Rob Lowe", personId: PERSON }];
    const filter = valid(d);
    expect(filter.root).toMatchObject({
      leaf: "castMember",
      op: "contains",
      personId: PERSON,
    });
  });

  it("short weeknight pick", () => {
    const d = emptyDraft();
    d.runtime.max = 100;
    d.watched.mode = "nobody";
    const filter = valid(d);
    expect(filter.root).toMatchObject({
      children: [
        { leaf: "runtime", op: "lte", value: 100 },
        { leaf: "watched", op: "not_by_any" },
      ],
    });
  });

  it("comfort rewatch", () => {
    const d = emptyDraft();
    d.watchCount = { op: "gte", value: 3 };
    d.lastWatched = { mode: "older_than", amount: 1, unit: "year", population: null };
    const filter = valid(d);
    expect(filter.root).toMatchObject({
      children: [
        { leaf: "watchCount", op: "gte", value: 3 },
        { leaf: "lastWatched", op: "older_than", duration: { amount: 1, unit: "year" } },
      ],
    });
  });

  it("not horror, unknowns welcome", () => {
    const d = emptyDraft();
    d.genres.exclude = ["Horror"];
    d.genres.includeUnknown = true;
    const filter = valid(d);
    // any(NOT genre = Horror, genre is null) — one OR group, no nesting.
    expect(filter.root).toMatchObject({
      kind: "group",
      op: "or",
      children: [
        { leaf: "genre", op: "not_contains", value: "Horror" },
        { leaf: "genre", op: "is_null" },
      ],
    });
  });
});

describe("match-any genres", () => {
  it("folds includes into one OR group with the unknown option", () => {
    const d = emptyDraft();
    d.genres.include = ["Action", "Comedy"];
    d.genres.includeUnknown = true;
    const filter = valid(d);
    expect(filter.root).toMatchObject({
      kind: "group",
      op: "or",
      children: [
        { leaf: "genre", op: "contains", value: "Action" },
        { leaf: "genre", op: "contains", value: "Comedy" },
        { leaf: "genre", op: "is_null" },
      ],
    });
  });
});

describe("ratings", () => {
  it("resolves 'me' to the current user id", () => {
    const d = emptyDraft();
    d.ratings = [{ categoryId: CATEGORY, op: "between", min: 6, max: 9, scope: "me" }];
    const filter = valid(d);
    expect(filter.root).toMatchObject({
      leaf: "rating",
      op: "between",
      min: 6,
      max: 9,
      raters: [ME],
    });
  });

  it("keeps an explicit rater list and policy overrides", () => {
    const d = emptyDraft();
    d.ratings = [
      {
        categoryId: CATEGORY,
        op: "gte",
        value: 7,
        scope: { userIds: [USER, ME] },
        coverage: "all",
        aggregator: "min",
      },
    ];
    const filter = valid(d);
    expect(filter.root).toMatchObject({
      raters: [USER, ME],
      coverage: "all",
      aggregator: "min",
    });
  });
});

describe("round-tripping", () => {
  const cases: Record<string, (d: FilterDraft) => void> = {
    "media + genres (all)": (d) => {
      d.mediaType = "movie";
      d.genres.include = ["Action", "Thriller"];
      d.genres.matchAll = true;
    },
    "genres (any) + unknown": (d) => {
      d.genres.include = ["Action", "Comedy"];
      d.genres.includeUnknown = true;
    },
    "ranges": (d) => {
      d.releaseYear = { min: 1990, max: 1999 };
      d.runtime = { min: null, max: 100 };
    },
    "languages": (d) => {
      d.languages = ["English", "French"];
    },
    "tags": (d) => {
      d.tags.include = [TAG];
      d.tags.exclude = ["00000000-0000-4000-8000-00000000000e"];
    },
    "rating me": (d) => {
      d.ratings = [{ categoryId: CATEGORY, op: "gte", value: 7, scope: "me" }];
    },
    "viewing + history": (d) => {
      d.watched = { mode: "everyone", population: null };
      d.lastWatched = { mode: "within", amount: 3, unit: "month", population: [ME] };
      d.addedToLibrary = { mode: "older_than", amount: 2, unit: "year" };
      d.addedBy = { userId: USER, negate: true };
      d.lastDrawn = { mode: "never", scope: "household" };
    },
  };

  for (const [name, build] of Object.entries(cases)) {
    it(name, () => {
      const d = emptyDraft();
      build(d);
      const filter = valid(d);
      const back = filterToDraft(filter, ME);
      expect(back.advanced).toBeUndefined();
      expect(draftToFilter(back, ME)).toEqual(filter);
    });
  }
});

describe("filterToDraft", () => {
  it("flags a tree it cannot place as advanced", () => {
    const filter = {
      version: 1,
      root: {
        kind: "group" as const,
        op: "or" as const,
        children: [
          { kind: "predicate" as const, leaf: "runtime" as const, op: "lte" as const, value: 90 },
          { kind: "predicate" as const, leaf: "mediaType" as const, op: "is" as const, value: "tv" as const },
        ],
      },
    };
    const draft = filterToDraft(filter, ME);
    expect(draft.advanced).toEqual(filter);
    expect(isEmptyDraft(draft)).toBe(false);
  });

  it("passes an advanced draft straight back through", () => {
    const filter = {
      version: 1,
      root: {
        kind: "predicate" as const,
        leaf: "runtime" as const,
        op: "lte" as const,
        value: 90,
      },
    };
    const draft = { ...emptyDraft(), advanced: filter };
    expect(draftToFilter(draft, ME)).toEqual(filter);
  });
});
