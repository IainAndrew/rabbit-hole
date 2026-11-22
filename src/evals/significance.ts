// Is a gap between two evals bigger than chance would make it, on these
// races? A paired permutation test: if the two evals were really the same,
// which of a race's runs came from which eval wouldn't matter, so shuffle
// them within each race and see how often a gap this big turns up anyway.
//
// It answers a narrower question than the bootstrap in intervals.ts. The
// bootstrap also resamples the races ("would the gap hold on new races like
// these?"); this holds the races fixed ("on these races, is A better?"). So
// a gap can be clear here and still be "noise" in the bootstrap's range.

import { seededRandom, type RaceOutcomes } from "./intervals.ts";

const SHUFFLES = 20_000;
// Fixed, so a report gives the same p every time it's run.
const SEED = 20261122;

/**
 * The two-sided p-value of the gap in success rate, a minus b, over the
 * races both have: the share of shuffles whose gap is at least as large,
 * either way. Small means the gap is unlikely if the evals were the same.
 * Never 0: the observed split counts as one of the shuffles.
 *
 * @returns Null if the evals share no decided runs.
 */
export function permutationP(a: RaceOutcomes, b: RaceOutcomes): number | null {
  const races = [...a.keys()].filter((id) => b.has(id)).map((id) => ({ a: a.get(id)!, b: b.get(id)! }));
  const decidedA = races.reduce((sum, race) => sum + race.a.length, 0);
  const decidedB = races.reduce((sum, race) => sum + race.b.length, 0);
  if (decidedA === 0 || decidedB === 0) {
    return null;
  }
  const totalWins = races.reduce((sum, race) => sum + wins(race.a) + wins(race.b), 0);
  // The wins in a fixes the gap: b has the rest of the pool.
  const gap = (winsA: number) => winsA / decidedA - (totalWins - winsA) / decidedB;
  const observed = Math.abs(gap(races.reduce((sum, race) => sum + wins(race.a), 0)));

  const random = seededRandom(SEED);
  let asLarge = 0;
  for (let i = 0; i < SHUFFLES; i++) {
    let winsA = 0;
    for (const race of races) {
      winsA += wins(dealt([...race.a, ...race.b], race.a.length, random));
    }
    // A small tolerance, so float rounding can't hide a gap that ties.
    if (Math.abs(gap(winsA)) >= observed - 1e-9) {
      asLarge++;
    }
  }
  return (asLarge + 1) / (SHUFFLES + 1);
}

/** The runs won. */
function wins(runs: boolean[]): number {
  return runs.filter(Boolean).length;
}

/** `count` runs dealt at random from a race's pooled runs (a partial Fisher–Yates shuffle). */
function dealt(pool: boolean[], count: number, random: () => number): boolean[] {
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}
