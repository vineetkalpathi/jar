/**
 * Validation for the Filter encoding in `./types.ts`.
 *
 * A Filter arrives from three directions — the builder, the local SQLite replica, and
 * another device via sync — and only the first is under this client's control. Nothing
 * should compile a Filter to SQL without passing it through here first.
 *
 * Issues are collected rather than thrown on the first failure, because the filter
 * builder wants to mark every bad row at once, and each carries a path into the tree
 * (`root.children[2].value`) so it can find the row to mark.
 */

import {
  DRAW_SCOPES,
  DURATION_UNITS,
  FILTER_VERSION,
  LEAF_SPECS,
  MAX_FILTER_DEPTH,
  RATING_AGGREGATORS,
  RATING_COVERAGES,
  type Filter,
  type FilterNode,
  type LeafKind,
  type LeafSpec,
} from "./types";

export type FilterIssue = { path: string; message: string };

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: FilterIssue[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Operators taking no operand at all. */
const NULLARY_OPS = new Set(["is_null", "is_not_null"]);

/**
 * Parse and validate a stored Filter.
 *
 * Accepts a string as well as an object: `jar.filter` is `jsonb` in Postgres but lands
 * in the local SQLite replica as text, so both forms turn up in practice.
 */
export function parseFilter(input: unknown): ParseResult<Filter> {
  let raw = input;

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return fail([{ path: "", message: "not valid JSON" }]);
    }
  }

  if (!isRecord(raw)) {
    return fail([{ path: "", message: "expected an object" }]);
  }

  const issues: FilterIssue[] = [];

  if (typeof raw.version !== "number" || !Number.isInteger(raw.version)) {
    issues.push({ path: "version", message: "expected an integer" });
  } else if (raw.version > FILTER_VERSION) {
    // Refuse rather than guess. Evaluating a Filter we only partly understand yields a
    // Jar that silently serves the wrong Titles, which is worse than showing nothing.
    issues.push({
      path: "version",
      message: `filter version ${raw.version} is newer than this client understands (${FILTER_VERSION})`,
    });
  } else if (raw.version < 1) {
    issues.push({ path: "version", message: "expected a version of at least 1" });
  }

  rejectUnknownKeys(raw, ["version", "root"], "", issues);

  // A newer version may legally hold a shape this client cannot read, so don't add
  // confusing structural complaints on top of the version complaint.
  if (issues.length > 0) return fail(issues);

  validateNode(raw.root, "root", 1, issues);

  if (issues.length > 0) return fail(issues);
  return { ok: true, value: raw as unknown as Filter };
}

/** True when `input` is a well-formed Filter this client can evaluate. */
export function isFilter(input: unknown): input is Filter {
  return parseFilter(input).ok;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

function validateNode(
  node: unknown,
  path: string,
  depth: number,
  issues: FilterIssue[],
): void {
  if (!isRecord(node)) {
    issues.push({ path, message: "expected an object" });
    return;
  }

  if (depth > MAX_FILTER_DEPTH) {
    issues.push({
      path,
      message: `nested deeper than ${MAX_FILTER_DEPTH} levels`,
    });
    return;
  }

  switch (node.kind) {
    case "group":
      validateGroup(node, path, depth, issues);
      return;
    case "predicate":
      validatePredicate(node, path, issues);
      return;
    default:
      issues.push({
        path: `${path}.kind`,
        message: 'expected "group" or "predicate"',
      });
  }
}

function validateGroup(
  node: Record<string, unknown>,
  path: string,
  depth: number,
  issues: FilterIssue[],
): void {
  rejectUnknownKeys(node, ["kind", "op", "children"], path, issues);

  if (node.op !== "and" && node.op !== "or") {
    issues.push({ path: `${path}.op`, message: 'expected "and" or "or"' });
  }

  if (!Array.isArray(node.children)) {
    issues.push({ path: `${path}.children`, message: "expected an array" });
    return;
  }

  if (node.children.length === 0) {
    // An empty AND matches everything and an empty OR matches nothing — a distinction
    // no user ever meant to draw. A Jar with no Filter is a null column instead.
    issues.push({
      path: `${path}.children`,
      message: "a group must have at least one child",
    });
    return;
  }

  node.children.forEach((child, i) => {
    validateNode(child, `${path}.children[${i}]`, depth + 1, issues);
  });
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

function validatePredicate(
  node: Record<string, unknown>,
  path: string,
  issues: FilterIssue[],
): void {
  const leaf = node.leaf;

  if (typeof leaf !== "string" || !(leaf in LEAF_SPECS)) {
    issues.push({
      path: `${path}.leaf`,
      message: `unknown leaf ${JSON.stringify(leaf)}; the catalogue is closed`,
    });
    return;
  }

  const spec = LEAF_SPECS[leaf as LeafKind];
  const op = node.op;

  if (typeof op !== "string" || !spec.ops.includes(op)) {
    issues.push({
      path: `${path}.op`,
      message: `${leaf} accepts ${spec.ops.join(", ")}`,
    });
    return;
  }

  const allowed = ["kind", "leaf", "op"];
  if (spec.ref) allowed.push(spec.ref);
  if (spec.modifiers) allowed.push(...spec.modifiers);
  allowed.push(...operandKeys(spec, op));
  rejectUnknownKeys(node, allowed, path, issues);

  if (spec.ref) validateUuid(node[spec.ref], `${path}.${spec.ref}`, issues);

  validateOperand(node, spec, op, path, issues);
  validateModifiers(node, spec, path, issues);
}

/** Which operand fields an operator carries, given the leaf's family. */
function operandKeys(spec: LeafSpec, op: string): string[] {
  if (NULLARY_OPS.has(op)) return [];

  switch (spec.family) {
    case "ref":
    case "flag":
      return [];
    case "enum":
    case "text":
      return ["value"];
    case "numeric":
      return op === "between" ? ["min", "max"] : ["value"];
    case "time":
      if (op === "older_than" || op === "within") return ["duration"];
      if (op === "between") return ["from", "to"];
      return ["date"];
  }
}

function validateOperand(
  node: Record<string, unknown>,
  spec: LeafSpec,
  op: string,
  path: string,
  issues: FilterIssue[],
): void {
  if (NULLARY_OPS.has(op)) return;

  switch (spec.family) {
    case "ref":
    case "flag":
      return;

    case "enum": {
      const values = spec.values ?? [];
      if (typeof node.value !== "string" || !values.includes(node.value)) {
        issues.push({
          path: `${path}.value`,
          message: `expected one of ${values.join(", ")}`,
        });
      }
      return;
    }

    case "text": {
      if (typeof node.value !== "string" || node.value.trim() === "") {
        issues.push({ path: `${path}.value`, message: "expected a non-empty string" });
      }
      return;
    }

    case "numeric": {
      if (op === "between") {
        const min = validateNumber(node.min, `${path}.min`, spec, issues);
        const max = validateNumber(node.max, `${path}.max`, spec, issues);
        if (min !== undefined && max !== undefined && min > max) {
          issues.push({ path: `${path}.min`, message: "min is greater than max" });
        }
      } else {
        validateNumber(node.value, `${path}.value`, spec, issues);
      }
      return;
    }

    case "time": {
      if (op === "older_than" || op === "within") {
        validateDuration(node.duration, `${path}.duration`, issues);
      } else if (op === "between") {
        const from = validateDate(node.from, `${path}.from`, issues);
        const to = validateDate(node.to, `${path}.to`, issues);
        if (from && to && from > to) {
          issues.push({ path: `${path}.from`, message: "from is later than to" });
        }
      } else {
        validateDate(node.date, `${path}.date`, issues);
      }
      return;
    }
  }
}

function validateModifiers(
  node: Record<string, unknown>,
  spec: LeafSpec,
  path: string,
  issues: FilterIssue[],
): void {
  const modifiers = spec.modifiers ?? [];

  for (const modifier of modifiers) {
    const value = node[modifier];
    // Every modifier is optional; omitting one means "inherit", which is a meaningful
    // state and not the same as writing the current default down.
    if (value === undefined) continue;

    switch (modifier) {
      case "raters":
      case "population":
        validateUserList(value, `${path}.${modifier}`, issues);
        break;
      case "coverage":
        validateEnum(value, RATING_COVERAGES, `${path}.coverage`, issues);
        break;
      case "aggregator":
        validateEnum(value, RATING_AGGREGATORS, `${path}.aggregator`, issues);
        break;
      case "scope":
        validateEnum(value, DRAW_SCOPES, `${path}.scope`, issues);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

function validateNumber(
  value: unknown,
  path: string,
  spec: LeafSpec,
  issues: FilterIssue[],
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message: "expected a number" });
    return undefined;
  }

  const constraints = spec.numeric;
  if (!constraints) return value;

  if (constraints.integer && !Number.isInteger(value)) {
    issues.push({ path, message: "expected a whole number" });
    return undefined;
  }
  if (constraints.min !== undefined && value < constraints.min) {
    issues.push({ path, message: `expected at least ${constraints.min}` });
    return undefined;
  }
  if (constraints.max !== undefined && value > constraints.max) {
    issues.push({ path, message: `expected at most ${constraints.max}` });
    return undefined;
  }

  return value;
}

function validateDuration(
  value: unknown,
  path: string,
  issues: FilterIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "expected an object" });
    return;
  }

  rejectUnknownKeys(value, ["amount", "unit"], path, issues);

  if (
    typeof value.amount !== "number" ||
    !Number.isInteger(value.amount) ||
    value.amount < 1
  ) {
    issues.push({ path: `${path}.amount`, message: "expected a whole number above 0" });
  }

  validateEnum(value.unit, DURATION_UNITS, `${path}.unit`, issues);
}

/** Calendar dates, not timestamps: these compare against `watched_on` and friends. */
function validateDate(
  value: unknown,
  path: string,
  issues: FilterIssue[],
): string | undefined {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    issues.push({ path, message: "expected a date as YYYY-MM-DD" });
    return undefined;
  }

  // Catches 2026-02-31, which the pattern alone lets through.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    issues.push({ path, message: "not a real date" });
    return undefined;
  }

  return value;
}

function validateUuid(value: unknown, path: string, issues: FilterIssue[]): void {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    issues.push({ path, message: "expected a uuid" });
  }
}

function validateUserList(
  value: unknown,
  path: string,
  issues: FilterIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "expected an array of user ids" });
    return;
  }
  if (value.length === 0) {
    // Omit the modifier to mean the whole Household; an empty list would mean nobody,
    // which makes the predicate unsatisfiable and is never what anyone chose.
    issues.push({ path, message: "expected at least one user id, or omit the field" });
    return;
  }

  value.forEach((id, i) => validateUuid(id, `${path}[${i}]`, issues));

  if (new Set(value).size !== value.length) {
    issues.push({ path, message: "contains duplicate user ids" });
  }
}

function validateEnum(
  value: unknown,
  allowed: readonly string[],
  path: string,
  issues: FilterIssue[],
): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({ path, message: `expected one of ${allowed.join(", ")}` });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Unknown keys are an error, not something to ignore. They mean either a client bug or
 * a shape from a version this one cannot read, and both should surface loudly rather
 * than evaluate to a Jar whose contents are subtly wrong.
 */
function rejectUnknownKeys(
  node: Record<string, unknown>,
  allowed: string[],
  path: string,
  issues: FilterIssue[],
): void {
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key)) {
      issues.push({
        path: path ? `${path}.${key}` : key,
        message: "unexpected field",
      });
    }
  }
}

function fail(issues: FilterIssue[]): ParseResult<never> {
  return { ok: false, issues };
}
