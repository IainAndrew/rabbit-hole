import assert from "node:assert/strict";
import { test } from "node:test";
import { FULL_HISTORY, MASKED, REBUILT_STATE } from "./context.ts";
import type { Message } from "../models/openrouter.ts";
import type { Race } from "../race/race.ts";

const race: Race = { start: "Guinness", target: "Albert Einstein", path: ["Guinness"] };

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
  assert.deepEqual(FULL_HISTORY.view(history, race), history);
});

test("masking keeps the last two turns' link lists whole and cuts older ones to their header", () => {
  const history = [...opening, ...lookupTurn(1, ["Guinness", "Stout"]), ...lookupTurn(2, ["Ireland"]), ...lookupTurn(3, ["Dublin"])];
  assert.deepEqual(contents(MASKED.view(history, race)), [
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
  assert.deepEqual(MASKED.view(history, race), history);
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
  const view = MASKED.view(history, race);
  assert.equal(view[3]?.content, 'Moved to "Stout". Hops: 1.');
  assert.equal(view[5]?.content, 'Error: get_links needs a "page" string.');
  assert.deepEqual(history, before, "the record isn't changed");
});

// One turn of calls, each answered with the given result.
function turnOf(turn: number, words: string | null, calls: { name: string; page: string; result: string }[]): Message[] {
  return [
    {
      role: "assistant",
      content: words,
      tool_calls: calls.map(({ name, page }, i) => ({
        id: `s${turn}_${i}`,
        type: "function",
        function: { name, arguments: JSON.stringify({ page }) },
      })),
    },
    ...calls.map(({ result }, i): Message => ({ role: "tool", tool_call_id: `s${turn}_${i}`, content: result })),
  ];
}

const guinnessLinks = 'Links on "Guinness" (2):\nRepublic of Ireland\nStout';
const irelandLinks = 'Links on "Republic of Ireland" (2):\nEinstein\nGuinness';

test("rebuilt state sends the system prompt and one message of facts", () => {
  const view = REBUILT_STATE.view(opening, race);
  assert.equal(view.length, 2);
  assert.deepEqual(view[0], opening[0]);
  assert.equal(
    view[1]?.content,
    [
      `You haven't looked up the links on "Guinness" yet.`,
      "",
      `You are on "Guinness". The target is "Albert Einstein".`,
      "Path so far (0 hops): Guinness",
      "Pages you have looked up: none yet",
    ].join("\n"),
  );
});

test("rebuilt state shows last turn's results, the current page's links and moves refused here, not the model's words", () => {
  const history = [
    ...opening,
    ...turnOf(1, "I'll look around.", [{ name: "get_links", page: "Republic of Ireland", result: irelandLinks }]),
    ...turnOf(2, null, [{ name: "get_links", page: "Guinness", result: guinnessLinks }]),
    ...turnOf(3, "Stout must lead to Einstein.", [
      { name: "move_to", page: "Albert Einstein", result: 'Error: "Albert Einstein" is not a link on "Guinness".' },
    ]),
  ];
  const text = REBUILT_STATE.view(history, race)[1]?.content ?? "";
  assert.ok(text.startsWith('Your last turn:\n\nmove_to {"page":"Albert Einstein"} returned:\nError:'));
  assert.ok(text.includes(guinnessLinks), "the current page's links, fetched two turns ago");
  assert.ok(!text.includes(irelandLinks), "other pages' lists aren't repeated");
  assert.ok(text.includes("Pages you have looked up: Republic of Ireland, Guinness"));
  assert.ok(text.endsWith('Moves already refused on "Guinness" (not links on it): Albert Einstein'));
  assert.ok(!text.includes("Stout must lead") && !text.includes("look around"));
});

test("a move that works clears the refused moves and shows the new page", () => {
  const moved: Race = { ...race, path: ["Guinness", "Republic of Ireland"] };
  const history = [
    ...opening,
    ...turnOf(1, null, [
      { name: "move_to", page: "Stout (beer)", result: 'Error: "Stout (beer)" is not a link on "Guinness".' },
      { name: "get_links", page: "Republic of Ireland", result: irelandLinks },
    ]),
    ...turnOf(2, null, [{ name: "move_to", page: "Republic of Ireland", result: 'Moved to "Republic of Ireland". Hops: 1.' }]),
  ];
  const text = REBUILT_STATE.view(history, moved)[1]?.content ?? "";
  assert.ok(text.includes(irelandLinks));
  assert.ok(text.includes("Path so far (1 hops): Guinness > Republic of Ireland"));
  assert.ok(!text.includes("refused"));
});
