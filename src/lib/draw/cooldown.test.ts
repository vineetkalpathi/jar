import {
  cooldownWeight,
  decay,
  DRAW_COOLDOWN,
  weightedSample,
  WATCH_COOLDOWN,
  type Weighted,
} from "./cooldown";

const NOW = new Date("2026-08-01T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("cooldown weight", () => {
  it("leaves an untouched Title at full weight", () => {
    expect(cooldownWeight({ now: NOW })).toBe(1);
  });

  it("never reaches zero, however recent", () => {
    // The rule that stops a small Jar deadlocking: unlikely, never unavailable.
    const justNow = cooldownWeight({
      now: NOW,
      lastDrawnAt: NOW,
      lastWatchedAt: NOW,
    });
    expect(justNow).toBeGreaterThan(0);
    expect(justNow).toBeLessThan(0.05);
  });

  it("recovers monotonically", () => {
    const weights = [0, 7, 30, 90, 365].map((d) =>
      cooldownWeight({ now: NOW, lastDrawnAt: daysAgo(d) }),
    );
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    }
    expect(weights.at(-1)).toBeCloseTo(1, 2);
  });

  it("halves the penalty over the configured half-life", () => {
    // At one half-life the removed share is half of `strength`.
    expect(decay(DRAW_COOLDOWN, DRAW_COOLDOWN.halfLifeDays)).toBeCloseTo(
      1 - DRAW_COOLDOWN.strength / 2,
      10,
    );
  });

  it("suppresses a recent draw harder than a recent watch, but for less time", () => {
    const drawnNow = cooldownWeight({ now: NOW, lastDrawnAt: NOW });
    const watchedNow = cooldownWeight({ now: NOW, lastWatchedAt: NOW });
    expect(drawnNow).toBeLessThan(watchedNow);

    const drawnLongAgo = cooldownWeight({ now: NOW, lastDrawnAt: daysAgo(120) });
    const watchedLongAgo = cooldownWeight({ now: NOW, lastWatchedAt: daysAgo(120) });
    expect(drawnLongAgo).toBeGreaterThan(watchedLongAgo);
  });

  it("compounds the two sources", () => {
    const both = cooldownWeight({
      now: NOW,
      lastDrawnAt: daysAgo(14),
      lastWatchedAt: daysAgo(14),
    });
    const drawnOnly = cooldownWeight({ now: NOW, lastDrawnAt: daysAgo(14) });
    expect(both).toBeLessThan(drawnOnly);
  });

  it("treats a future timestamp as just now rather than amplifying it", () => {
    // Clocks disagree between devices, and a negative elapsed time would otherwise
    // push the penalty past `strength`.
    const future = cooldownWeight({ now: NOW, lastDrawnAt: daysAgo(-30) });
    expect(future).toBeCloseTo(1 - DRAW_COOLDOWN.strength, 10);
  });

  it("keeps both strengths below 1, which is what guarantees a non-zero weight", () => {
    expect(DRAW_COOLDOWN.strength).toBeLessThan(1);
    expect(WATCH_COOLDOWN.strength).toBeLessThan(1);
  });
});

describe("weighted sample", () => {
  const pool = (weights: number[]): Weighted<number>[] =>
    weights.map((weight, i) => ({ item: i, weight }));

  /** Cycles fixed values, so a draw is reproducible. */
  const sequence = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  it("returns distinct items", () => {
    const picked = weightedSample(pool([1, 1, 1, 1, 1]), 3, sequence([0.1, 0.5, 0.9]));
    expect(new Set(picked).size).toBe(3);
  });

  it("serves everything when the pool is smaller than asked for", () => {
    // A Jar with two Titles is still drawable; it just serves two.
    const picked = weightedSample(pool([1, 1]), 5, sequence([0.5]));
    expect(picked.sort()).toEqual([0, 1]);
  });

  it("returns nothing from an empty pool", () => {
    expect(weightedSample<number>([], 3)).toEqual([]);
  });

  it("picks in proportion to weight", () => {
    // Item 1 carries nine tenths of the weight, so it should dominate.
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    let firstIsHeavy = 0;
    for (let i = 0; i < 2000; i++) {
      const [first] = weightedSample(pool([1, 9]), 1, rng);
      if (first === 1) firstIsHeavy++;
    }
    expect(firstIsHeavy / 2000).toBeGreaterThan(0.85);
    expect(firstIsHeavy / 2000).toBeLessThan(0.95);
  });

  it("still terminates when random() returns its extremes", () => {
    expect(weightedSample(pool([1, 2, 3]), 3, () => 0)).toHaveLength(3);
    expect(weightedSample(pool([1, 2, 3]), 3, () => 1)).toHaveLength(3);
  });
});
