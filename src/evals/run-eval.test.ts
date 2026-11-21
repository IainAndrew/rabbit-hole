import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { failingModel, fakeEval, fakeRace, winningModel } from "./fake-eval.ts";
import { loadEval } from "./report.ts";
import { runsToDo } from "./run-eval.ts";
import { scoreRuns } from "./score.ts";
import { parseTrace } from "../agent/trace.ts";
import type { Message } from "../models/openrouter.ts";

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

// The fake eval's races: two races, two repeats.
const races = [fakeRace("a"), fakeRace("b")];
const slot = ({ race, repeat }: { race: { id: string }; repeat: number }) => `${race.id}${repeat}`;

test("a fresh eval has every race and repeat to do; a decided one is never redone", async () => {
  assert.deepEqual(runsToDo(races, 2, []).map(slot), ["a1", "b1", "a2", "b2"]);
  const { dir, run } = fakeEval(winningModel(0.001));
  await run;
  assert.deepEqual(runsToDo(races, 2, loadEval(dir).runs), []);
});

test("resuming re-runs the crashed runs and starts the ones never started", async () => {
  // Three crashes in a row stop the first attempt after 3 of 4 runs.
  const first = fakeEval(failingModel(503));
  assert.equal((await first.run).stop, "repeated_crashes");

  const resumed = await fakeEval(winningModel(0.001), { dir: first.dir, previous: loadEval(first.dir) }).run;
  assert.deepEqual(resumed, { stop: "completed", spent: 0.008, runs: 4 });

  const { manifest, runs } = loadEval(first.dir);
  assert.equal(manifest.runs.length, 7, "the crashed traces are kept");
  assert.equal(manifest.maxCost, 2, "each call adds its cap");
  const score = scoreRuns(runs);
  assert.deepEqual([score.won, score.decided, score.crashed], [4, 4, 3]);
});

test("a run that crashes 3 times isn't tried again", async () => {
  const { dir, run } = fakeEval(failingModel(503));
  await run;
  // Two more failing resumes: a1, b1 and a2 have now crashed 3 times each.
  for (let i = 0; i < 2; i++) {
    await fakeEval(failingModel(503), { dir, previous: loadEval(dir) }).run;
  }
  assert.deepEqual(runsToDo(races, 2, loadEval(dir).runs).map(slot), ["b2"]);
});

test("an eval can't be resumed at another commit", async () => {
  const { dir, run } = fakeEval(failingModel(503));
  await run;
  const resume = fakeEval(winningModel(0.001), { dir, previous: loadEval(dir), git: { gitCommit: "def456", gitDirty: false } });
  await assert.rejects(resume.run, /made at commit abc123, this is def456/);
});

test("an eval can't be resumed with another context strategy", async () => {
  const { dir, run } = fakeEval(failingModel(503));
  await run;
  const masked = { name: "masked", view: (history: readonly Message[]) => [...history] };
  const resume = fakeEval(winningModel(0.001), { dir, previous: loadEval(dir), context: masked });
  await assert.rejects(resume.run, /used the "full" context strategy, not "masked"/);
});
