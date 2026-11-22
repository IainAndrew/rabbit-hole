import assert from "node:assert/strict";
import { mkdtempSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fakeEval, fakeRace, givingUpModel, winningModel } from "../evals/fake-eval.ts";
import { rankEvals } from "../evals/compare.ts";
import { models } from "../models/models.ts";
import type { CallModel } from "../agent/agent.ts";
import type { EvalOptions } from "../evals/run-eval.ts";
import type { Message } from "../models/openrouter.ts";
import { buildBoard, loadSweep, racesOf } from "./leaderboards.ts";

const spec = { id: "models", title: "Models", sweep: "test-sweep" };

/** A sweep folder of fake evals, each in the named folder. By default a model that gives up and a winner. */
async function fakeSweep(
  evals: [string, CallModel, Partial<EvalOptions>][] = [
    ["a-loser", givingUpModel(0.001), { model: models[0]! }],
    ["b-winner", winningModel(0.001), { model: models[1]! }],
  ],
): Promise<string> {
  const sweep = mkdtempSync(join(tmpdir(), "sweep-"));
  for (const [folder, callModel, options] of evals) {
    const { dir, run } = fakeEval(callModel, options);
    await run;
    renameSync(dir, join(sweep, folder));
  }
  return sweep;
}

const masked = { name: "masked", view: (history: readonly Message[]) => [...history] };

test("a board ranks a sweep's evals the same way compare-evals does", async () => {
  const sweep = loadSweep(await fakeSweep());
  const board = buildBoard(spec, sweep);
  const ranked = rankEvals(sweep.map(({ loaded }) => loaded));
  assert.deepEqual(
    board.entries.map((entry) => [entry.rank, entry.model.id, entry.score]),
    ranked.map((entry) => [entry.rank, entry.eval.manifest.model.id, entry.score]),
  );
});

test("each entry names the folder its eval was loaded from", async () => {
  const board = buildBoard(spec, loadSweep(await fakeSweep()));
  assert.deepEqual(board.entries.map((entry) => entry.eval), ["b-winner", "a-loser"]);
});

test("races come from races.json, with their measured distance", async () => {
  const board = buildBoard(spec, loadSweep(await fakeSweep()));
  const races = racesOf([board], [fakeRace("a"), fakeRace("b"), fakeRace("unused")]);
  assert.deepEqual(
    races.map((race) => [race.id, race.distance]),
    [["a", 2], ["b", 2]],
  );
});

test("a race that races.json no longer has stops the build", async () => {
  const board = buildBoard(spec, loadSweep(await fakeSweep()));
  assert.throws(() => racesOf([board], [fakeRace("a")]), /ran race b/);
});

const strategies = {
  id: "strategies",
  title: "Context strategies",
  sweep: "test-sweep",
  baseline: { varies: "context" as const, value: "full" },
};

test("each strategy is measured against the same model's baseline, and the baseline against nothing", async () => {
  const sweep = await fakeSweep([
    ["a-full", givingUpModel(0.001), { model: models[0]! }],
    ["a-masked", winningModel(0.001), { model: models[0]!, context: masked }],
    ["b-full", winningModel(0.001), { model: models[1]! }],
    ["b-masked", givingUpModel(0.001), { model: models[1]!, context: masked }],
  ]);
  const board = buildBoard(strategies, loadSweep(sweep));
  const gaps = Object.fromEntries(board.entries.map((entry) => [entry.eval, entry.vsBaseline?.gap ?? null]));
  assert.deepEqual(gaps, { "a-full": null, "a-masked": 1, "b-full": null, "b-masked": -1 });
});

test("a strategy whose model has no baseline in the sweep stops the build", async () => {
  const sweep = await fakeSweep([
    ["a-full", givingUpModel(0.001), { model: models[0]! }],
    ["b-masked", winningModel(0.001), { model: models[1]!, context: masked }],
  ]);
  assert.throws(() => buildBoard(strategies, loadSweep(sweep)), /has no baseline/);
});
