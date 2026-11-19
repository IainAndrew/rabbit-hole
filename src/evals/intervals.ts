// How much a success rate could move by chance, by bootstrap: replay the eval
// many times from its own runs and see how far the rate spreads.
//
// Runs aren't independent: repeats of one race tend to go the same way, so
// 21 races x 3 repeats is worth fewer than 63 independent runs. Each draw
// resamples in two stages, races and then runs within each race, so both race
// and repeat variance show in the interval.

import type { LoadedRun } from "./report.ts";
import { outcomeOf } from "./score.ts";

/** A 95% interval, as rates from 0 to 1 (or a difference of rates). */
export type Interval = { low: number; high: number };

/** Each race's decided runs, true for a win: what a draw resamples. */
export type RaceOutcomes = Map<string, boolean[]>;

// The share of draws an interval covers. 95% is the scientific convention,
// so readers know it without explanation: a range wrong about 1 time in 20.
// Higher gives wider ranges and more "noise"; lower lets more flukes look real.
const CONFIDENCE = 0.95;
const DRAWS = 10_000;
// Fixed, so a report gives the same interval every time it's run.
const SEED = 20261119;

/** Group an eval's decided runs by race. Crashed and killed runs don't count. */
export function outcomesByRace(runs: LoadedRun[]): RaceOutcomes {
  const byRace: RaceOutcomes = new Map();
  for (const run of runs) {
    const outcome = outcomeOf(run);
    if (outcome === "won" || outcome === "lost") {
      const list = byRace.get(run.raceId) ?? [];
      list.push(outcome === "won");
      byRace.set(run.raceId, list);
    }
  }
  return byRace;
}

/** The 95% interval of one eval's success rate. Null with nothing decided. */
export function rateInterval(outcomes: RaceOutcomes): Interval | null {
  const races = [...outcomes.values()];
  if (races.length === 0) {
    return null;
  }
  const random = seededRandom(SEED);
  const draws: number[] = [];
  for (let i = 0; i < DRAWS; i++) {
    const picks = pickRaces(races.length, random);
    draws.push(drawRate(picks.map((index) => races[index]!), random));
  }
  return percentiles(draws);
}

/**
 * The 95% interval of the difference in success rate, a minus b, paired by
 * race: each draw picks the same races for both, so a hard race weighs on
 * both sides alike. If it includes 0, the gap could be chance.
 */
export function differenceInterval(a: RaceOutcomes, b: RaceOutcomes): Interval | null {
  const ids = [...a.keys()].filter((id) => b.has(id));
  if (ids.length === 0) {
    return null;
  }
  const random = seededRandom(SEED);
  const draws: number[] = [];
  for (let i = 0; i < DRAWS; i++) {
    const picks = pickRaces(ids.length, random).map((index) => ids[index]!);
    draws.push(drawRate(picks.map((id) => a.get(id)!), random) - drawRate(picks.map((id) => b.get(id)!), random));
  }
  return percentiles(draws);
}

/** True if a difference's interval includes 0: the gap could be chance. */
export function withinNoise(difference: Interval): boolean {
  return difference.low <= 0 && difference.high >= 0;
}

/** Indices of `count` races, picked with replacement. */
function pickRaces(count: number, random: () => number): number[] {
  return Array.from({ length: count }, () => Math.floor(random() * count));
}

/** One draw's success rate: each picked race's runs, resampled with replacement. */
function drawRate(races: boolean[][], random: () => number): number {
  let won = 0;
  let decided = 0;
  for (const runs of races) {
    for (let i = 0; i < runs.length; i++) {
      won += runs[Math.floor(random() * runs.length)]! ? 1 : 0;
      decided++;
    }
  }
  return decided === 0 ? 0 : won / decided;
}

/** The middle CONFIDENCE share of the draws: an equal tail cut from each end. */
function percentiles(draws: number[]): Interval {
  const sorted = [...draws].sort((x, y) => x - y);
  const tail = (1 - CONFIDENCE) / 2;
  return {
    low: sorted[Math.floor(sorted.length * tail)]!,
    high: sorted[Math.ceil(sorted.length * (1 - tail)) - 1]!,
  };
}

/**
 * A small seeded random number generator (mulberry32), so intervals are
 * reproducible. Math.random can't be seeded.
 *
 * @returns Numbers from 0 (inclusive) to 1 (exclusive).
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
