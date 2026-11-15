import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPage, hops, move, startRace } from "./race.ts";
import { fakeLinks } from "./fake-wikipedia.ts";

test("a race starts on the start page with no hops", async () => {
  const race = await startRace("Guinness", "Albert Einstein", fakeLinks);
  assert.equal(currentPage(race), "Guinness");
  assert.equal(hops(race), 0);
});

test("the target is resolved through redirects", async () => {
  const race = await startRace("Guinness", "Einstein", fakeLinks);
  assert.equal(race.target, "Albert Einstein");
});

test("moving along a link adds a hop", async () => {
  const race = await startRace("Guinness", "Albert Einstein", fakeLinks);
  const result = await move(race, "Republic of Ireland", fakeLinks);
  assert.ok(result.ok);
  assert.equal(hops(result.race), 1);
  assert.equal(result.won, false);
});

test("moving to a page that isn't linked is refused and changes nothing", async () => {
  const race = await startRace("Guinness", "Albert Einstein", fakeLinks);
  const result = await move(race, "Albert Einstein", fakeLinks);
  assert.deepEqual(result, { ok: false, race, reason: "not_a_link" });
});

test("reaching the target through a redirect wins", async () => {
  const race = await startRace("Guinness", "Albert Einstein", fakeLinks);
  const first = await move(race, "Republic of Ireland", fakeLinks);
  assert.ok(first.ok);
  const second = await move(first.race, "Einstein", fakeLinks);
  assert.ok(second.ok);
  assert.equal(second.won, true);
  assert.deepEqual(second.race.path, ["Guinness", "Republic of Ireland", "Albert Einstein"]);
});

test("link names match the way Wikipedia does: first letter and underscores", async () => {
  const race = await startRace("Guinness", "Albert Einstein", fakeLinks);
  const result = await move(race, "republic_of Ireland", fakeLinks);
  assert.ok(result.ok);
  assert.equal(currentPage(result.race), "Republic of Ireland");
});

test("no moves are allowed once the race is won", async () => {
  const race = await startRace("Albert Einstein", "Albert Einstein", fakeLinks);
  const result = await move(race, "Physics", fakeLinks);
  assert.deepEqual(result, { ok: false, race, reason: "race_over" });
});
