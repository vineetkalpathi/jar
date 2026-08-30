/**
 * The filter builder's editable model.
 *
 * The stored Filter is a boolean tree (`./types.ts`, ADR-0009). Binding a sectioned
 * form to a tree directly is awkward, so the builder edits a `FilterDraft` — one flat
 * slice per section — and this module converts between the two.
 *
 * `draftToFilter` assembles the one shape the v1 builder is allowed to produce
 * (ADR-0002): an AND of predicates, with a nested OR group only where a section offers
 * "match any of these". `filterToDraft` is its best-effort inverse — it only has to
 * read back what `draftToFilter` writes, since that is the only producer today. A tree
 * it cannot place (a hand-authored one, or a future builder's) comes back as
 * `{ ...emptyDraft(), advanced: <the tree> }`, and the UI refuses to edit it section by
 * section until the user accepts replacing it.
 *
 * People are referenced by their local `person.id`. `draftToFilter` requires every
 * `PersonRef` to carry a resolved `personId` (the screen resolves TMDB ids through
 * `library.findOrCreatePerson` before calling this); an unresolved ref throws.
 */

import {
  FILTER_VERSION,
  type ComparisonOp,
  type DrawScope,
  type DurationUnit,
  type Filter,
  type FilterNode,
  type FilterPredicate,
  type MediaType,
  type RatingAggregator,
  type RatingCoverage,
} from "./types";

// ---------------------------------------------------------------------------
// Draft shape
// ---------------------------------------------------------------------------

export type PersonRef = {
  tmdbPersonId: number;
  name: string;
  /** The local `person.id`. Absent until the screen resolves it; required to save. */
  personId?: string;
};

export type Range = { min: number | null; max: number | null };

export type TimeDraft =
  | { mode: "within" | "older_than"; amount: number; unit: DurationUnit }
  | { mode: "before" | "after"; date: string }
  | { mode: "between"; from: string; to: string };

/** How several members' ratings are resolved for one rating rule. */
export type RaterScope = "household" | "me" | { userIds: string[] };

export type RatingClauseDraft = {
  categoryId: string;
  op: ComparisonOp | "between" | "is_not_null" | "is_null";
  value?: number;
  min?: number;
  max?: number;
  scope: RaterScope;
  /**
   * Also let a title through when it has no rating on this axis. Off by default —
   * a rating rule normally drops the unrated. Ignored when `op` is itself about
   * null-ness. Compiles to `<rule> OR (rating is_null)` for the one axis.
   */
  includeUnrated?: boolean;
  /** Omitted means "inherit the Household's Rating Policy" (ADR-0009). */
  coverage?: RatingCoverage;
  aggregator?: RatingAggregator;
};

export type WatchedMode =
  | "any"
  | "anyone"
  | "everyone"
  | "nobody"
  | "not_everyone";

export type FilterDraft = {
  mediaType: "any" | MediaType;
  genres: {
    include: string[];
    exclude: string[];
    includeUnknown: boolean;
    matchAll: boolean;
  };
  releaseYear: Range;
  runtime: Range;
  languages: string[];
  cast: PersonRef[];
  directors: PersonRef[];
  tags: { include: string[]; exclude: string[] };
  ratings: RatingClauseDraft[];
  watched: { mode: WatchedMode; population: string[] | null };
  watchCount: { op: ComparisonOp; value: number } | null;
  lastWatched: (TimeDraft & { population: string[] | null }) | null;
  addedToLibrary: TimeDraft | null;
  addedBy: { userId: string; negate: boolean } | null;
  lastDrawn: (({ mode: "never" } | TimeDraft) & { scope: DrawScope }) | null;
  /** Set by `filterToDraft` when it met a tree the sections cannot represent. */
  advanced?: Filter;
};

export class DraftError extends Error {}

export function emptyDraft(): FilterDraft {
  return {
    mediaType: "any",
    genres: { include: [], exclude: [], includeUnknown: false, matchAll: false },
    releaseYear: { min: null, max: null },
    runtime: { min: null, max: null },
    languages: [],
    cast: [],
    directors: [],
    tags: { include: [], exclude: [] },
    ratings: [],
    watched: { mode: "any", population: null },
    watchCount: null,
    lastWatched: null,
    addedToLibrary: null,
    addedBy: null,
    lastDrawn: null,
  };
}

// ---------------------------------------------------------------------------
// draft -> filter
// ---------------------------------------------------------------------------

/**
 * Builds a predicate node. Loosely typed on the way in — the leaf/operator/operand
 * combinations are the validator's job, and every result here is passed through
 * `parseFilter` before it is stored.
 */
const predicate = (p: Record<string, unknown>): FilterPredicate =>
  ({ kind: "predicate", ...p }) as unknown as FilterPredicate;

const orGroup = (children: FilterNode[]): FilterNode =>
  children.length === 1 ? children[0] : { kind: "group", op: "or", children };

/** Maps a `TimeDraft` to the operand fields a time predicate carries. */
function timeOperand(t: TimeDraft): Record<string, unknown> {
  switch (t.mode) {
    case "within":
    case "older_than":
      return { op: t.mode, duration: { amount: t.amount, unit: t.unit } };
    case "before":
    case "after":
      return { op: t.mode, date: t.date };
    case "between":
      return { op: "between", from: t.from, to: t.to };
  }
}

function rangePredicate(
  leaf: "releaseYear" | "runtime",
  range: Range,
): FilterPredicate | null {
  const min = range.min;
  const max = range.max;
  if (min != null && max != null) {
    return predicate({ leaf, op: "between", min, max } as never);
  }
  if (min != null) return predicate({ leaf, op: "gte", value: min } as never);
  if (max != null) return predicate({ leaf, op: "lte", value: max } as never);
  return null;
}

/**
 * Assembles the stored Filter for a draft, or `null` when nothing is set — which the
 * model reads as a hand-curated Jar / a clear Library view, never "match everything".
 *
 * `currentUserId` resolves a rating rule scoped to "me" into a concrete id, so the Jar
 * means the same thing on every device (ADR-0009).
 */
export function draftToFilter(
  draft: FilterDraft,
  currentUserId: string,
): Filter | null {
  if (draft.advanced) return draft.advanced;

  const children: FilterNode[] = [];

  if (draft.mediaType !== "any") {
    children.push(predicate({ leaf: "mediaType", op: "is", value: draft.mediaType }));
  }

  // Genres.
  //   - "Match all": every include and every exclude is its own AND child.
  //   - "Match any": the includes are one OR group; "include unknown" adds a
  //     `genre is_null` arm; excludes are AND'd outside as "none of these" — unless
  //     there are no includes, in which case the excludes themselves carry the OR, so
  //     "not Horror, or genre unknown" is one group with no nesting (ADR-0006).
  const { include, exclude, includeUnknown, matchAll } = draft.genres;
  const posContains = include.map((g) =>
    predicate({ leaf: "genre", op: "contains", value: g }),
  );
  const negContains = exclude.map((g) =>
    predicate({ leaf: "genre", op: "not_contains", value: g }),
  );

  if (matchAll) {
    children.push(...posContains, ...negContains);
  } else {
    const arms: FilterNode[] = [...posContains];
    if (arms.length === 0) arms.push(...negContains);
    if (includeUnknown) arms.push(predicate({ leaf: "genre", op: "is_null" }));
    if (arms.length > 0) children.push(orGroup(arms));
    if (posContains.length > 0) children.push(...negContains);
  }

  const year = rangePredicate("releaseYear", draft.releaseYear);
  if (year) children.push(year);
  const runtime = rangePredicate("runtime", draft.runtime);
  if (runtime) children.push(runtime);

  if (draft.languages.length > 0) {
    children.push(
      orGroup(
        draft.languages.map((l) =>
          predicate({ leaf: "language", op: "is", value: l }),
        ),
      ),
    );
  }

  for (const person of draft.cast) {
    children.push(
      predicate({ leaf: "castMember", op: "contains", personId: personId(person) }),
    );
  }
  for (const person of draft.directors) {
    children.push(
      predicate({ leaf: "director", op: "contains", personId: personId(person) }),
    );
  }

  for (const tagId of draft.tags.include) {
    children.push(predicate({ leaf: "tag", op: "has", tagId }));
  }
  for (const tagId of draft.tags.exclude) {
    children.push(predicate({ leaf: "tag", op: "not_has", tagId }));
  }

  for (const clause of draft.ratings) {
    children.push(ratingPredicate(clause, currentUserId));
  }

  const watchedOp = WATCHED_OP[draft.watched.mode];
  if (watchedOp) {
    const pop = nonEmpty(draft.watched.population);
    children.push(
      predicate({ leaf: "watched", op: watchedOp, ...(pop ? { population: pop } : {}) } as never),
    );
  }

  if (draft.watchCount) {
    children.push(
      predicate({
        leaf: "watchCount",
        op: draft.watchCount.op,
        value: draft.watchCount.value,
      } as never),
    );
  }

  if (draft.lastWatched) {
    const pop = nonEmpty(draft.lastWatched.population);
    children.push(
      predicate({
        leaf: "lastWatched",
        ...timeOperand(draft.lastWatched),
        ...(pop ? { population: pop } : {}),
      } as never),
    );
  }

  if (draft.addedToLibrary) {
    children.push(
      predicate({ leaf: "addedToLibrary", ...timeOperand(draft.addedToLibrary) } as never),
    );
  }

  if (draft.addedBy) {
    children.push(
      predicate({
        leaf: "addedBy",
        op: draft.addedBy.negate ? "is_not" : "is",
        userId: draft.addedBy.userId,
      } as never),
    );
  }

  if (draft.lastDrawn) {
    const scope = draft.lastDrawn.scope;
    const scopeField = scope === "household" ? { scope } : {};
    if (draft.lastDrawn.mode === "never") {
      children.push(predicate({ leaf: "lastDrawn", op: "is_null", ...scopeField } as never));
    } else {
      children.push(
        predicate({
          leaf: "lastDrawn",
          ...timeOperand(draft.lastDrawn),
          ...scopeField,
        } as never),
      );
    }
  }

  if (children.length === 0) return null;

  const root: FilterNode =
    children.length === 1 ? children[0] : { kind: "group", op: "and", children };

  return { version: FILTER_VERSION, root };
}

const WATCHED_OP: Record<WatchedMode, FilterPredicate["op"] | null> = {
  any: null,
  anyone: "by_any" as const,
  everyone: "by_all" as const,
  nobody: "not_by_any" as const,
  not_everyone: "not_by_all" as const,
};

function personId(person: PersonRef): string {
  if (!person.personId) {
    throw new DraftError(
      `Person "${person.name}" has no resolved id — resolve it before saving.`,
    );
  }
  return person.personId;
}

function nonEmpty(list: string[] | null): string[] | null {
  return list && list.length > 0 ? list : null;
}

function ratingPredicate(
  clause: RatingClauseDraft,
  currentUserId: string,
): FilterNode {
  const base: Record<string, unknown> = {
    leaf: "rating",
    categoryId: clause.categoryId,
  };

  if (clause.scope === "me") base.raters = [currentUserId];
  else if (typeof clause.scope === "object") base.raters = clause.scope.userIds;
  if (clause.coverage) base.coverage = clause.coverage;
  if (clause.aggregator) base.aggregator = clause.aggregator;

  const nullish = clause.op === "is_null" || clause.op === "is_not_null";
  const main = nullish
    ? predicate({ ...base, op: clause.op } as never)
    : clause.op === "between"
      ? predicate({ ...base, op: "between", min: clause.min, max: clause.max } as never)
      : predicate({ ...base, op: clause.op, value: clause.value } as never);

  // "Also keep unrated" — OR an is-null arm carrying the same rater / policy
  // modifiers. A no-op when the rule is already about null-ness.
  if (clause.includeUnrated && !nullish) {
    return orGroup([main, predicate({ ...base, op: "is_null" } as never)]);
  }
  return main;
}

// ---------------------------------------------------------------------------
// filter -> draft
// ---------------------------------------------------------------------------

/**
 * Reads a stored Filter back into a draft. Only trees `draftToFilter` produces are
 * understood; anything else returns a draft carrying the whole Filter as `advanced`,
 * which the builder surfaces rather than silently dropping.
 *
 * `currentUserId`, when given, collapses a rating rule whose raters are exactly
 * `[currentUserId]` back to the "me" scope for display.
 */
export function filterToDraft(
  filter: Filter | null,
  currentUserId?: string,
): FilterDraft {
  const draft = emptyDraft();
  if (!filter) return draft;

  const root = filter.root;
  const clauses: FilterNode[] =
    root.kind === "group" && root.op === "and" ? root.children : [root];

  const bail = (): FilterDraft => ({ ...emptyDraft(), advanced: filter });

  for (const node of clauses) {
    if (node.kind === "group") {
      if (node.op !== "or" || !absorbOrGroup(node.children, draft, currentUserId))
        return bail();
      continue;
    }
    if (!absorbPredicate(node, draft, currentUserId)) return bail();
  }

  return draft;
}

/** An OR group is genres, languages, a movie/tv either-or, or a rating "or unrated". */
function absorbOrGroup(
  children: FilterNode[],
  draft: FilterDraft,
  currentUserId?: string,
): boolean {
  const preds = children.filter((c): c is FilterPredicate => c.kind === "predicate");
  if (preds.length !== children.length) return false;

  const leaves = new Set(preds.map((p) => p.leaf));

  if ([...leaves].every((l) => l === "rating")) {
    // "<comparison> OR (rating is_null)" for one axis — the "include unrated" form.
    const nulls = preds.filter((p) => p.op === "is_null");
    const mains = preds.filter((p) => p.op !== "is_null");
    if (nulls.length !== 1 || mains.length !== 1) return false;
    const main = mains[0] as Extract<FilterPredicate, { leaf: "rating" }>;
    const nul = nulls[0] as Extract<FilterPredicate, { leaf: "rating" }>;
    if (main.categoryId !== nul.categoryId) return false;
    const clause = ratingClause(main, currentUserId);
    clause.includeUnrated = true;
    draft.ratings.push(clause);
    return true;
  }

  if ([...leaves].every((l) => l === "genre")) {
    for (const p of preds) {
      if (p.op === "contains") draft.genres.include.push((p as { value: string }).value);
      else if (p.op === "not_contains")
        draft.genres.exclude.push((p as { value: string }).value);
      else if (p.op === "is_null") draft.genres.includeUnknown = true;
      else return false;
    }
    draft.genres.matchAll = false;
    return true;
  }

  if ([...leaves].every((l) => l === "language")) {
    for (const p of preds) {
      if (p.op !== "is") return false;
      draft.languages.push((p as { value: string }).value);
    }
    return true;
  }

  if ([...leaves].every((l) => l === "mediaType")) {
    // any(movie, tv) is just "no media-type constraint".
    return preds.every((p) => p.op === "is");
  }

  return false;
}

function absorbPredicate(
  p: FilterPredicate,
  draft: FilterDraft,
  currentUserId?: string,
): boolean {
  switch (p.leaf) {
    case "mediaType":
      if (p.op !== "is") return false;
      draft.mediaType = p.value;
      return true;

    case "genre":
      if (p.op === "contains") {
        draft.genres.include.push(p.value);
        draft.genres.matchAll = true;
        return true;
      }
      if (p.op === "not_contains") {
        draft.genres.exclude.push(p.value);
        return true;
      }
      if (p.op === "is_null") {
        draft.genres.includeUnknown = true;
        return true;
      }
      return false;

    case "releaseYear":
      return absorbRange(p, draft.releaseYear);
    case "runtime":
      return absorbRange(p, draft.runtime);

    case "language":
      if (p.op !== "is") return false;
      draft.languages.push(p.value);
      return true;

    case "castMember":
      if (p.op !== "contains") return false;
      draft.cast.push({ tmdbPersonId: 0, name: "", personId: p.personId });
      return true;
    case "director":
      if (p.op !== "contains") return false;
      draft.directors.push({ tmdbPersonId: 0, name: "", personId: p.personId });
      return true;

    case "tag":
      if (p.op === "has") draft.tags.include.push(p.tagId);
      else draft.tags.exclude.push(p.tagId);
      return true;

    case "rating":
      draft.ratings.push(ratingClause(p, currentUserId));
      return true;

    case "watched": {
      const mode = WATCHED_MODE[p.op];
      if (!mode) return false;
      draft.watched = { mode, population: p.population ?? null };
      return true;
    }

    case "watchCount":
      draft.watchCount = { op: p.op, value: p.value };
      return true;

    case "lastWatched": {
      const time = readTime(p);
      if (!time) return false;
      draft.lastWatched = { ...time, population: p.population ?? null };
      return true;
    }

    case "addedToLibrary": {
      const time = readTime(p);
      if (!time) return false;
      draft.addedToLibrary = time;
      return true;
    }

    case "addedBy":
      draft.addedBy = { userId: p.userId, negate: p.op === "is_not" };
      return true;

    case "lastDrawn": {
      const scope: DrawScope = p.scope ?? "this_jar";
      if (p.op === "is_null") {
        draft.lastDrawn = { mode: "never", scope };
        return true;
      }
      const time = readTime(p);
      if (!time) return false;
      draft.lastDrawn = { ...time, scope };
      return true;
    }
  }
}

const WATCHED_MODE: Record<string, WatchedMode | undefined> = {
  by_any: "anyone",
  by_all: "everyone",
  not_by_any: "nobody",
  not_by_all: "not_everyone",
};

function absorbRange(
  p: Extract<FilterPredicate, { leaf: "releaseYear" | "runtime" }>,
  range: Range,
): boolean {
  switch (p.op) {
    case "between":
      range.min = p.min;
      range.max = p.max;
      return true;
    case "gte":
      range.min = p.value;
      return true;
    case "lte":
      range.max = p.value;
      return true;
    case "gt":
      range.min = p.value + 1;
      return true;
    case "lt":
      range.max = p.value - 1;
      return true;
    default:
      return false;
  }
}

function readTime(p: FilterPredicate & { op: string }): TimeDraft | null {
  const q = p as unknown as Record<string, unknown>;
  switch (p.op) {
    case "within":
    case "older_than": {
      const d = q.duration as { amount: number; unit: DurationUnit };
      return { mode: p.op, amount: d.amount, unit: d.unit };
    }
    case "before":
    case "after":
      return { mode: p.op, date: q.date as string };
    case "between":
      return { mode: "between", from: q.from as string, to: q.to as string };
    default:
      return null;
  }
}

function ratingClause(
  p: Extract<FilterPredicate, { leaf: "rating" }>,
  currentUserId?: string,
): RatingClauseDraft {
  const raters = (p as { raters?: string[] }).raters;
  let scope: RaterScope = "household";
  if (raters && raters.length > 0) {
    scope =
      currentUserId && raters.length === 1 && raters[0] === currentUserId
        ? "me"
        : { userIds: raters };
  }

  const clause: RatingClauseDraft = {
    categoryId: p.categoryId,
    op: p.op as RatingClauseDraft["op"],
    scope,
  };
  if ("value" in p) clause.value = (p as { value: number }).value;
  if ("min" in p) clause.min = (p as { min: number }).min;
  if ("max" in p) clause.max = (p as { max: number }).max;
  const cov = (p as { coverage?: RatingCoverage }).coverage;
  const agg = (p as { aggregator?: RatingAggregator }).aggregator;
  if (cov) clause.coverage = cov;
  if (agg) clause.aggregator = agg;
  return clause;
}

/**
 * A Filter for the live match count, tolerant of a half-finished draft: people not yet
 * resolved to a local id are dropped rather than thrown on, so the count keeps updating
 * while a cast chip is mid-add. Never persist this — use `resolveDraftFilter`.
 */
export function draftToPreviewFilter(
  draft: FilterDraft,
  currentUserId: string,
): Filter | null {
  const pruned: FilterDraft = {
    ...draft,
    cast: draft.cast.filter((p) => p.personId),
    directors: draft.directors.filter((p) => p.personId),
  };
  try {
    return draftToFilter(pruned, currentUserId);
  } catch {
    return null;
  }
}

/** True when a draft carries no rule — it would produce no Filter at all. */
export function isEmptyDraft(draft: FilterDraft): boolean {
  if (draft.advanced) return false;
  const g = draft.genres;
  return (
    draft.mediaType === "any" &&
    g.include.length === 0 &&
    g.exclude.length === 0 &&
    !g.includeUnknown &&
    draft.releaseYear.min == null &&
    draft.releaseYear.max == null &&
    draft.runtime.min == null &&
    draft.runtime.max == null &&
    draft.languages.length === 0 &&
    draft.cast.length === 0 &&
    draft.directors.length === 0 &&
    draft.tags.include.length === 0 &&
    draft.tags.exclude.length === 0 &&
    draft.ratings.length === 0 &&
    draft.watched.mode === "any" &&
    draft.watchCount == null &&
    draft.lastWatched == null &&
    draft.addedToLibrary == null &&
    draft.addedBy == null &&
    draft.lastDrawn == null
  );
}
