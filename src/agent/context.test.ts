import assert from "node:assert/strict";
import { test } from "node:test";
import { FULL_HISTORY, MASKED } from "./context.ts";
import type { Message } from "../models/openrouter.ts";

// One turn: the model calls get_links on each page, and each call gets its list.
function lookupTurn(turn: number, pages: string[]): Message[] {
  const ids = pages.map((_, i) => `t${turn}_${i}`);
  return [
    {
      role: "assistant",
      content: `turn ${turn}`,
      tool_calls: pages.map((page, i) => ({
        id: ids[i]!,
        type: "function",
        function: { name: "get_links", arguments: JSON.stringify({ page }) },
      })),
    },
    ...pages.map((page, i): Message => ({ role: "tool", tool_call_id: ids[i]!, content: `Links on "${page}" (2):\nA\nB` })),
  ];
}

const opening: Message[] = [
  { role: "system", content: "Play the race." },
  { role: "user", content: 'You are on "Guinness". The target is "Albert Einstein".' },
];

const masked = (page: string) => `Links on "${page}" (2): [hidden to save space: call get_links again to see them]`;
const contents = (messages: Message[]) => messages.map((message) => message.content);

test("full history sends every message as it is", () => {
  const history = [...opening, ...lookupTurn(1, ["Guinness"])];
  assert.deepEqual(FULL_HISTORY.view(history), history);
});

test("masking keeps the last two turns' link lists whole and cuts older ones to their header", () => {
  const history = [...opening, ...lookupTurn(1, ["Guinness", "Stout"]), ...lookupTurn(2, ["Ireland"]), ...lookupTurn(3, ["Dublin"])];
  assert.deepEqual(contents(MASKED.view(history)), [
    ...contents(opening),
    "turn 1",
    masked("Guinness"),
    masked("Stout"),
    "turn 2",
    'Links on "Ireland" (2):\nA\nB',
    "turn 3",
    'Links on "Dublin" (2):\nA\nB',
  ]);
});

test("masking changes nothing until there are more than two turns", () => {
  const history = [...opening, ...lookupTurn(1, ["Guinness"]), ...lookupTurn(2, ["Ireland"])];
  assert.deepEqual(MASKED.view(history), history);
});

test("masking leaves moves, errors and the record itself alone", () => {
  const move: Message[] = [
    { role: "assistant", content: null, tool_calls: [{ id: "m", type: "function", function: { name: "move_to", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "m", content: 'Moved to "Stout". Hops: 1.' },
  ];
  const error: Message[] = [
    { role: "assistant", content: null, tool_calls: [{ id: "e", type: "function", function: { name: "get_links", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "e", content: 'Error: get_links needs a "page" string.' },
  ];
  const history = [...opening, ...move, ...error, ...lookupTurn(3, ["Ireland"]), ...lookupTurn(4, ["Dublin"])];
  const before = structuredClone(history);
  const view = MASKED.view(history);
  assert.equal(view[3]?.content, 'Moved to "Stout". Hops: 1.');
  assert.equal(view[5]?.content, 'Error: get_links needs a "page" string.');
  assert.deepEqual(history, before, "the record isn't changed");
});
