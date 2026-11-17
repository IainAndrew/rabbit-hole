import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunEnd } from "../agent/agent.ts";
import { buildModel } from "../models/models.ts";
import type { LoadedRun } from "./report.ts";
import { averagesOf, outcomeOf, scoreRuns } from "./score.ts";

type Ending = "won" | "gave_up" | "turn_limit" | "crashed" | "killed";

// A run built by hand: only the fields the scoring reads matter.
function run(ending: Ending, numbers: { hops?: number; turns?: number; cost?: number | null } = {}): LoadedRun {
  let end: RunEnd;
  if (ending === "crashed") {
    end = { kind: "crashed", cause: "api_error", error: "boom" };
  } else {
    // A killed run has no run_end at all; the reason here goes unused.
    end = { kind: "finished", reason: ending === "killed" ? "won" : ending };
  }
  return {
    raceId: "a",
    difficulty: "medium",
    repeat: 1,
    trace: "a.jsonl",
    start: {
      type: "run_start",
      model: buildModel,
      start: "Guinness",
      target: "Albert Einstein",
      systemPrompt: "",
      promptHash: "p",
      gitCommit: "c",
      gitDirty: false,
      limits: { maxTurns: 30, maxPromptTokens: 100_000, maxOutputTokens: 2000 },
    },
    end:
      ending === "killed"
        ? null
        : {
            type: "run_end",
            end,
            path: [],
            hops: numbers.hops ?? 2,
            turns: numbers.turns ?? 5,
            totals: {
              promptTokens: 1000,
              cachedTokens: 0,
              completionTokens: 0,
              reasoningTokens: 0,
              cost: numbers.cost === undefined ? 0.01 : numbers.cost,
              durationMs: 2000,
            },
          },
  };
}

test("every ending counts as won, lost, crashed or killed", () => {
  const outcomes = (["won", "gave_up", "turn_limit", "crashed", "killed"] as const).map((ending) => outcomeOf(run(ending)));
  assert.deepEqual(outcomes, ["won", "lost", "lost", "crashed", "killed"]);
});

test("success rate is wins over decided runs; crashes and killed runs don't count", () => {
  const score = scoreRuns([run("won"), run("won"), run("gave_up"), run("crashed"), run("killed")]);
  assert.equal(score.won, 2);
  assert.equal(score.decided, 3);
  assert.equal(score.successRate, 2 / 3);
  assert.equal(score.crashed, 1);
  assert.equal(score.killed, 1);
});

test("hops are averaged over wins only", () => {
  const score = scoreRuns([run("won", { hops: 2 }), run("won", { hops: 3 }), run("turn_limit", { hops: 9 })]);
  assert.equal(score.meanHopsOnWins, 2.5);
});

test("with nothing decided or nothing won, the rate or the hops are null, not 0", () => {
  assert.equal(scoreRuns([run("crashed")]).successRate, null);
  assert.equal(scoreRuns([run("gave_up")]).successRate, 0);
  assert.equal(scoreRuns([run("gave_up")]).meanHopsOnWins, null);
});

test("averages cover decided runs, and one unknown cost makes the average unknown", () => {
  const averages = averagesOf([run("won", { turns: 4 }), run("gave_up", { turns: 8 }), run("crashed", { turns: 1 })]);
  assert.deepEqual(averages, { turns: 6, promptTokens: 1000, cost: 0.01, seconds: 2 });
  assert.equal(averagesOf([run("won"), run("won", { cost: null })])?.cost, null);
  assert.equal(averagesOf([run("crashed")]), null);
});
