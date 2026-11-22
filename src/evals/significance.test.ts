import assert from "node:assert/strict";
import { test } from "node:test";
import type { RaceOutcomes } from "./intervals.ts";
import { permutationP } from "./significance.ts";

/** Outcomes for `races` races of three runs each, won as `pattern` says. */
function outcomes(races: number, pattern: (race: number) => boolean[]): RaceOutcomes {
  return new Map(Array.from({ length: races }, (_, race) => [`race-${race}`, pattern(race)]));
}

test("identical evals give p = 1: every shuffle's gap is at least the observed 0", () => {
  const same = outcomes(10, () => [true, false, true]);
  assert.equal(permutationP(same, same), 1);
});

test("a gap on every race is very unlikely by chance", () => {
  const winner = outcomes(25, () => [true, true, true]);
  const loser = outcomes(25, () => [false, false, false]);
  assert.ok(permutationP(winner, loser)! < 0.001);
});

test("one race's difference over 25 is well within chance", () => {
  const a = outcomes(25, () => [true, true, true]);
  const b = outcomes(25, (race) => (race === 0 ? [false, true, true] : [true, true, true]));
  assert.ok(permutationP(a, b)! > 0.5);
});

test("the test is two-sided: swapping the evals gives the same p, up to shuffle noise", () => {
  // Swapped, the shuffles draw in another order, so the estimates differ a little.
  const a = outcomes(25, (race) => [true, race % 2 === 0, true]);
  const b = outcomes(25, (race) => [true, race % 3 === 0, true]);
  const forward = permutationP(a, b)!;
  const backward = permutationP(b, a)!;
  assert.ok(forward > 0.05 && forward < 0.95, `p = ${forward}: pick a less lopsided case`);
  assert.ok(Math.abs(forward - backward) < 0.02);
});

test("evals with no race in common have no p", () => {
  const a = new Map([["x", [true]]]);
  const b = new Map([["y", [false]]]);
  assert.equal(permutationP(a, b), null);
});
