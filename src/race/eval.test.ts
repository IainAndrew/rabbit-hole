import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CallModel } from "./agent.ts";
import { runEval, type EvalOptions } from "./eval.ts";
import type { RaceSpec } from "./race-set.ts";
import { parseTrace } from "./trace.ts";
import { buildModel } from "../models/models.ts";
import { OpenRouterError, type ChatResult } from "../models/openrouter.ts";
import { fakeLinks } from "../wikipedia/fake-wikipedia.ts";

// Two races on the fake Wikipedia; both win with the same two moves.
const spec = (id: string): RaceSpec => ({
  id,
  difficulty: "medium",
  start: "Guinness",
  target: "Albert Einstein",
  knownPath: ["Guinness", "Republic of Ireland", "Einstein"],
  measured: { twoHopRoutes: 1, complete: true, examples: [], measuredOn: "2026-11-16" },
});

// Moves to Republic of Ireland, then Einstein, charging `cost` per call.
function winningModel(cost: number | null): CallModel {
  return async (messages) => {
    const moves = messages.filter((message) => message.role === "assistant").length;
    const page = moves === 0 ? "Republic of Ireland" : "Einstein";
    return reply(page, cost);
  };
}

function reply(page: string, cost: number | null): ChatResult {
  return {
    content: null,
    reasoning: null,
    reasoningDetails: null,
    toolCalls: [{ id: `call_${page}`, name: "move_to", arguments: JSON.stringify({ page }) }],
    finishReason: "tool_calls",
    usage: { promptTokens: 100, cachedTokens: 0, completionTokens: 10, reasoningTokens: 0, cost },
    provider: "fake",
    generationId: null,
    attempts: 1,
    durationMs: 0,
  };
}

const failing = (status: number): CallModel => async () => {
  throw new OpenRouterError("boom", status);
};

function evalWith(callModel: CallModel, options: Partial<EvalOptions> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "eval-test-"));
  const run = runEval({
    dir,
    model: buildModel,
    races: [spec("a"), spec("b")],
    repeats: 2,
    maxCost: 1,
    callModel,
    getLinks: fakeLinks,
    limits: { maxTurns: 5, maxPromptTokens: 100_000, maxOutputTokens: 100 },
    git: { gitCommit: "abc123", gitDirty: false },
    log: () => {},
    ...options,
  });
  const manifest = () => JSON.parse(readFileSync(join(dir, "eval.json"), "utf8"));
  return { dir, run, manifest };
}

test("every race runs every repeat, all races once before any twice", async () => {
  const { dir, run, manifest } = evalWith(winningModel(0.001));
  const result = await run;
  assert.equal(result.stop, "completed");
  assert.equal(result.runs, 4);
  const runs = manifest().runs.map((r: { raceId: string; repeat: number }) => `${r.raceId}${r.repeat}`);
  assert.deepEqual(runs, ["a1", "b1", "a2", "b2"]);
  assert.equal(manifest().stop, "completed");
  assert.equal(readdirSync(dir).filter((file) => file.endsWith(".jsonl")).length, 4);
});

test("each trace records the commit and ends with the run's result", async () => {
  const { dir, run, manifest } = evalWith(winningModel(0.001));
  await run;
  const events = parseTrace(readFileSync(join(dir, manifest().runs[0].trace), "utf8"));
  const first = events[0];
  const last = events.at(-1);
  assert.ok(first?.type === "run_start");
  assert.equal(first.gitCommit, "abc123");
  assert.ok(last?.type === "run_end");
  assert.deepEqual(last.end, { kind: "finished", reason: "won" });
});

test("no run starts once spending reaches the cap", async () => {
  // Each run makes 2 calls at $0.01, so $0.02 a run.
  const { run, manifest } = evalWith(winningModel(0.01), { maxCost: 0.03 });
  const result = await run;
  assert.equal(result.stop, "cost_cap");
  assert.equal(result.runs, 2);
  assert.equal(manifest().spent, 0.04);
});

test("a run whose cost is unknown stops the eval: the cap can't be kept", async () => {
  const result = await evalWith(winningModel(null)).run;
  assert.deepEqual(result, { stop: "unknown_cost", spent: 0, runs: 1 });
});

test("running out of credits or a refused key stops the eval at once", async () => {
  assert.equal((await evalWith(failing(402)).run).stop, "no_credits");
  const refused = await evalWith(failing(401)).run;
  assert.deepEqual(refused, { stop: "unauthorized", spent: 0, runs: 1 });
});

test("three crashes in a row stop the eval", async () => {
  const result = await evalWith(failing(503), { repeats: 3 }).run;
  assert.deepEqual(result, { stop: "repeated_crashes", spent: 0, runs: 3 });
});
