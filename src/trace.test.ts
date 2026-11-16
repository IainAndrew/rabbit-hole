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
