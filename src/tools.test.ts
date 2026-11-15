import { test } from "node:test";
import assert from "node:assert/strict";
import { startRace } from "./race.ts";
import { executeTool } from "./tools.ts";
import { fakeLinks } from "./fake-wikipedia.ts";

const newRace = () => startRace("Guinness", "Albert Einstein", fakeLinks);
const call = (name: string, args: unknown) => ({ name, arguments: JSON.stringify(args) });

test("get_links lists a page's links without moving", async () => {
  const race = await newRace();
  const out = await executeTool(call("get_links", { page: "Republic of Ireland" }), race, fakeLinks);
  assert.equal(out.status, "ok");
  assert.equal(out.content, 'Links on "Republic of Ireland" (2):\nEinstein\nGuinness');
  assert.equal(out.race, race);
});

test("get_links on a missing page is an error the model can read", async () => {
  const out = await executeTool(call("get_links", { page: "Nowhere" }), await newRace(), fakeLinks);
  assert.equal(out.status, "error");
  assert.match(out.content, /no page called "Nowhere"/);
});

test("move_to follows a link and reports hops and target", async () => {
  const out = await executeTool(call("move_to", { page: "Republic of Ireland" }), await newRace(), fakeLinks);
  assert.equal(out.content, 'Moved to "Republic of Ireland". Hops: 1. Target: "Albert Einstein".');
  assert.equal(out.end, null);
});

test("an illegal move is an error that says what to do next", async () => {
  const race = await newRace();
  const out = await executeTool(call("move_to", { page: "Albert Einstein" }), race, fakeLinks);
  assert.equal(out.status, "error");
  assert.match(out.content, /not a link on "Guinness"\. Use get_links on "Guinness"/);
  assert.equal(out.race, race);
});

test("reaching the target ends the race as won", async () => {
  const first = await executeTool(call("move_to", { page: "Republic of Ireland" }), await newRace(), fakeLinks);
  const second = await executeTool(call("move_to", { page: "Einstein" }), first.race, fakeLinks);
  assert.equal(second.end, "won");
  assert.match(second.content, /you won/);
});

test("give_up ends the race", async () => {
  const out = await executeTool(call("give_up", { reason: "lost" }), await newRace(), fakeLinks);
  assert.equal(out.end, "gave_up");
});

test("bad calls come back as errors, not exceptions", async () => {
  const race = await newRace();
  const notJson = await executeTool({ name: "get_links", arguments: "{page:" }, race, fakeLinks);
  const missingArg = await executeTool(call("move_to", {}), race, fakeLinks);
  const unknown = await executeTool(call("teleport", { page: "Albert Einstein" }), race, fakeLinks);
  assert.deepEqual(
    [notJson.status, missingArg.status, unknown.status],
    ["error", "error", "error"],
  );
  assert.match(unknown.content, /no tool called "teleport"/);
});
