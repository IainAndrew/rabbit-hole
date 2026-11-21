import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fakeEval, failingModel, pathModel, winningModel } from "./fake-eval.ts";
import { loadEval } from "./report.ts";

// Rewrite one file of an eval, to simulate a tampered or damaged eval.
function edit(dir: string, file: string, change: (text: string) => string): void {
  const path = join(dir, file);
  writeFileSync(path, change(readFileSync(path, "utf8")));
}

test("an eval loads every run in order, with how each began and ended", async () => {
  const { dir, run } = fakeEval(winningModel(0.001));
  await run;
  const { manifest, runs } = loadEval(dir);
  assert.equal(manifest.stop, "completed");
  assert.deepEqual(runs.map((r) => `${r.raceId}${r.repeat}`), ["a1", "b1", "a2", "b2"]);
  assert.equal(runs[0]?.start.gitCommit, "abc123");
  assert.deepEqual(runs[0]?.end?.end, { kind: "finished", reason: "won" });
});

test("crashed runs load too, with their crash recorded", async () => {
  const { dir, run } = fakeEval(failingModel(402));
  await run;
  const { runs } = loadEval(dir);
  assert.deepEqual(runs[0]?.end?.end, { kind: "crashed", cause: "no_credits", error: "boom" });
});

test("a run killed before it finished has no end", async () => {
  const { dir, run, manifest } = fakeEval(winningModel(0.001));
  await run;
  const trace = manifest().runs[1]!.trace;
  edit(dir, trace, (text) => text.split("\n").filter((line) => !line.includes('"run_end"')).join("\n"));
  assert.equal(loadEval(dir).runs[1]?.end, null);
});

test("a trace made with another commit is refused", async () => {
  const { dir, run, manifest } = fakeEval(winningModel(0.001));
  await run;
  edit(dir, manifest().runs[2]!.trace, (text) => text.replace('"abc123"', '"def456"'));
  assert.throws(() => loadEval(dir), /made with commit def456, the eval with abc123/);
});

test("runs made with uncommitted code are refused", async () => {
  const { dir, run } = fakeEval(winningModel(0.001), { git: { gitCommit: "abc123", gitDirty: true } });
  await run;
  assert.throws(() => loadEval(dir), /uncommitted code/);
});

test("a malformed eval.json is refused", async () => {
  const { dir, run } = fakeEval(winningModel(0.001));
  await run;
  edit(dir, "eval.json", (text) => text.replace('"plannedRuns"', '"planned"'));
  assert.throws(() => loadEval(dir), /Malformed eval.json: no plan/);
});

test("an eval.json from before context strategies is read as the full history", async () => {
  const { dir, run } = fakeEval(winningModel(0.001));
  await run;
  edit(dir, "eval.json", (text) => text.replace('"contextStrategy": "full",', ""));
  assert.equal(loadEval(dir).manifest.contextStrategy, "full");
});

test("a trace made with another context strategy is refused", async () => {
  const { dir, run, manifest } = fakeEval(winningModel(0.001));
  await run;
  edit(dir, manifest().runs[1]!.trace, (text) => text.replace('"contextStrategy":"full"', '"contextStrategy":"masked"'));
  assert.throws(() => loadEval(dir), /made with context strategy masked, the eval with full/);
});

test("each run's moves are counted from its trace: attempts, refusals and the first that worked", async () => {
  // From Guinness, "Einstein" isn't a link: refused at turn 1, then two moves win.
  const { dir, run } = fakeEval(pathModel(["Einstein", "Republic of Ireland", "Einstein"], 0.001));
  await run;
  assert.deepEqual(loadEval(dir).runs[0]?.moves, { attempts: 3, refused: 1, firstTurn: 2 });
});
