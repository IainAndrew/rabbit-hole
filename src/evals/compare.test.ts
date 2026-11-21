import assert from "node:assert/strict";
import { test } from "node:test";
import { checkComparable, evalLabel, rankEvals } from "./compare.ts";
import { fakeEval, fakeRace, givingUpModel, pathModel, winningModel } from "./fake-eval.ts";
import { loadEval } from "./report.ts";
import type { CallModel } from "../agent/agent.ts";
import { SCORING_RULE } from "../agent/prompt.ts";
import type { EvalOptions } from "./run-eval.ts";
import { models } from "../models/models.ts";
import type { Message } from "../models/openrouter.ts";

const modelA = models[0]!;
const modelB = models[1]!;
const modelC = models[2]!;

/** Run a fake eval (two races, two repeats) and load it back. */
async function evalOf(callModel: CallModel, options: Partial<EvalOptions> = {}) {
  const { dir, run } = fakeEval(callModel, options);
  await run;
  return loadEval(dir);
}

// Wins in 4 hops, by going back to Guinness and round again.
const wandering = pathModel(["Republic of Ireland", "Guinness", "Republic of Ireland", "Einstein"], 0.001);

test("success rate decides the ranking", async () => {
  const loser = await evalOf(givingUpModel(0.001), { model: modelA });
  const winner = await evalOf(winningModel(0.001), { model: modelB });
  const ranked = rankEvals([loser, winner]);
  assert.deepEqual(ranked.map((r) => [r.rank, r.eval.manifest.model.id]), [[1, modelB.id], [2, modelA.id]]);
});

test("each eval gets an interval, and a paired interval for its gap to the next", async () => {
  const [winner, loser] = rankEvals([
    await evalOf(winningModel(0.001), { model: modelA }),
    await evalOf(givingUpModel(0.001), { model: modelB }),
  ]);
  assert.deepEqual(winner!.interval, { low: 1, high: 1 });
  assert.deepEqual(winner!.vsNext, { low: 1, high: 1 });
  assert.deepEqual(loser!.interval, { low: 0, high: 0 });
  assert.equal(loser!.vsNext, null);
});

test("fewer hops on wins breaks a tie in success rate", async () => {
  const wanderer = await evalOf(wandering, { model: modelA });
  const direct = await evalOf(winningModel(0.001), { model: modelB });
  const ranked = rankEvals([wanderer, direct]);
  assert.deepEqual(ranked.map((r) => [r.eval.manifest.model.id, r.score.meanHopsOnWins]), [[modelB.id, 2], [modelA.id, 4]]);
});

test("evals level on success rate and hops share a rank", async () => {
  const first = await evalOf(winningModel(0.001), { model: modelA });
  const second = await evalOf(winningModel(0.002), { model: modelB });
  const third = await evalOf(givingUpModel(0.001), { model: modelC });
  assert.deepEqual(rankEvals([first, second, third]).map((r) => r.rank), [1, 1, 3]);
});

test("cost per win is everything spent over the wins, and end reasons are counted", async () => {
  const [winner, loser] = rankEvals([
    await evalOf(winningModel(0.001), { model: modelA }),
    await evalOf(givingUpModel(0.001), { model: modelB }),
  ]);
  // 4 runs of 2 calls at $0.001, over 4 wins.
  assert.ok(Math.abs(winner!.costPerWin! - 0.002) < 1e-12);
  assert.equal(winner!.endReasons.won, 4);
  assert.equal(loser!.costPerWin, null);
  assert.equal(loser!.endReasons.gave_up, 4);
});

test("evals made with different commits, limits, races or repeats are refused", async () => {
  const base = await evalOf(winningModel(0.001), { model: modelA });
  const otherCommit = await evalOf(winningModel(0.001), { model: modelB, git: { gitCommit: "def456", gitDirty: false } });
  const otherLimits = await evalOf(winningModel(0.001), {
    model: modelB,
    limits: { maxTurns: 6, maxContextChars: 330_000, maxOutputTokens: 100 },
  });
  const otherRaces = await evalOf(winningModel(0.001), { model: modelB, races: [fakeRace("a"), fakeRace("c")] });
  const otherRepeats = await evalOf(winningModel(0.001), { model: modelB, repeats: 1 });
  assert.throws(() => checkComparable([base, otherCommit]), /with commit def456, .* with abc123: they can't be compared/);
  assert.throws(() => checkComparable([base, otherLimits]), /with limits .*"maxTurns":6/);
  assert.throws(() => checkComparable([base, otherRaces]), /with races a, c, .* with a, b/);
  assert.throws(() => checkComparable([base, otherRepeats]), /with repeats 1, .* with 2/);
});

test("one model under two context strategies is two evals, ranked side by side", async () => {
  const masked = { name: "masked", view: (history: readonly Message[]) => [...history] };
  const full = await evalOf(wandering, { model: modelA });
  const other = await evalOf(winningModel(0.001), { model: modelA, context: masked });
  const ranked = rankEvals([full, other]);
  assert.deepEqual(ranked.map((r) => evalLabel(r.eval)), [`${modelA.name} / masked / fewest-hops`, `${modelA.name} / full / fewest-hops`]);
});

test("one model under two prompt variants is two evals, comparable at one commit", async () => {
  const fewestHops = await evalOf(wandering, { model: modelA });
  const scoringRule = await evalOf(winningModel(0.001), { model: modelA, prompt: SCORING_RULE });
  const ranked = rankEvals([fewestHops, scoringRule]);
  assert.deepEqual(ranked.map((r) => evalLabel(r.eval)), [`${modelA.name} / full / scoring-rule`, `${modelA.name} / full / fewest-hops`]);
});
