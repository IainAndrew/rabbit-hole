import assert from "node:assert/strict";
import { test } from "node:test";
import { differenceInterval, outcomesByRace, rateInterval, withinNoise, type RaceOutcomes } from "./intervals.ts";
import { failingModel, fakeEval, winningModel } from "./fake-eval.ts";
import { loadEval } from "./report.ts";

/** Races named r0, r1, ... each with the given runs (true for a win). */
function races(...runs: boolean[][]): RaceOutcomes {
  return new Map(runs.map((outcomes, i) => [`r${i}`, outcomes]));
}
const repeat = <T>(count: number, item: T): T[] => Array.from({ length: count }, () => item);
const width = (outcomes: RaceOutcomes) => {
  const interval = rateInterval(outcomes)!;
  return interval.high - interval.low;
};

test("a model that wins every run has no spread", () => {
  assert.deepEqual(rateInterval(races(...repeat(21, [true, true, true]))), { low: 1, high: 1 });
});

test("the interval holds the observed rate, and is the same every time", () => {
  const outcomes = races(...repeat(14, [true, true, true]), ...repeat(7, [true, false, false]));
  const interval = rateInterval(outcomes)!;
  const observed = (14 * 3 + 7) / 63;
  assert.ok(interval.low < observed && observed < interval.high);
  assert.deepEqual(rateInterval(outcomes), interval);
});

test("more races give a narrower interval", () => {
  const few = races(...repeat(5, [true, true, true]), ...repeat(5, [false, false, false]));
  const many = races(...repeat(40, [true, true, true]), ...repeat(40, [false, false, false]));
  assert.ok(width(many) < width(few) / 2);
});

test("wins clustered by race are noisier than wins spread across races", () => {
  // Both 50%: one model wins whole races, the other half of every race.
  const clustered = races(...repeat(10, [true, true, true, true]), ...repeat(10, [false, false, false, false]));
  const spread = races(...repeat(20, [true, true, false, false]));
  assert.ok(width(clustered) > width(spread));
});

test("the same results twice are within noise of each other", () => {
  const outcomes = races(...repeat(14, [true, true, true]), ...repeat(7, [true, false, false]));
  assert.equal(withinNoise(differenceInterval(outcomes, outcomes)!), true);
});

test("one race's difference out of 21 is within noise; winning everything against nothing isn't", () => {
  const base = repeat(20, [true, true, false]);
  const a = races(...base, [true, true, true]);
  const b = races(...base, [false, false, false]);
  assert.equal(withinNoise(differenceInterval(a, b)!), true);

  const all = races(...repeat(21, [true, true, true]));
  const none = races(...repeat(21, [false, false, false]));
  assert.deepEqual(differenceInterval(all, none), { low: 1, high: 1 });
});

test("only decided runs count: an eval of crashes has no interval", async () => {
  const crashed = fakeEval(failingModel(500));
  await crashed.run;
  assert.equal(rateInterval(outcomesByRace(loadEval(crashed.dir).runs)), null);

  const won = fakeEval(winningModel(0.001));
  await won.run;
  assert.deepEqual([...outcomesByRace(loadEval(won.dir).runs).entries()], [["a", [true, true]], ["b", [true, true]]]);
});
