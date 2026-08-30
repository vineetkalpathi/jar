/**
 * Turning a `FilterDraft` into the chips the builder shows — one per condition, each a
 * flat run of labelled segments that reads as a sentence:
 *
 *   [Runtime] [is between] [1 hr] [and] [3 hr]
 *   [Cast] [includes] [Zendaya]
 *   [Title type] [is] [Movie]
 *
 * Pure and synchronous. Everything it needs that isn't in the draft — tag, category,
 * member and person display names — comes in through `ChipContext`, so the builder can
 * source those from wherever (live queries, the `PersonRef` itself) and this stays
 * testable. The inverse ("apply an edit") is not here: the builder writes straight back
 * into the draft slice, and `draftToChips` re-derives.
 */

import { ATTR_LABEL, type AttrKey } from "./catalogue";
import type { FilterDraft, PersonRef, RatingClauseDraft, TimeDraft } from "./draft";

export type ChipSegment = {
  kind: "attr" | "op" | "value" | "join" | "note";
  text: string;
};

export type Chip = {
  /** Stable across renders: the attribute, plus a ref id for the multi attributes. */
  id: string;
  attr: AttrKey;
  /** person / tag / category id — which row of a multi attribute this chip edits. */
  refId?: string;
  segments: ChipSegment[];
};

export type ChipContext = {
  tagName: (id: string) => string;
  categoryName: (id: string) => string;
  memberName: (id: string) => string;
  personName: (ref: PersonRef) => string;
  currentUserId: string;
};

const attr = (text: string): ChipSegment => ({ kind: "attr", text });
const op = (text: string): ChipSegment => ({ kind: "op", text });
const val = (text: string): ChipSegment => ({ kind: "value", text });
const join = (text: string): ChipSegment => ({ kind: "join", text });
const note = (text: string): ChipSegment => ({ kind: "note", text });

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** Segments for a `TimeDraft`, minus the leading attribute. */
function timeSegments(t: TimeDraft): ChipSegment[] {
  switch (t.mode) {
    case "within":
      return [op("in the last"), val(plural(t.amount, t.unit))];
    case "older_than":
      return [op("over"), val(plural(t.amount, t.unit)), note("ago")];
    case "before":
      return [op("before"), val(t.date || "—")];
    case "after":
      return [op("after"), val(t.date || "—")];
    case "between":
      return [op("between"), val(t.from || "—"), join("and"), val(t.to || "—")];
  }
}

const NUMERIC_OP_LABEL: Record<string, string> = {
  eq: "is",
  ne: "is not",
  lt: "is under",
  lte: "is at most",
  gt: "is over",
  gte: "is at least",
};

// ---------------------------------------------------------------------------
// draft -> chips
// ---------------------------------------------------------------------------

export function draftToChips(draft: FilterDraft, ctx: ChipContext): Chip[] {
  const chips: Chip[] = [];
  const push = (
    id: string,
    key: AttrKey,
    segments: ChipSegment[],
    refId?: string,
  ) => chips.push({ id, attr: key, refId, segments });

  // --- Title type -------------------------------------------------------------
  if (draft.mediaType !== "any") {
    push("mediaType", "mediaType", [
      attr(ATTR_LABEL.mediaType),
      op("is"),
      val(draft.mediaType === "movie" ? "Movie" : "TV"),
    ]);
  }

  // --- Genre ----------------------------------------------------------------
  const g = draft.genres;
  if (g.include.length > 0 || g.includeUnknown) {
    const joined = g.include.join(g.matchAll ? " and " : " or ");
    const segs = [
      attr(ATTR_LABEL.genre),
      op(g.matchAll && g.include.length > 1 ? "is all of" : "is"),
    ];
    if (joined) segs.push(val(joined));
    if (g.includeUnknown) {
      if (joined) segs.push(join("or"));
      segs.push(val("no genre"));
    }
    push("genre:include", "genre", segs);
  }
  if (g.exclude.length > 0) {
    push("genre:exclude", "genre", [
      attr(ATTR_LABEL.genre),
      op("is not"),
      val(g.exclude.join(" or ")),
    ]);
  }

  // --- Release year / Runtime ----------------------------------------------
  pushRange("releaseYear", draft.releaseYear, (n) => String(n));
  pushRange("runtime", draft.runtime, formatRuntime);

  function pushRange(
    key: "releaseYear" | "runtime",
    range: { min: number | null; max: number | null },
    fmt: (n: number) => string,
  ) {
    const { min, max } = range;
    if (min == null && max == null) return;
    const head = attr(ATTR_LABEL[key]);
    if (min != null && max != null) {
      push(key, key, [head, op("is between"), val(fmt(min)), join("and"), val(fmt(max))]);
    } else if (min != null) {
      push(key, key, [head, op("is at least"), val(fmt(min))]);
    } else if (max != null) {
      push(key, key, [head, op("is at most"), val(fmt(max))]);
    }
  }

  // --- Original language --------------------------------------------------
  if (draft.languages.length > 0) {
    push("language", "language", [
      attr(ATTR_LABEL.language),
      op("is"),
      val(draft.languages.join(" or ")),
    ]);
  }

  // --- Cast / Director --------------------------------------------------
  for (const person of draft.cast) {
    const ref = person.personId ?? String(person.tmdbPersonId);
    push(`cast:${ref}`, "cast", [
      attr(ATTR_LABEL.cast),
      op("includes"),
      val(ctx.personName(person)),
    ], ref);
  }
  for (const person of draft.directors) {
    const ref = person.personId ?? String(person.tmdbPersonId);
    push(`director:${ref}`, "director", [
      attr(ATTR_LABEL.director),
      op("is"),
      val(ctx.personName(person)),
    ], ref);
  }

  // --- Tags --------------------------------------------------
  for (const id of draft.tags.include) {
    push(`tag:${id}`, "tag", [attr(ATTR_LABEL.tag), op("has"), val(ctx.tagName(id))], id);
  }
  for (const id of draft.tags.exclude) {
    push(
      `tag:${id}`,
      "tag",
      [attr(ATTR_LABEL.tag), op("doesn't have"), val(ctx.tagName(id))],
      id,
    );
  }

  // --- Ratings --------------------------------------------------
  for (const clause of draft.ratings) {
    push(
      `rating:${clause.categoryId}`,
      "rating",
      ratingSegments(clause, ctx),
      clause.categoryId,
    );
  }

  // --- Seen by --------------------------------------------------
  if (draft.watched.mode !== "any") {
    const phrase: Record<string, string> = {
      anyone: "by anyone",
      everyone: "by everyone",
      nobody: "by nobody",
      not_everyone: "not by everyone",
    };
    const segs = [attr("Seen"), op(phrase[draft.watched.mode])];
    const pop = draft.watched.population;
    if (pop && pop.length > 0) segs.push(note(`· ${popLabel(pop, ctx)}`));
    push("watched", "watched", segs);
  }

  // --- Rewatch count --------------------------------------------------
  if (draft.watchCount) {
    push("watchCount", "watchCount", [
      attr(ATTR_LABEL.watchCount),
      op(NUMERIC_OP_LABEL[draft.watchCount.op] ?? "is"),
      val(String(draft.watchCount.value)),
    ]);
  }

  // --- Last watched --------------------------------------------------
  if (draft.lastWatched) {
    const segs = [attr(ATTR_LABEL.lastWatched), ...timeSegments(draft.lastWatched)];
    const pop = draft.lastWatched.population;
    if (pop && pop.length > 0) segs.push(note(`· ${popLabel(pop, ctx)}`));
    push("lastWatched", "lastWatched", segs);
  }

  // --- Added to library --------------------------------------------------
  if (draft.addedToLibrary) {
    push("addedToLibrary", "addedToLibrary", [
      attr(ATTR_LABEL.addedToLibrary),
      ...timeSegments(draft.addedToLibrary),
    ]);
  }

  // --- Added by --------------------------------------------------
  if (draft.addedBy) {
    push("addedBy", "addedBy", [
      attr(ATTR_LABEL.addedBy),
      op(draft.addedBy.negate ? "is not" : "is"),
      val(ctx.memberName(draft.addedBy.userId)),
    ]);
  }

  // --- Draw history --------------------------------------------------
  if (draft.lastDrawn) {
    const scopeNote = note(
      draft.lastDrawn.scope === "household" ? "· any jar" : "· this jar",
    );
    if (draft.lastDrawn.mode === "never") {
      push("lastDrawn", "lastDrawn", [
        attr(ATTR_LABEL.lastDrawn),
        op("never drawn"),
        scopeNote,
      ]);
    } else {
      push("lastDrawn", "lastDrawn", [
        attr("Last drawn"),
        ...timeSegments(draft.lastDrawn),
        scopeNote,
      ]);
    }
  }

  return chips;
}

function ratingSegments(clause: RatingClauseDraft, ctx: ChipContext): ChipSegment[] {
  const head = attr(ctx.categoryName(clause.categoryId));
  const scope =
    clause.scope === "me"
      ? note("· my rating")
      : typeof clause.scope === "object"
        ? note(`· ${popLabel(clause.scope.userIds, ctx)}`)
        : null;

  let body: ChipSegment[];
  if (clause.op === "is_null") body = [op("is unrated")];
  else if (clause.op === "is_not_null") body = [op("is rated")];
  else if (clause.op === "between") {
    body = [
      op("is between"),
      val(String(clause.min ?? "—")),
      join("and"),
      val(String(clause.max ?? "—")),
    ];
  } else {
    body = [op(NUMERIC_OP_LABEL[clause.op] ?? "is"), val(String(clause.value ?? "—"))];
  }

  const trail: ChipSegment[] = [];
  if (clause.includeUnrated && clause.op !== "is_null" && clause.op !== "is_not_null") {
    trail.push(join("or"), val("unrated"));
  }
  if (scope) trail.push(scope);

  return [head, ...body, ...trail];
}

function popLabel(userIds: string[], ctx: ChipContext): string {
  if (userIds.length === 1) return ctx.memberName(userIds[0]);
  if (userIds.length === 2)
    return `${ctx.memberName(userIds[0])} & ${ctx.memberName(userIds[1])}`;
  return `${userIds.length} people`;
}

// ---------------------------------------------------------------------------
// chip -> draft (removing one)
// ---------------------------------------------------------------------------

/**
 * Clears the slice of the draft that a chip stands for. `chipId` distinguishes the two
 * genre chips (include vs exclude); `refId` names the person / tag / category row for
 * the multi attributes. The inverse of `draftToChips` for the one operation the builder
 * and the library bar both need — dropping a single condition.
 */
export function removeChip(
  draft: FilterDraft,
  attr: AttrKey,
  chipId: string,
  refId?: string,
): FilterDraft {
  switch (attr) {
    case "mediaType":
      return { ...draft, mediaType: "any" };
    case "genre":
      return chipId === "genre:exclude"
        ? { ...draft, genres: { ...draft.genres, exclude: [] } }
        : {
            ...draft,
            genres: { ...draft.genres, include: [], includeUnknown: false },
          };
    case "releaseYear":
      return { ...draft, releaseYear: { min: null, max: null } };
    case "runtime":
      return { ...draft, runtime: { min: null, max: null } };
    case "language":
      return { ...draft, languages: [] };
    case "cast":
      return {
        ...draft,
        cast: draft.cast.filter(
          (p) => (p.personId ?? String(p.tmdbPersonId)) !== refId,
        ),
      };
    case "director":
      return {
        ...draft,
        directors: draft.directors.filter(
          (p) => (p.personId ?? String(p.tmdbPersonId)) !== refId,
        ),
      };
    case "tag":
      return {
        ...draft,
        tags: {
          include: draft.tags.include.filter((x) => x !== refId),
          exclude: draft.tags.exclude.filter((x) => x !== refId),
        },
      };
    case "rating":
      return {
        ...draft,
        ratings: draft.ratings.filter((r) => r.categoryId !== refId),
      };
    case "watched":
      return { ...draft, watched: { mode: "any", population: null } };
    case "watchCount":
      return { ...draft, watchCount: null };
    case "lastWatched":
      return { ...draft, lastWatched: null };
    case "addedToLibrary":
      return { ...draft, addedToLibrary: null };
    case "addedBy":
      return { ...draft, addedBy: null };
    case "lastDrawn":
      return { ...draft, lastDrawn: null };
  }
}
