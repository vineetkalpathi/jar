/**
 * The JSON encoding of a Jar Filter.
 *
 * `jar.filter` is `jsonb` and opaque to Postgres; this module is the only definition of
 * what may legally sit in it. The leaf catalogue is closed (docs/filter-leaves.md) and
 * the evaluation rules are ADR-0006; the reasoning behind this particular shape is
 * ADR-0009.
 *
 * Two things a reader will be tempted to "fix", both deliberate:
 *
 *   - There is no NOT node. Negation lives in each leaf's operators (`is_not`,
 *     `not_contains`, `not_by_any`). ADR-0006 requires that unknown never matches and
 *     that negation does not rescue it, which is a property of the SQL each operator
 *     emits. A generic NOT node invites wrapping a subtree in `NOT (...)`, which turns
 *     unknown into true and quietly breaks that rule.
 *   - References are bare ids, with no denormalised display name alongside. A name kept
 *     here would be a second source of truth for something already stored once.
 */

// ---------------------------------------------------------------------------
// Operators
//
// Declared as const arrays and the unions derived from them, so the runtime specs the
// validator walks and the compile-time types cannot drift apart.
// ---------------------------------------------------------------------------

export const COMPARISON_OPS = ["eq", "ne", "lt", "lte", "gt", "gte"] as const;
export type ComparisonOp = (typeof COMPARISON_OPS)[number];

export const DURATION_UNITS = ["day", "week", "month", "year"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

export const RATING_COVERAGES = ["any", "all"] as const;
export type RatingCoverage = (typeof RATING_COVERAGES)[number];

export const RATING_AGGREGATORS = ["avg", "min", "max"] as const;
export type RatingAggregator = (typeof RATING_AGGREGATORS)[number];

export const MEDIA_TYPES = ["movie", "tv"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const DRAW_SCOPES = ["this_jar", "household"] as const;
export type DrawScope = (typeof DRAW_SCOPES)[number];

/** Relative durations are what a long-lived Jar should normally use — ADR-0006. */
export type Duration = { amount: number; unit: DurationUnit };

// ---------------------------------------------------------------------------
// Operand shapes
//
// The operand a predicate carries is a function of its operator, so illegal
// combinations — a `between` with one bound, an `is_null` with a value — are
// unrepresentable rather than merely rejected.
// ---------------------------------------------------------------------------

export type NumericOperand =
  | { op: ComparisonOp; value: number }
  | { op: "between"; min: number; max: number };

export type TimeOperand =
  | { op: "older_than" | "within"; duration: Duration }
  | { op: "before" | "after"; date: string }
  | { op: "between"; from: string; to: string };

export type IsNullOperand = { op: "is_null" };
export type IsNotNullOperand = { op: "is_not_null" };

// ---------------------------------------------------------------------------
// Modifiers
//
// Every modifier is optional, and omitting one means "inherit", not "the default value
// frozen at save time". Changing a Household's Rating Policy therefore changes what its
// existing Jars mean, which is the point of having a Household-level policy at all.
//
// The exception is `raters` / `population`: naming people explicitly freezes them. The
// builder's "my ratings" resolves to a concrete user id when the Jar is saved, never a
// live self-reference, so a Jar means the same thing on every device.
// ---------------------------------------------------------------------------

export type RatingModifiers = {
  /** Omitted: the whole Household. */
  raters?: string[];
  /** Omitted: the Household's `rating_coverage`. */
  coverage?: RatingCoverage;
  /** Omitted: the Household's `rating_aggregator`. */
  aggregator?: RatingAggregator;
};

export type ViewingModifiers = {
  /** Omitted: the whole Household. */
  population?: string[];
};

// ---------------------------------------------------------------------------
// Predicates — the closed leaf catalogue
// ---------------------------------------------------------------------------

type Leaf<K extends string> = { kind: "predicate"; leaf: K };

/** Title Attributes. Cached from TMDB, absolute, and unknown for unlinked Titles. */
export type MediaTypePredicate = Leaf<"mediaType"> & {
  op: "is" | "is_not";
  value: MediaType;
};

export type GenrePredicate = Leaf<"genre"> &
  (
    | { op: "contains" | "not_contains"; value: string }
    | IsNullOperand
  );

export type ReleaseYearPredicate = Leaf<"releaseYear"> &
  (NumericOperand | IsNullOperand);

export type RuntimePredicate = Leaf<"runtime"> & (NumericOperand | IsNullOperand);

export type LanguagePredicate = Leaf<"language"> &
  (
    | { op: "is" | "is_not"; value: string }
    | IsNullOperand
  );

export type CastMemberPredicate = Leaf<"castMember"> & {
  op: "contains" | "not_contains";
  personId: string;
};

export type DirectorPredicate = Leaf<"director"> & {
  op: "contains" | "not_contains";
  personId: string;
};

/** Tags — household vocabulary. */
export type TagPredicate = Leaf<"tag"> & {
  op: "has" | "not_has";
  tagId: string;
};

/** Ratings — three-valued; an unrated Title never matches, in either polarity. */
export type RatingPredicate = Leaf<"rating"> & {
  categoryId: string;
} & (NumericOperand | IsNullOperand | IsNotNullOperand) &
  RatingModifiers;

/** Viewings — closed-world. A Viewing row exists or it does not; there is no unknown. */
export type WatchedPredicate = Leaf<"watched"> & {
  op: "by_any" | "by_all" | "not_by_any" | "not_by_all";
} & ViewingModifiers;

export type WatchCountPredicate = Leaf<"watchCount"> & {
  op: ComparisonOp;
  value: number;
} & ViewingModifiers;

/**
 * Aggregated MAX over the population: "we haven't seen it in two years" means the most
 * recent Viewing by anyone. A Title with no Viewings at all fails this leaf under every
 * operator — "never watched" is `watched not_by_any`, not a null case here.
 */
export type LastWatchedPredicate = Leaf<"lastWatched"> &
  TimeOperand &
  ViewingModifiers;

/** Library and Draw history. */
export type AddedToLibraryPredicate = Leaf<"addedToLibrary"> & TimeOperand;

export type AddedByPredicate = Leaf<"addedBy"> & {
  op: "is" | "is_not";
  userId: string;
};

export type LastDrawnPredicate = Leaf<"lastDrawn"> &
  (TimeOperand | IsNullOperand) & {
    /** Omitted: this Jar alone, which is what "never picked" ordinarily means. */
    scope?: DrawScope;
  };

export type FilterPredicate =
  | MediaTypePredicate
  | GenrePredicate
  | ReleaseYearPredicate
  | RuntimePredicate
  | LanguagePredicate
  | CastMemberPredicate
  | DirectorPredicate
  | TagPredicate
  | RatingPredicate
  | WatchedPredicate
  | WatchCountPredicate
  | LastWatchedPredicate
  | AddedToLibraryPredicate
  | AddedByPredicate
  | LastDrawnPredicate;

export type LeafKind = FilterPredicate["leaf"];

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

export type FilterGroup = {
  kind: "group";
  op: "and" | "or";
  /** Never empty. "No filter" is a null `jar.filter` column, not an empty group. */
  children: FilterNode[];
};

export type FilterNode = FilterGroup | FilterPredicate;

/**
 * A stored Filter. The version is checked rather than ignored: a client that meets a
 * Filter newer than it understands refuses it outright, because the failure mode of
 * guessing is a Jar that quietly serves the wrong Titles.
 */
export type Filter = {
  version: number;
  root: FilterNode;
};

export const FILTER_VERSION = 1;

/** Guards against a pathological tree; the v1 builder produces two levels (ADR-0002). */
export const MAX_FILTER_DEPTH = 8;

// ---------------------------------------------------------------------------
// Leaf specifications
//
// The runtime half of the catalogue, walked by the validator and — in due course — by
// the SQL compiler. Typed as a total Record over LeafKind, so adding a leaf to the union
// above without describing it here fails to compile.
// ---------------------------------------------------------------------------

/**
 * Which operand a `between` (and the comparison operators) carries. The operator alone
 * does not say: `between` spans numbers on `runtime` and dates on `lastWatched`.
 */
export type OperandFamily = "numeric" | "text" | "enum" | "time" | "ref" | "flag";

export type LeafSpec = {
  family: OperandFamily;
  ops: readonly string[];
  /** Permitted values, for the `enum` family. */
  values?: readonly string[];
  /** A required id field naming what the predicate is about. */
  ref?: "categoryId" | "tagId" | "personId" | "userId";
  /** Constraints on a `numeric` operand. */
  numeric?: { integer: boolean; min?: number; max?: number };
  /** Optional modifier fields this leaf accepts. */
  modifiers?: readonly ("raters" | "coverage" | "aggregator" | "population" | "scope")[];
};

const COMPARISON = COMPARISON_OPS;
const TIME_OPS = ["older_than", "within", "before", "after", "between"] as const;

export const LEAF_SPECS: Record<LeafKind, LeafSpec> = {
  mediaType: {
    family: "enum",
    ops: ["is", "is_not"],
    values: MEDIA_TYPES,
  },
  genre: {
    family: "text",
    ops: ["contains", "not_contains", "is_null"],
  },
  releaseYear: {
    family: "numeric",
    ops: [...COMPARISON, "between", "is_null"],
    numeric: { integer: true },
  },
  runtime: {
    family: "numeric",
    ops: [...COMPARISON, "between", "is_null"],
    numeric: { integer: true, min: 0 },
  },
  language: {
    family: "text",
    ops: ["is", "is_not", "is_null"],
  },
  castMember: {
    family: "ref",
    ops: ["contains", "not_contains"],
    ref: "personId",
  },
  director: {
    family: "ref",
    ops: ["contains", "not_contains"],
    ref: "personId",
  },
  tag: {
    family: "ref",
    ops: ["has", "not_has"],
    ref: "tagId",
  },
  rating: {
    family: "numeric",
    ops: [...COMPARISON, "between", "is_null", "is_not_null"],
    ref: "categoryId",
    // Ratings carry one decimal place, so a threshold can too ("Plot ≥ 7.5"). Scale 0–10.
    numeric: { integer: false, min: 0, max: 10 },
    modifiers: ["raters", "coverage", "aggregator"],
  },
  watched: {
    family: "flag",
    ops: ["by_any", "by_all", "not_by_any", "not_by_all"],
    modifiers: ["population"],
  },
  watchCount: {
    // No `between`: the catalogue gives watchCount the comparisons only.
    family: "numeric",
    ops: COMPARISON,
    numeric: { integer: true, min: 0 },
    modifiers: ["population"],
  },
  lastWatched: {
    family: "time",
    ops: TIME_OPS,
    modifiers: ["population"],
  },
  addedToLibrary: {
    family: "time",
    ops: TIME_OPS,
  },
  addedBy: {
    family: "ref",
    ops: ["is", "is_not"],
    ref: "userId",
  },
  lastDrawn: {
    // `is_null` is "never drawn". lastWatched has no counterpart because "never
    // watched" is already expressible as `watched not_by_any`.
    family: "time",
    ops: [...TIME_OPS, "is_null"],
    modifiers: ["scope"],
  },
};
