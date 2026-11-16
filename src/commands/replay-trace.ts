// Replay a run from its trace, turn by turn, with running totals. Reads the
// file only: no network, no model, free. If the replay needs something the
// trace doesn't have, the trace is missing data.
// Usage: npm run replay-trace -- runs/<file>.jsonl

import { readFileSync } from "node:fs";
import { parseTrace, type TraceLine } from "../race/trace.ts";

// Link lists run to hundreds of lines; show the start of each.
const RESULT_LINES = 4;
const BAR_WIDTH = 30;

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run replay-trace -- runs/<file>.jsonl");
  process.exit(1);
}

const [first, ...events] = parseTrace(readFileSync(file, "utf8"));
if (first?.type !== "run_start") {
  throw new Error(`${file} doesn't begin with run_start`);
}

const { model, limits } = first;
console.log(`"${first.start}" → "${first.target}"`);
console.log(`${model.id} (reasoning: ${model.reasoning}) | prompt ${first.promptHash}`);
console.log(`commit ${first.gitCommit.slice(0, 7)}${first.gitDirty ? " with uncommitted changes" : ""}`);
console.log(`limits: ${limits.maxTurns} turns, ${limits.maxPromptTokens.toLocaleString()} prompt tokens, ${limits.maxOutputTokens} output tokens`);

// Null once any call's cost is unknown: a partial sum would read as a total.
let cost: number | null = 0;
let hops = 0;
let ended = false;

for (const event of events) {
  print(event);
}
if (!ended) {
  console.log("\nThe trace stops without a run_end: the run was killed before it finished.");
}

function print(event: TraceLine): void {
  switch (event.type) {
    case "model_call": {
      const { usage } = event;
      cost = cost === null || usage.cost === null ? null : cost + usage.cost;
      console.log(`\n── Turn ${event.turn} ── ${seconds(event.t)} ── ${event.provider ?? "unknown provider"}`);
      if (event.reasoning) console.log(indent(event.reasoning, "  thinks: "));
      if (event.content) console.log(indent(event.content, "  says:   "));
      console.log(
        `  context ${bar(usage.promptTokens, limits.maxPromptTokens)} ${usage.promptTokens.toLocaleString()} tokens` +
          ` (${usage.cachedTokens ?? "?"} cached), ${usage.completionTokens} out`,
      );
      console.log(`  ${money(usage.cost)} this turn, ${money(cost)} so far, ${event.durationMs} ms`);
      return;
    }
    case "tool_call": {
      console.log(`  → ${event.name}(${event.arguments})${event.status === "ok" ? "" : ` [${event.status}]`}`);
      console.log(indent(trim(event.result), "    "));
      // Counted from moves, not page changes: a page that links to itself is
      // still a hop.
      if (event.name === "move_to" && event.status === "ok") {
        hops++;
        console.log(`    Now on "${event.pageAfter}" (${hops} ${hops === 1 ? "hop" : "hops"})`);
      }
      return;
    }
    case "run_end": {
      ended = true;
      const { end, totals } = event;
      console.log(`\n${end.kind === "finished" ? end.reason : `crashed (${end.cause}): ${end.error}`}`);
      console.log(`Path:   ${event.path.join(" > ")}`);
      console.log(`Turns:  ${event.turns}, hops: ${event.hops}`);
      console.log(
        `Tokens: ${totals.promptTokens.toLocaleString()} in (${totals.cachedTokens.toLocaleString()} cached), ` +
          `${totals.completionTokens.toLocaleString()} out (${totals.reasoningTokens.toLocaleString()} reasoning)`,
      );
      console.log(`Cost:   ${money(totals.cost)}`);
      console.log(`Time:   ${seconds(event.t)}`);
      return;
    }
    case "run_start":
      throw new Error("A second run_start: this file holds more than one run");
  }
}

// How full the context is, against the token limit.
function bar(tokens: number, limit: number): string {
  const filled = Math.min(BAR_WIDTH, Math.round((tokens / limit) * BAR_WIDTH));
  return `[${"█".repeat(filled)}${"·".repeat(BAR_WIDTH - filled)}]`;
}

function trim(result: string): string {
  const lines = result.split("\n");
  if (lines.length <= RESULT_LINES + 1) return result;
  const shown = lines.slice(0, RESULT_LINES + 1).join("\n");
  return `${shown}\n…and ${lines.length - RESULT_LINES - 1} more`;
}

function indent(text: string, prefix: string): string {
  const pad = " ".repeat(prefix.length);
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? prefix : pad) + line)
    .join("\n");
}

function money(dollars: number | null): string {
  return dollars === null ? "cost unknown" : `$${dollars.toFixed(6)}`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
