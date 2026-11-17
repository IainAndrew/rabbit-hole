import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { failingModel, fakeEval, winningModel } from "./fake-eval.ts";
import { parseTrace } from "./trace.ts";

test("every race runs every repeat, all races once before any twice", async () => {
  const { dir, run, manifest } = fakeEval(winningModel(0.001));
  const result = await run;
  assert.equal(result.stop, "completed");
  assert.equal(result.runs, 4);
  const runs = manifest().runs.map((r: { raceId: string; repeat: number }) => `${r.raceId}${r.repeat}`);
  assert.deepEqual(runs, ["a1", "b1", "a2", "b2"]);
  assert.equal(manifest().stop, "completed");
  assert.equal(readdirSync(dir).filter((file) => file.endsWith(".jsonl")).length, 4);
});

test("each trace records the commit and ends with the run's result", async () => {
  const { dir, run, manifest } = fakeEval(winningModel(0.001));
  await run;
  const [firstRun] = manifest().runs;
  assert.ok(firstRun);
  const events = parseTrace(readFileSync(join(dir, firstRun.trace), "utf8"));
  const first = events[0];
  const last = events.at(-1);
  assert.ok(first?.type === "run_start");
  assert.equal(first.gitCommit, "abc123");
  assert.ok(last?.type === "run_end");
  assert.deepEqual(last.end, { kind: "finished", reason: "won" });
});

test("no run starts once spending reaches the cap", async () => {
  // Each run makes 2 calls at $0.01, so $0.02 a run.
  const { run, manifest } = fakeEval(winningModel(0.01), { maxCost: 0.03 });
  const result = await run;
  assert.deepEqual(result, { stop: "cost_cap", spent: 0.04, runs: 2 });
  assert.equal(manifest().stop, "cost_cap");
});

test("a run whose cost is unknown stops the eval: the cap can't be kept", async () => {
  const result = await fakeEval(winningModel(null)).run;
  assert.deepEqual(result, { stop: "unknown_cost", spent: 0, runs: 1 });
});

test("running out of credits or a refused key stops the eval at once", async () => {
  assert.equal((await fakeEval(failingModel(402)).run).stop, "no_credits");
  const refused = await fakeEval(failingModel(401)).run;
  assert.deepEqual(refused, { stop: "unauthorized", spent: 0, runs: 1 });
});

test("three crashes in a row stop the eval", async () => {
  const result = await fakeEval(failingModel(503), { repeats: 3 }).run;
  assert.deepEqual(result, { stop: "repeated_crashes", spent: 0, runs: 3 });
});
