import assert from "node:assert/strict";
import { test } from "node:test";
import { contextChars, runAgent, type CallModel, type RunOptions } from "./agent.ts";
import { FEWEST_HOPS, SCORING_RULE } from "./prompt.ts";
import { FULL_HISTORY, type ContextStrategy } from "./context.ts";
import { fakeLinks } from "../wikipedia/fake-wikipedia.ts";
import { OpenRouterError, type ChatResult, type Message } from "../models/openrouter.ts";
import type { TraceEvent } from "./trace.ts";

type Call = { name: string; args: unknown };
// One scripted turn: a reply, or an error the model call throws.
type Turn = { calls?: Call[]; finishReason?: string; cost?: number | null } | Error;

// A model that replies from a script, one entry per turn, and records the
// conversation it was shown each time. Past the end of the script it replies
// with text only.
function scriptedModel(turns: Turn[]) {
  const seen: Message[][] = [];
  const callModel: CallModel = async (messages) => {
    seen.push(structuredClone(messages));
    const turn = turns[seen.length - 1] ?? {};
    if (turn instanceof Error) {
      throw turn;
    }
    const calls = turn.calls ?? [];
    return reply({
      toolCalls: calls.map(({ name, args }, i) => ({ id: `call_${seen.length}_${i}`, name, arguments: JSON.stringify(args) })),
      finishReason: turn.finishReason ?? (calls.length > 0 ? "tool_calls" : "stop"),
      cost: turn.cost === undefined ? 0.001 : turn.cost,
    });
  };
  return { callModel, seen };
}

function reply(fields: Pick<ChatResult, "toolCalls" | "finishReason"> & { cost: number | null }): ChatResult {
  return {
    content: fields.toolCalls.length > 0 ? null : "I think I'm done.",
    reasoning: null,
    reasoningDetails: null,
    toolCalls: fields.toolCalls,
    finishReason: fields.finishReason,
    usage: { promptTokens: 0, cachedTokens: null, completionTokens: 0, reasoningTokens: null, cost: fields.cost },
    provider: null,
    generationId: null,
    attempts: 1,
    durationMs: 0,
  };
}

const race = (callModel: CallModel, options: Partial<RunOptions> = {}) =>
  runAgent({
    start: "Guinness",
    target: "Albert Einstein",
    callModel,
    getLinks: fakeLinks,
    prompt: FEWEST_HOPS,
    context: FULL_HISTORY,
    maxTurns: 10,
    maxContextChars: 330_000,
    record: () => {},
    ...options,
  });

const look = (page: string): Call => ({ name: "get_links", args: { page } });
const go = (page: string): Call => ({ name: "move_to", args: { page } });
const finished = (reason: string) => ({ kind: "finished", reason });

test("follows tool calls to the target and wins", async () => {
  const model = scriptedModel([{ calls: [look("Guinness")] }, { calls: [go("Republic of Ireland")] }, { calls: [go("Einstein")] }]);
  const result = await race(model.callModel);
  assert.deepEqual(result.end, finished("won"));
  assert.equal(result.turns, 3);
  assert.deepEqual(result.race.path, ["Guinness", "Republic of Ireland", "Albert Einstein"]);
});

test("each turn sees the last turn's call answered by a result with its id", async () => {
  const model = scriptedModel([{ calls: [look("Guinness")] }]);
  await race(model.callModel);

  const [assistant, toolResult] = model.seen[1]!.slice(-2);
  assert.equal(assistant?.role, "assistant");
  assert.deepEqual(toolResult, {
    role: "tool",
    tool_call_id: "call_1_0",
    content: 'Links on "Guinness" (2):\nRepublic of Ireland\nStout',
  });
});

test("calls after the winning move get a result but aren't run", async () => {
  const model = scriptedModel([{ calls: [go("Republic of Ireland")] }, { calls: [go("Einstein"), go("Physics")] }]);
  const result = await race(model.callModel);
  assert.deepEqual(result.end, finished("won"));
  assert.deepEqual(result.race.path, ["Guinness", "Republic of Ireland", "Albert Einstein"]);
  assert.deepEqual(result.messages.at(-1), {
    role: "tool",
    tool_call_id: "call_2_1",
    content: "Not run: the race is already over.",
  });
});

test("give_up ends the run as gave_up", async () => {
  const result = await race(scriptedModel([{ calls: [{ name: "give_up", args: { reason: "lost" } }] }]).callModel);
  assert.deepEqual(result.end, finished("gave_up"));
});

test("a reply with no tool call is refused, at once", async () => {
  const result = await race(scriptedModel([]).callModel);
  assert.deepEqual(result.end, finished("refused"));
  assert.equal(result.turns, 1);
});

test("a reply blocked by the provider's filter is refused", async () => {
  const model = scriptedModel([{ calls: [go("Republic of Ireland")], finishReason: "content_filter" }]);
  const result = await race(model.callModel);
  assert.deepEqual(result.end, finished("refused"));
  assert.deepEqual(result.race.path, ["Guinness"]);
});

test("a reply cut off at the output cap ends the run without running its calls", async () => {
  const model = scriptedModel([{ calls: [go("Republic of Ireland")], finishReason: "length" }]);
  const result = await race(model.callModel);
  assert.deepEqual(result.end, finished("output_limit"));
  assert.deepEqual(result.race.path, ["Guinness"]);
});

test("a conversation over the context limit ends the run after that turn's tools", async () => {
  // 199 characters before the first move, 303 after it.
  const model = scriptedModel([{ calls: [go("Republic of Ireland")] }, { calls: [go("Einstein")] }]);
  const result = await race(model.callModel, { maxContextChars: 250 });
  assert.deepEqual(result.end, finished("context_limit"));
  assert.deepEqual(result.race.path, ["Guinness", "Republic of Ireland"]);
});

test("a winning move still wins over the context limit", async () => {
  const model = scriptedModel([{ calls: [go("Republic of Ireland")] }, { calls: [go("Einstein")] }]);
  // 303 characters after the first move, 393 after the winning one.
  const result = await race(model.callModel, { maxContextChars: 350 });
  assert.deepEqual(result.end, finished("won"));
  assert.ok(contextChars(result.messages) > 350);
});

// A strategy that shows only the system prompt and the opening message, so
// the view never grows however long the run gets.
const openingOnly: ContextStrategy = { name: "opening-only", view: (history) => history.slice(0, 2) };

test("the model is sent the strategy's view; the run keeps the whole record", async () => {
  const model = scriptedModel([{ calls: [look("Guinness")] }, { calls: [go("Republic of Ireland")] }, { calls: [go("Einstein")] }]);
  const events: TraceEvent[] = [];
  const result = await race(model.callModel, { context: openingOnly, record: (event) => events.push(event) });

  assert.deepEqual(result.end, finished("won"));
  assert.ok(model.seen.every((sent) => sent.length === 2), "every turn was sent the view");
  assert.equal(result.messages.length, 2 + 3 * 2, "the record has every reply and tool result");
  const sizes = events.flatMap((event) => (event.type === "model_call" ? [event.contextChars] : []));
  assert.deepEqual(sizes, [199, 199, 199], "the trace measures what was sent");
});

test("the context limit measures the view, not the record", async () => {
  // The same run that hits a 250-character limit with the full history.
  const model = scriptedModel([{ calls: [go("Republic of Ireland")] }, { calls: [go("Einstein")] }]);
  const result = await race(model.callModel, { context: openingOnly, maxContextChars: 250 });
  assert.deepEqual(result.end, finished("won"));
});

test("the run starts with the prompt variant's system prompt", async () => {
  const model = scriptedModel([{ calls: [go("Republic of Ireland")] }, { calls: [go("Einstein")] }]);
  await race(model.callModel, { prompt: SCORING_RULE });
  assert.deepEqual(model.seen[0]?.[0], { role: "system", content: SCORING_RULE.system });
});

test("context is counted in characters: message text plus tool call names and arguments", () => {
  const messages: Message[] = [
    { role: "user", content: "abc" },
    { role: "assistant", content: null, tool_calls: [{ id: "x", type: "function", function: { name: "go", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "x", content: "12345" },
  ];
  assert.equal(contextChars(messages), 3 + 2 + 2 + 5);
});

test("stops at the turn limit", async () => {
  const lookForever = scriptedModel(Array(5).fill({ calls: [look("Guinness")] }));
  const result = await race(lookForever.callModel, { maxTurns: 3 });
  assert.deepEqual(result.end, finished("turn_limit"));
  assert.equal(result.turns, 3);
});

test("API failures are crashes, not losses, with a cause", async () => {
  const cases = [
    { status: 402, cause: "no_credits" },
    { status: 401, cause: "unauthorized" },
    { status: 429, cause: "retries_exhausted" },
    { status: 503, cause: "retries_exhausted" },
    { status: 400, cause: "api_error" },
    { status: null, cause: "api_error" },
    { status: null, network: true, cause: "retries_exhausted" },
  ];
  for (const { status, network, cause } of cases) {
    const error = new OpenRouterError("boom", status, network ? { cause: new TypeError("fetch failed") } : undefined);
    const model = scriptedModel([{ calls: [look("Guinness")] }, error]);
    const result = await race(model.callModel);
    assert.deepEqual(result.end, { kind: "crashed", cause, error: "boom" }, `status ${status}`);
    assert.equal(result.turns, 1, "only the call that returned counts as a turn");
  }
});

test("any other error is a bug and is thrown, not recorded as a crash", async () => {
  const model = scriptedModel([new TypeError("oops")]);
  await assert.rejects(race(model.callModel), TypeError);
});

test("records each model call, each tool call and the end, in order", async () => {
  const events: TraceEvent[] = [];
  const model = scriptedModel([{ calls: [look("Guinness"), go("Republic of Ireland")] }, { calls: [go("Einstein")] }]);
  await race(model.callModel, { record: (event) => events.push(event) });

  assert.deepEqual(
    events.map((event) => event.type),
    ["model_call", "tool_call", "tool_call", "model_call", "tool_call", "run_end"],
  );
  const move = events[2];
  assert.equal(move?.type === "tool_call" && `${move.pageBefore} > ${move.pageAfter}`, "Guinness > Republic of Ireland");
  const end = events.at(-1);
  assert.equal(end?.type, "run_end");
  if (end?.type === "run_end") {
    assert.deepEqual(end.end, finished("won"));
    assert.deepEqual(end.path, ["Guinness", "Republic of Ireland", "Albert Einstein"]);
    assert.equal(end.totals.cost, 0.002);
  }
});

test("a crash still records a run_end", async () => {
  const events: TraceEvent[] = [];
  await race(scriptedModel([new OpenRouterError("boom", 402)]).callModel, { record: (event) => events.push(event) });
  assert.deepEqual(events.map((event) => event.type), ["run_end"]);
});

test("one unreported cost makes the total unknown, not lower", async () => {
  const model = scriptedModel([{ calls: [look("Guinness")], cost: null }, { calls: [go("Republic of Ireland")] }]);
  const result = await race(model.callModel, { maxTurns: 2 });
  assert.equal(result.totals.cost, null);
});
