import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeGraph } from "./fake-graph.ts";
import { checkRace, measureRace, parseRaceSet, tierFor, type RaceSpec } from "./race-set.ts";
import { fakeLinks } from "../wikipedia/fake-wikipedia.ts";

// Wins in 2 hops on the fake Wikipedia, moving to "Einstein" as the link is written.
const valid: RaceSpec = {
  id: "guinness-einstein",
  difficulty: "easy",
  start: "Guinness",
  target: "Albert Einstein",
  knownPath: ["Guinness", "Republic of Ireland", "Einstein"],
  measured: { distance: 2, targetBacklinks: 3, measuredOn: "2026-11-16" },
};

test("a race whose known path wins passes", async () => {
  assert.deepEqual(await checkRace(valid, fakeLinks), []);
});

test("a known path through a page that isn't linked fails", async () => {
  const race = { ...valid, knownPath: ["Guinness", "Physics", "Einstein"] };
  const problems = await checkRace(race, fakeLinks);
  assert.match(problems.join(), /can't move to "Physics": it isn't a link there/);
});

test("a known path through a red link fails", async () => {
  // The fake Guinness links "Stout", which has no page.
  const race = { ...valid, knownPath: ["Guinness", "Stout", "Einstein"] };
  const problems = await checkRace(race, fakeLinks);
  assert.match(problems.join(), /can't move to "Stout": Wikipedia has no page/);
});

test("a title that isn't canonical fails", async () => {
  const problems = await checkRace({ ...valid, target: "Einstein" }, fakeLinks);
  assert.match(problems.join(), /resolves to "Albert Einstein"/);
});

test("a missing page is reported, not thrown", async () => {
  const problems = await checkRace({ ...valid, target: "Nowhere" }, fakeLinks);
  assert.match(problems.join(), /no page called "Nowhere"/);
});

test("a start that links the target directly fails", async () => {
  const race = { ...valid, start: "Republic of Ireland", target: "Guinness", knownPath: ["Republic of Ireland", "Guinness"] };
  const problems = await checkRace(race, fakeLinks);
  assert.match(problems.join(), /links the target directly/);
});

test("a difficulty that doesn't match the measurement fails", async () => {
  const problems = await checkRace({ ...valid, difficulty: "hard" }, fakeLinks);
  assert.match(problems.join(), /marked hard, but its measurement says easy/);
});

test("a known path that doesn't take the measured distance fails", async () => {
  const race: RaceSpec = { ...valid, difficulty: "hard", measured: { ...valid.measured, distance: 3 } };
  const problems = await checkRace(race, fakeLinks);
  assert.match(problems.join(), /takes 2 hops, but the race was measured at 3/);
});

test("the race file is checked: repeated ids and unknown difficulties are refused", () => {
  assert.equal(parseRaceSet([valid]).length, 1);
  assert.throws(() => parseRaceSet([valid, valid]), /repeats the id/);
  assert.throws(() => parseRaceSet([{ ...valid, difficulty: "tricky" }]), /difficulty/);
  assert.throws(() => parseRaceSet([{ ...valid, measured: undefined }]), /run measure-races/);
});

test("tiers follow the distance, and a rarely linked target makes 3 hops hard", () => {
  const at = (distance: number, targetBacklinks: number) => tierFor({ distance, targetBacklinks, measuredOn: "" });
  assert.equal(at(2, 5), "easy");
  assert.equal(at(3, 100), "medium");
  assert.equal(at(3, 99), "hard");
  assert.equal(at(4, 1000), "hard");
});

test("measuring finds the distance and counts the target's backlinks", async () => {
  const { graph } = fakeGraph({
    Guinness: ["Republic of Ireland", "Stout"],
    "Republic of Ireland": ["Albert Einstein"],
    Physics: ["Albert Einstein"],
    Bern: ["Albert Einstein"],
  });
  const result = await measureRace(valid, graph, "2026-11-16");
  assert.deepEqual(result, {
    ok: true,
    measured: { distance: 2, targetBacklinks: 3, measuredOn: "2026-11-16" },
    difficulty: "easy",
  });
});

test("a race too far, too near or not certain can't be measured", async () => {
  const measure = async (links: Record<string, string[]>, cutOff: string[] = []) => {
    const result = await measureRace(valid, fakeGraph(links, cutOff).graph, "2026-11-16");
    return result.ok ? "ok" : result.problem;
  };
  const tooFar = { Guinness: ["A"], A: ["B"], B: ["C"], C: ["D"], D: ["Albert Einstein"] };
  assert.match(await measure(tooFar), /no path of 4 hops or fewer/);
  assert.match(await measure({ Guinness: ["Albert Einstein"] }), /links the target directly/);
  // The target's backlinks are cut off and the sides don't meet there, so a 2-hop path could be hiding.
  const hidden = { Guinness: ["X", "Y", "Z"], X: ["M"], M: ["Albert Einstein"] };
  assert.match(await measure(hidden, ["Albert Einstein"]), /a shorter path may exist/);
});
