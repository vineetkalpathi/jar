/**
 * Cooldown: the reduced likelihood of a Title being served shortly after it was drawn
 * or watched, decaying back to normal over time.
 *
 * The shape is settled (data-model.md); the numbers are not. They are constants here
 * rather than configuration because tuning them changes no stored data — Cooldown is
 * computed from Draws and Viewings every time, and nothing about it is persisted.
 *
 * The rule that is not negotiable: **a weight is never zero**. Cooldown makes a Title
 * unlikely, never unavailable, so that a small Jar cannot run out of eligible
 * Candidates and deadlock. Every `strength` below is therefore strictly less than 1.
 */

export type CooldownConfig = {
  /** Days for the penalty to halve. */
  halfLifeDays: number;
  /** Share of the weight removed at the moment it happened. Must stay below 1. */
  strength: number;
};

/**
 * Being drawn recently suppresses hard but recovers quickly — it means "we just
 * considered this", not "we are done with it".
 */
export const DRAW_COOLDOWN: CooldownConfig = { halfLifeDays: 30, strength: 0.9 };

/**
 * Having watched it suppresses less hard but for far longer. A rewatch is a real thing
 * people want; a rewatch next Friday usually is not.
 */
export const WATCH_COOLDOWN: CooldownConfig = { halfLifeDays: 180, strength: 0.85 };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The multiplier for one cooldown source. 1 means untouched; it approaches 1 as the
 * event recedes and is at its lowest — `1 - strength` — the moment it happened.
 */
export function decay(config: CooldownConfig, daysSince: number): number {
  if (!Number.isFinite(daysSince)) return 1;
  // A future timestamp (clock skew between devices) is treated as "just now" rather
  // than amplified into a penalty above `strength`.
  const elapsed = Math.max(0, daysSince);
  return 1 - config.strength * Math.pow(2, -elapsed / config.halfLifeDays);
}

/**
 * How likely a Title should be to appear, relative to one nobody has drawn or watched.
 *
 * The two sources multiply: something drawn last week *and* watched last month is
 * suppressed by both. Multiplying rather than adding is what keeps the result bounded
 * in (0, 1] without a clamp.
 */
export function cooldownWeight(input: {
  now: Date;
  lastDrawnAt?: Date | null;
  lastWatchedAt?: Date | null;
}): number {
  let weight = 1;

  if (input.lastDrawnAt) {
    weight *= decay(DRAW_COOLDOWN, daysBetween(input.lastDrawnAt, input.now));
  }
  if (input.lastWatchedAt) {
    weight *= decay(WATCH_COOLDOWN, daysBetween(input.lastWatchedAt, input.now));
  }

  return weight;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

export type Weighted<T> = { item: T; weight: number };

/**
 * Draws `count` distinct items, each chosen with probability proportional to its
 * weight.
 *
 * Without replacement, because a Draw serves distinct Candidates. If fewer items exist
 * than are asked for, every item is returned — a Jar with two Titles can still be drawn
 * from, it just serves two.
 *
 * `random` is injected so a Draw is reproducible under test. Nothing else should pass
 * it.
 */
export function weightedSample<T>(
  pool: Weighted<T>[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const remaining = pool.filter((entry) => entry.weight > 0);
  const wanted = Math.min(count, remaining.length);
  const picked: T[] = [];

  for (let i = 0; i < wanted; i++) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0);
    let threshold = random() * total;

    // Walk the cumulative distribution. The last entry is the fallback for the case
    // where floating-point drift leaves `threshold` a hair above the running sum.
    let index = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      threshold -= remaining[j].weight;
      if (threshold <= 0) {
        index = j;
        break;
      }
    }

    picked.push(remaining[index].item);
    remaining.splice(index, 1);
  }

  return picked;
}
