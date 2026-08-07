/**
 * Errors the data layer throws, so callers can tell them apart without matching on
 * message text.
 *
 * `ConstraintError` lives in `constraints.ts` alongside the checks that raise it, and
 * the filter module owns `FilterCompileError` and `JarFilterError`.
 */

/**
 * A row referenced by id is not in the local replica.
 *
 * Distinguishable from a failure because it usually is not one: the row may simply not
 * have synced yet, and the right response is to wait rather than to report a fault.
 */
export class NotFoundError extends Error {}
