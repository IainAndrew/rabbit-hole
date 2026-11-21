// Run one race, print each turn as it happens, and write a trace to runs/.
// Uses the build model unless --model names another from the registry, and
// sends the full history unless --context names another strategy. Billed.
// Usage: npm run race-agent -- "Start page" "Target page" [--model <id>] [--max-cost <dollars>] [--context full]

import { parseArgs } from "node:util";
import { promptHash, RACE_LIMITS, runAgent, SYSTEM_PROMPT, type CallModel } from "../agent/agent.ts";
import { CONTEXT_STRATEGIES, FULL_HISTORY } from "../agent/context.ts";
import { buildModel, models } from "../models/models.ts";
import { chat } from "../models/openrouter.ts";
import { hops } from "../race/race.ts";
import { toolDefinitions } from "../race/tools.ts";
import { gitState, openTrace } from "../agent/trace.ts";
import { snapshotLinks } from "../wikipedia/snapshot.ts";
import { fetchLinks } from "../wikipedia/wikipedia.ts";

const USAGE = 'Usage: npm run race-agent -- "Start page" "Target page" [--model <id>] [--max-cost <dollars>] [--context full]';

// A safety net for this script, not the eval's --max-cost. It's checked
// before each call, so the last call can go over by its own cost. Raise it
// with --max-cost for a model that costs more per race.
const DEFAULT_MAX_COST = 0.05;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    "max-cost": { type: "string" },
    context: { type: "string" },
  },
});
const [start, target] = positionals;
const model = values.model === undefined ? buildModel : models.find((candidate) => candidate.id === values.model);
const maxCost = values["max-cost"] === undefined ? DEFAULT_MAX_COST : Number(values["max-cost"]);
const contextName = values.context ?? FULL_HISTORY.name;
const context = CONTEXT_STRATEGIES.find((strategy) => strategy.name === contextName);
if (!start || !target) {
  fail(USAGE);
}
if (!model) {
  fail(`--model must be one of: ${models.map((m) => m.id).join(", ")}`);
}
if (!(maxCost > 0)) {
  fail("--max-cost must be a number of dollars above 0");
}
if (!context) {
  fail(`--context must be one of: ${CONTEXT_STRATEGIES.map((strategy) => strategy.name).join(", ")}`);
}

let spent = 0;
let turn = 0;
const startedAt = performance.now();

// The real model, wrapped to enforce the cap and print each turn.
const callModel: CallModel = async (messages) => {
  if (spent >= maxCost) {
    throw new Error(`Stopped: spent $${spent.toFixed(4)}, over the $${maxCost} cap`);
  }
  const result = await chat({ model, messages, tools: toolDefinitions, maxTokens: RACE_LIMITS.maxOutputTokens });
  const { usage } = result;
  spent += usage.cost ?? 0;
  turn++;

  const calls = result.toolCalls.map((call) => `${call.name}(${call.arguments})`).join(", ");
  console.log(`Turn ${turn} [${result.provider ?? "?"}] ${calls || `no tool call: ${result.content ?? ""}`}`);
  console.log(
    `  ${usage.promptTokens} in (${usage.cachedTokens ?? "?"} cached), ${usage.completionTokens} out` +
      ` | $${(usage.cost ?? 0).toFixed(6)}, total $${spent.toFixed(6)}`,
  );
  return result;
};

const trace = openTrace("runs", `${model.id} ${context.name} ${start} ${target}`);
trace.record({
  type: "run_start",
  model,
  start,
  target,
  systemPrompt: SYSTEM_PROMPT,
  promptHash: promptHash(),
  ...gitState(),
  limits: RACE_LIMITS,
  contextStrategy: context.name,
});

console.log(`${model.id} on ${model.provider}, context ${context.name}: "${start}" → "${target}", cap $${maxCost}\n`);
const result = await runAgent({
  start,
  target,
  callModel,
  getLinks: snapshotLinks("snapshot", fetchLinks),
  context,
  maxTurns: RACE_LIMITS.maxTurns,
  maxContextChars: RACE_LIMITS.maxContextChars,
  record: trace.record,
});

console.log();
const { end } = result;
const ending = end.kind === "finished" ? end.reason : `crashed (${end.cause}): ${end.error}`;
console.log(`End:   ${ending} after ${result.turns} turns, ${hops(result.race)} hops`);
console.log(`Path:  ${result.race.path.join(" > ")}`);
console.log(`Cost:  $${spent.toFixed(6)}`);
console.log(`Time:  ${((performance.now() - startedAt) / 1000).toFixed(1)} s`);
console.log(`Trace: ${trace.path}`);

/** Print why the arguments were refused, and stop. */
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
