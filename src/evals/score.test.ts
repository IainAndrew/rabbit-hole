import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunEnd } from "../agent/agent.ts";
import { buildModel } from "../models/models.ts";
import type { LoadedRun } from "./report.ts";
import { averagesOf, behaviourOf, outcomeOf, scoreRuns } from "./score.ts";

type Ending = "won" | "gave_up" | "turn_limit" | "crashed" | "killed";

// A run built by hand: only the fields the scoring reads matter.
function run(
  ending: Ending,
  numbers: { hops?: number; turns?: number; cost?: number | null; cached?: number; moves?: LoadedRun["moves"] } = {},
): LoadedRun {
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
    moves: numbers.moves ?? { attempts: 2, refused: 0, firstTurn: 1 },
    start: {
      type: "run_start",
      model: buildModel,
      start: "Guinness",
      target: "Albert Einstein",
      systemPrompt: "",
      promptHash: "p",
      gitCommit: "c",
      gitDirty: false,
      limits: { maxTurns: 30, maxContextChars: 330_000, maxOutputTokens: 2000 },
      contextStrategy: "full",
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
              cachedTokens: numbers.cached ?? 0,
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

test("behaviour pools moves and cached tokens over decided runs", () => {
  const behaviour = behaviourOf([
    run("won", { cached: 800, moves: { attempts: 3, refused: 1, firstTurn: 2 } }),
    run("gave_up", { cached: 0, moves: { attempts: 1, refused: 1, firstTurn: null } }),
    run("won", { cached: 400, moves: { attempts: 4, refused: 0, firstTurn: 4 } }),
    run("crashed", { moves: { attempts: 9, refused: 9, firstTurn: null } }),
  ]);
  assert.deepEqual(behaviour, { refusedMoveShare: 2 / 8, meanFirstMoveTurn: 3, neverMoved: 1, cachedShare: 1200 / 3000 });
  assert.equal(behaviourOf([run("crashed")]), null);
  assert.equal(behaviourOf([run("gave_up", { moves: { attempts: 0, refused: 0, firstTurn: null } })])?.refusedMoveShare, null);
});
