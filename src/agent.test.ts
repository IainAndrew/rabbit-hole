import assert from "node:assert/strict";
import { test } from "node:test";
import { runAgent, type CallModel } from "./agent.ts";
import { fakeLinks } from "./fake-wikipedia.ts";
import type { ChatResult, Message } from "./openrouter.ts";

// A model that replies from a script, one reply per turn, and records the
// conversation it was shown each time.
function scriptedModel(replies: { name: string; args: unknown }[][]) {
  const seen: Message[][] = [];
  const callModel: CallModel = async (messages) => {
    seen.push(structuredClone(messages));
    const calls = replies[seen.length - 1] ?? [];
    return reply(calls.map(({ name, args }, i) => ({ id: `call_${seen.length}_${i}`, name, arguments: JSON.stringify(args) })));
  };
  return { callModel, seen };
}

function reply(toolCalls: ChatResult["toolCalls"]): ChatResult {
  return {
    content: null,
    reasoning: null,
    reasoningDetails: null,
    toolCalls,
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
    usage: { promptTokens: 0, cachedTokens: null, completionTokens: 0, reasoningTokens: null, cost: null },
    provider: null,
    durationMs: 0,
  };
}

const race = (callModel: CallModel, maxTurns = 10) =>
  runAgent({ start: "Guinness", target: "Albert Einstein", callModel, getLinks: fakeLinks, maxTurns });

test("follows tool calls to the target and wins", async () => {
  const model = scriptedModel([
    [{ name: "get_links", args: { page: "Guinness" } }],
    [{ name: "move_to", args: { page: "Republic of Ireland" } }],
    [{ name: "move_to", args: { page: "Einstein" } }],
  ]);
  const result = await race(model.callModel);
  assert.equal(result.end, "won");
  assert.equal(result.turns, 3);
  assert.deepEqual(result.race.path, ["Guinness", "Republic of Ireland", "Albert Einstein"]);
});

test("each turn sees the last turn's call answered by a result with its id", async () => {
  const model = scriptedModel([[{ name: "get_links", args: { page: "Guinness" } }], []]);
  await race(model.callModel);

  const second = model.seen[1]!;
  const [assistant, toolResult] = second.slice(-2);
  assert.equal(assistant?.role, "assistant");
  assert.deepEqual(toolResult, {
    role: "tool",
    tool_call_id: "call_1_0",
    content: 'Links on "Guinness" (2):\nRepublic of Ireland\nStout',
  });
});

test("calls after the winning move get a result but aren't run", async () => {
  const model = scriptedModel([
    [{ name: "move_to", args: { page: "Republic of Ireland" } }],
    [
      { name: "move_to", args: { page: "Einstein" } },
      { name: "move_to", args: { page: "Physics" } },
    ],
  ]);
  const result = await race(model.callModel);
  assert.equal(result.end, "won");
  assert.deepEqual(result.race.path, ["Guinness", "Republic of Ireland", "Albert Einstein"]);
  assert.deepEqual(result.messages.at(-1), {
    role: "tool",
    tool_call_id: "call_2_1",
    content: "Not run: the race is already over.",
  });
});

test("a reply with no tool call ends the run", async () => {
  const result = await race(scriptedModel([]).callModel);
  assert.equal(result.end, "no_tool_call");
  assert.equal(result.turns, 1);
});

test("stops at the turn limit", async () => {
  const lookForever = scriptedModel(Array(5).fill([{ name: "get_links", args: { page: "Guinness" } }]));
  const result = await race(lookForever.callModel, 3);
  assert.equal(result.end, "turn_limit");
  assert.equal(result.turns, 3);
});
