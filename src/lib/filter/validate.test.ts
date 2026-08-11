import { FILTER_VERSION, type FilterNode } from "./types";
import { parseFilter } from "./validate";

const PERSON = "00000000-0000-4000-8000-00000000000a";
const CATEGORY = "00000000-0000-4000-8000-000000000005";
const TAG = "00000000-0000-4000-8000-00000000000b";
const USER = "00000000-0000-4000-8000-00000000000c";

const wrap = (root: unknown) => ({ version: FILTER_VERSION, root });
const and = (...children: unknown[]) => ({ kind: "group", op: "and", children });
const or = (...children: unknown[]) => ({ kind: "group", op: "or", children });

const accepts = (input: unknown) => expect(parseFilter(input).ok).toBe(true);
const rejects = (input: unknown) => expect(parseFilter(input).ok).toBe(false);

describe("the worked examples from filter-leaves.md", () => {
  it("accepts all six", () => {
    accepts(
      wrap(
        and(
          { kind: "predicate", leaf: "genre", op: "contains", value: "Action" },
          { kind: "predicate", leaf: "genre", op: "contains", value: "Thriller" },
          { kind: "predicate", leaf: "mediaType", op: "is", value: "movie" },
        ),
      ),
    );
    accepts(
      wrap(
        and(
          { kind: "predicate", leaf: "mediaType", op: "is", value: "tv" },
          { kind: "predicate", leaf: "rating", categoryId: CATEGORY, op: "gt", value: 5 },
        ),
      ),
    );
    accepts(
      wrap(
        and(
          or(
            { kind: "predicate", leaf: "mediaType", op: "is", value: "movie" },
            { kind: "predicate", leaf: "mediaType", op: "is", value: "tv" },
          ),
          { kind: "predicate", leaf: "castMember", op: "contains", personId: PERSON },
        ),
      ),
    );
    accepts(
      wrap(
        and(
          { kind: "predicate", leaf: "runtime", op: "lte", value: 100 },
          { kind: "predicate", leaf: "watched", op: "not_by_any" },
        ),
      ),
    );
    accepts(
      wrap(
        and(
          { kind: "predicate", leaf: "watchCount", op: "gte", value: 3 },
          {
            kind: "predicate",
            leaf: "lastWatched",
            op: "older_than",
            duration: { amount: 1, unit: "year" },
          },
        ),
      ),
    );
    accepts(
      wrap(
        or(
          { kind: "predicate", leaf: "genre", op: "not_contains", value: "Horror" },
          { kind: "predicate", leaf: "genre", op: "is_null" },
        ),
      ),
    );
  });
});

describe("accepts", () => {
  it("every rating modifier at once", () => {
    accepts(
      wrap(
        and({
          kind: "predicate",
          leaf: "rating",
          categoryId: CATEGORY,
          op: "between",
          min: 6,
          max: 9,
          raters: [USER],
          coverage: "all",
          aggregator: "min",
        }),
      ),
    );
  });

  it("references, absolute windows and draw scope", () => {
    accepts(
      wrap(
        and(
          { kind: "predicate", leaf: "tag", op: "has", tagId: TAG },
          { kind: "predicate", leaf: "addedBy", op: "is_not", userId: USER },
          { kind: "predicate", leaf: "lastDrawn", op: "is_null", scope: "household" },
          {
            kind: "predicate",
            leaf: "addedToLibrary",
            op: "between",
            from: "2024-01-01",
            to: "2024-12-31",
          },
        ),
      ),
    );
  });

  it("a filter serialised as JSON text", () => {
    // The column is jsonb in Postgres but lands in the local replica as text.
    accepts(
      JSON.stringify(
        wrap(and({ kind: "predicate", leaf: "mediaType", op: "is", value: "movie" })),
      ),
    );
  });
});

describe("rejects", () => {
  it("a NOT node, which the encoding deliberately lacks", () => {
    rejects(
      wrap({
        kind: "not",
        child: { kind: "predicate", leaf: "genre", op: "is_null" },
      }),
    );
  });

  it("a leaf outside the closed catalogue", () => {
    rejects(wrap(and({ kind: "predicate", leaf: "popularity", op: "gt", value: 5 })));
  });

  it("an operator the leaf does not accept", () => {
    // watchCount takes the comparisons but not `between`.
    rejects(
      wrap(and({ kind: "predicate", leaf: "watchCount", op: "between", min: 1, max: 3 })),
    );
    // lastWatched has no is_null; "never watched" is `watched not_by_any`.
    rejects(wrap(and({ kind: "predicate", leaf: "lastWatched", op: "is_null" })));
  });

  it("a rating outside 1–10", () => {
    rejects(
      wrap(and({ kind: "predicate", leaf: "rating", categoryId: CATEGORY, op: "eq", value: 11 })),
    );
  });

  it("a reversed range", () => {
    rejects(
      wrap(and({ kind: "predicate", leaf: "runtime", op: "between", min: 200, max: 90 })),
    );
  });

  it("a date that does not exist", () => {
    rejects(
      wrap(and({ kind: "predicate", leaf: "lastWatched", op: "before", date: "2026-02-31" })),
    );
  });

  it("an empty group, since no filter is a null column", () => {
    rejects(wrap(and()));
  });

  it("an empty rater list, since omitting it means the household", () => {
    rejects(
      wrap(
        and({
          kind: "predicate",
          leaf: "rating",
          categoryId: CATEGORY,
          op: "eq",
          value: 5,
          raters: [],
        }),
      ),
    );
  });

  it("a stray field", () => {
    rejects(
      wrap(
        and({
          kind: "predicate",
          leaf: "mediaType",
          op: "is",
          value: "movie",
          negate: true,
        }),
      ),
    );
  });

  it("a missing reference", () => {
    rejects(wrap(and({ kind: "predicate", leaf: "castMember", op: "contains" })));
  });

  it("a version newer than this client understands", () => {
    rejects({
      version: FILTER_VERSION + 1,
      root: and({ kind: "predicate", leaf: "genre", op: "is_null" }),
    });
  });

  it("malformed input", () => {
    rejects("{{{");
    rejects(null);
    rejects([]);
  });
});

describe("issues", () => {
  it("carry a path into the tree, so the builder can mark the row", () => {
    const result = parseFilter(
      wrap(
        and(
          { kind: "predicate", leaf: "mediaType", op: "is", value: "movie" },
          { kind: "predicate", leaf: "runtime", op: "lte", value: "long" },
        ) as unknown as FilterNode,
      ),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: "root.children[1].value", message: "expected a number" },
    ]);
  });
});
