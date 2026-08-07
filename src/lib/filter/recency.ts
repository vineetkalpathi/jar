/**
 * The "when did this last happen" subqueries, shared by the filter compiler and by
 * Cooldown.
 *
 * Both need the same three answers — when was this Title last drawn from this Jar, last
 * drawn anywhere in the Household, last watched by these people — and had their own copy
 * of each. The scoping decisions in them are ADR-0006's, not incidental, so two copies
 * meant two places for those decisions to drift apart.
 *
 * Every fragment correlates against `t.id` from the enclosing query, so a caller has to
 * expose the Title as `t`. Placeholders are passed in rather than bound here, because
 * the compiler binds positionally in textual order and only it knows where these land.
 */

/** The most recent Draw of `t` from one Jar. `jarParam` binds the jar id. */
export function lastDrawnInJar(jarParam: string): string {
  return (
    `(select max(d.drawn_at) from draw_candidate dc\n` +
    `  join draw d on d.id = dc.draw_id\n` +
    `  where dc.title_id = t.id and d.jar_id = ${jarParam})`
  );
}

/** The most recent Draw of `t` from any Jar in one Household. */
export function lastDrawnInHousehold(householdParam: string): string {
  return (
    `(select max(d.drawn_at) from draw_candidate dc\n` +
    `  join draw d on d.id = dc.draw_id\n` +
    `  join jar j on j.id = d.jar_id\n` +
    `  where dc.title_id = t.id\n` +
    `    and j.household_id = ${householdParam})`
  );
}

/**
 * The most recent Viewing of `t` by a population, aggregated with MAX.
 *
 * MAX rather than MIN because "we haven't seen it in two years" means the most recent
 * Viewing by anyone, not the oldest (ADR-0006). Over an empty set it is NULL, so a
 * Title nobody has watched fails every comparison — which is what ADR-0009 specifies,
 * "never watched" being `watched not_by_any` instead.
 */
export function lastWatchedBy(userParams: string): string {
  return (
    `(select max(v.watched_on) from viewing v\n` +
    `  where v.title_id = t.id and v.user_id in (${userParams}))`
  );
}
