import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRace, measureRace, parseRaceSet, tierFor, type GraphSource, type RaceSpec } from "./race-set.ts";
import { fakeLinks } from "../wikipedia/fake-wikipedia.ts";

// Wins in 2 hops on the fake Wikipedia, moving to "Einstein" as the link is written.
const valid: RaceSpec = {
  id: "guinness-einstein",
  difficulty: "medium",
  start: "Guinness",
  target: "Albert Einstein",
  knownPath: ["Guinness", "Republic of Ireland", "Einstein"],
  measured: { twoHopRoutes: 1, complete: true, examples: ["Republic of Ireland"], measuredOn: "2026-11-16" },
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
  const problems = await checkRace({ ...valid, difficulty: "easy" }, fakeLinks);
  assert.match(problems.join(), /marked easy, but its measurement says medium/);
});

test("a hard race needs a known path of 3 or more hops", async () => {
  const problems = await checkRace({ ...valid, difficulty: "hard" }, fakeLinks);
  assert.match(problems.join(), /should be 3\+ hops/);
});

test("the race file is checked: repeated ids and unknown difficulties are refused", () => {
  assert.equal(parseRaceSet([valid]).length, 1);
  assert.throws(() => parseRaceSet([valid, valid]), /repeats the id/);
  assert.throws(() => parseRaceSet([{ ...valid, difficulty: "tricky" }]), /difficulty/);
  assert.throws(() => parseRaceSet([{ ...valid, measured: undefined }]), /run measure-races/);
});

test("tiers follow the route count, and an incomplete count under 10 decides nothing", () => {
  const at = (twoHopRoutes: number, complete: boolean) => tierFor({ twoHopRoutes, complete, examples: [], measuredOn: "" });
  assert.equal(at(10, false), "easy");
  assert.equal(at(9, true), "medium");
  assert.equal(at(0, true), "hard");
  assert.equal(at(9, false), null);
});

// A fake graph: the start's neighbours, and backlinks served 5 at a time.
function fakeGraph(neighbours: string[], backlinks: string[]): GraphSource & { batches: number } {
  const graph = {
    batches: 0,
    neighbours: async () => new Set(neighbours),
    backlinks: async (_title: string, enough: (found: Set<string>) => boolean) => {
      const found = new Set<string>();
      for (let i = 0; i < backlinks.length; i += 5) {
        graph.batches++;
        for (const page of backlinks.slice(i, i + 5)) found.add(page);
        if (enough(found) && i + 5 < backlinks.length) return { pages: found, complete: false };
      }
      return { pages: found, complete: true };
    },
  };
  return graph;
}

test("measuring counts the pages the start reaches that link the target", async () => {
  const graph = fakeGraph(["A", "B", "C"], ["B", "C", "Z"]);
  const result = await measureRace(valid, graph, "2026-11-16");
  assert.ok(result.ok);
  assert.equal(result.difficulty, "medium");
  assert.deepEqual(result.measured, { twoHopRoutes: 2, complete: true, examples: ["B", "C"], measuredOn: "2026-11-16" });
});

test("measuring stops once a race is certainly easy", async () => {
  const pages = Array.from({ length: 30 }, (_, i) => `P${i}`);
  const graph = fakeGraph(pages, pages);
  const result = await measureRace(valid, graph, "2026-11-16");
  assert.ok(result.ok);
  assert.equal(result.difficulty, "easy");
  assert.equal(result.measured.complete, false);
  assert.equal(graph.batches, 2);
});

test("a start that links the target, even through a redirect, can't be measured", async () => {
  // Neighbours have redirects followed, so a link written "Einstein" shows up as the target.
  const result = await measureRace(valid, fakeGraph(["Albert Einstein"], []), "2026-11-16");
  assert.deepEqual(result, { ok: false, problem: "the start links the target directly: a 1-hop race measures nothing" });
});
