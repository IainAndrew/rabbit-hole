import assert from "node:assert/strict";
import { mkdtempSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fakeEval, fakeRace, givingUpModel, winningModel } from "../evals/fake-eval.ts";
import { rankEvals } from "../evals/compare.ts";
import { models } from "../models/models.ts";
import type { CallModel } from "../agent/agent.ts";
import { buildBoard, loadSweep, racesOf } from "./leaderboards.ts";

const spec = { id: "models", title: "Models", sweep: "test-sweep" };

/** A sweep folder holding two fake evals: a winner and a model that gives up. */
async function fakeSweep(): Promise<string> {
  const sweep = mkdtempSync(join(tmpdir(), "sweep-"));
  const evals: [string, CallModel, number][] = [
    ["a-loser", givingUpModel(0.001), 0],
    ["b-winner", winningModel(0.001), 1],
  ];
  for (const [folder, callModel, index] of evals) {
    const { dir, run } = fakeEval(callModel, { model: models[index]! });
    await run;
    renameSync(dir, join(sweep, folder));
  }
  return sweep;
}

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
