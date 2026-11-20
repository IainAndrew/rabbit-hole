import assert from "node:assert/strict";
import { test } from "node:test";
import { shortestPath } from "./distance.ts";
import { fakeGraph } from "./fake-graph.ts";

const limits = { maxHops: 4, maxLookups: 100 };
const quiet = () => {};

// A > B > C > D > T is 4 hops; A > E > T is the shortcut.
const withShortcut = { A: ["B", "E"], B: ["C"], C: ["D"], D: ["T"], E: ["T"] };

test("finds the fewest hops and one path that takes them", async () => {
  const { graph } = fakeGraph(withShortcut);
  const result = await shortestPath("A", "T", graph, limits, quiet);
  assert.deepEqual(result, { hops: 2, path: ["A", "E", "T"], searchedHops: 2, exact: true, lookups: 2 });
});

test("a target further than the limit isn't found, and says how far was searched", async () => {
  const { graph } = fakeGraph({ A: ["B"], B: ["C"], C: ["D"], D: ["E"], E: ["T"] });
  const result = await shortestPath("A", "T", graph, limits, quiet);
  assert.equal(result.hops, null);
  assert.equal(result.searchedHops, 4);
});

test("a target few pages link to is searched from its own end", async () => {
  // A links to 20 pages; only M links to T, and only B links to M.
  const many = Array.from({ length: 20 }, (_, i) => `P${i}`);
  const { graph, calls } = fakeGraph({ A: [...many, "B"], B: ["M"], M: ["T"] });
  const result = await shortestPath("A", "T", graph, limits, quiet);
  assert.deepEqual(result.path, ["A", "B", "M", "T"]);
  // One look forward from A, then back from T and M: never through the 20.
  assert.deepEqual(calls, { neighbours: 1, backlinks: 2 });
});

test("stops before a level it can't finish", async () => {
  const { graph } = fakeGraph(withShortcut);
  const capped = await shortestPath("A", "T", graph, { maxHops: 4, maxLookups: 1 }, quiet);
  assert.deepEqual(capped, { hops: null, path: [], searchedHops: 1, exact: true, lookups: 1 });
});

test("cut-off backlinks make a result inexact, unless they're in the level where the sides met", async () => {
  // T's backlinks are cut off in the level that finds E: shorter paths were already ruled out.
  const met = await shortestPath("A", "T", fakeGraph(withShortcut, ["T"]).graph, limits, quiet);
  assert.equal(met.exact, true);
  // Here they're cut off and the search goes on, so a missed backlink could be a shortcut.
  const chain = { A: ["B", "X", "Y"], B: ["C"], C: ["D"], D: ["E"], E: ["T"] };
  const missed = await shortestPath("A", "T", fakeGraph(chain, ["T"]).graph, limits, quiet);
  assert.equal(missed.exact, false);
});
