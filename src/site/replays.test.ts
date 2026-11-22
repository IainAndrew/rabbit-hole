import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelCallEvent, ToolCallEvent, TraceLine } from "../agent/trace.ts";
import { fakeEval, givingUpModel } from "../evals/fake-eval.ts";
import { loadEval } from "../evals/report.ts";
import { buildModel } from "../models/models.ts";
import { replayOf, summaryOf } from "./replays.ts";

const limits = { maxTurns: 30, maxContextChars: 330_000, maxOutputTokens: 2000 };

const start: TraceLine = {
  t: 0,
  type: "run_start",
  model: buildModel,
  start: "Guinness",
  target: "Albert Einstein",
  systemPrompt: "Race.",
  promptHash: "abc",
  gitCommit: "abc123",
  gitDirty: false,
  limits,
  contextStrategy: "full",
  promptVariant: "fewest-hops",
};

/** A model call on `turn`, thinking `reasoning`. */
function modelCall(turn: number, reasoning: string): TraceLine {
  const event: ModelCallEvent = {
    type: "model_call",
    turn,
    contextChars: 1000 * turn,
    provider: "morph/fp8",
    generationId: "gen",
    attempts: 1,
    durationMs: 500,
    finishReason: "tool_calls",
    content: null,
    reasoning,
    toolCalls: [],
    usage: { promptTokens: 300, cachedTokens: 0, completionTokens: 20, reasoningTokens: 10, cost: 0.0001 },
  };
  return { t: 600 * turn, ...event };
}

/** A tool call on `turn` that returned `result`. */
function toolCall(turn: number, name: string, page: string, result: string, status: ToolCallEvent["status"] = "ok"): TraceLine {
  const event: ToolCallEvent = {
    type: "tool_call",
    turn,
    callId: `call-${turn}`,
    name,
    arguments: JSON.stringify({ page }),
    result,
    status,
    durationMs: 5,
    pageBefore: "Guinness",
    pageAfter: name === "move_to" && status === "ok" ? page : "Guinness",
  };
  return { t: 600 * turn + 10, ...event };
}

const trace: TraceLine[] = [
  start,
  modelCall(1, "Look at Guinness first."),
  toolCall(1, "get_links", "Guinness", 'Links on "Guinness" (3):\nDublin\nIreland\nBeer'),
  modelCall(2, "Ireland is a link."),
  toolCall(2, "move_to", "Einstein", '"Einstein" is not a link on "Guinness".', "error"),
  toolCall(2, "move_to", "Ireland", 'Moved to "Ireland". Hops: 1. Target: "Albert Einstein".'),
];

test("a link list is cut to its first line, and marked as cut", () => {
  const [first] = replayOf(trace).turns;
  assert.deepEqual(first!.calls.map((call) => [call.result, call.trimmed]), [['Links on "Guinness" (3):', true]]);
});

test("everything the model wrote, and every other result, is kept whole", () => {
  const [first, second] = replayOf(trace).turns;
  assert.equal(first!.reasoning, "Look at Guinness first.");
  assert.deepEqual(
    second!.calls.map((call) => [call.status, call.result, call.trimmed, call.pageAfter]),
    [
      ["error", '"Einstein" is not a link on "Guinness".', false, "Guinness"],
      ["ok", 'Moved to "Ireland". Hops: 1. Target: "Albert Einstein".', false, "Ireland"],
    ],
  );
});

test("a trace with no run_end replays as a killed run", () => {
  const replay = replayOf(trace);
  assert.equal(replay.end, null);
  assert.equal(replay.turns.length, 2);
});

test("a tool call before any model call is a malformed trace", () => {
  assert.throws(() => replayOf([start, toolCall(1, "get_links", "Guinness", "x")]), /before any model call/);
});

test("an eval's index names each run's replay file and how it ended", async () => {
  const { dir, run } = fakeEval(givingUpModel(0.001));
  await run;
  const [summary] = loadEval(dir).runs.map(summaryOf);
  assert.match(summary!.file, /_a-r1$/);
  assert.deepEqual(
    [summary!.outcome, summary!.ending, summary!.hops, summary!.turns, summary!.cost],
    ["lost", "gave_up", 0, 1, 0.001],
  );
});
