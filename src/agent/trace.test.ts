import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTrace } from "./trace.ts";

const runEnd = {
  t: 900,
  type: "run_end",
  end: { kind: "finished", reason: "won" },
  path: ["Guinness", "Albert Einstein"],
  hops: 1,
  turns: 1,
  totals: { promptTokens: 500 },
};

test("parses one event per line and skips blank lines", () => {
  const events = parseTrace(`${JSON.stringify(runEnd)}\n\n`);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, "run_end");
});

test("says which line is broken and why", () => {
  const good = JSON.stringify(runEnd);
  assert.throws(() => parseTrace(`${good}\n{not json`), /line 2 is not JSON/);
  assert.throws(() => parseTrace(JSON.stringify({ t: 1, type: "lunch" })), /unknown type "lunch"/);
  assert.throws(() => parseTrace(JSON.stringify({ t: 1, type: "constructor" })), /unknown type/);
  assert.throws(
    () => parseTrace(JSON.stringify({ ...runEnd, totals: {} })),
    /line 1 \(run_end\): "totals.promptTokens" should be number/,
  );
});

const runStart = {
  t: 0,
  type: "run_start",
  model: { id: "m" },
  start: "Guinness",
  target: "Albert Einstein",
  promptHash: "p",
  gitCommit: "c",
  gitDirty: false,
  limits: { maxContextChars: 330_000 },
};

test("a run_start from before strategies and variants is read as the full history and the fewest-hops prompt", () => {
  const [event] = parseTrace(JSON.stringify(runStart));
  assert.equal(event?.type === "run_start" && event.contextStrategy, "full");
  assert.equal(event?.type === "run_start" && event.promptVariant, "fewest-hops");
  const [masked] = parseTrace(JSON.stringify({ ...runStart, contextStrategy: "masked" }));
  assert.equal(masked?.type === "run_start" && masked.contextStrategy, "masked");
  assert.throws(() => parseTrace(JSON.stringify({ ...runStart, contextStrategy: 3 })), /"contextStrategy" should be string/);
});
