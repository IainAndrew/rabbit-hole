// Run one race with the build model, print each turn as it happens, and write
// a trace to runs/. Billed.
// Usage: npm run race-agent -- "Start page" "Target page"

import { promptHash, RACE_LIMITS, runAgent, SYSTEM_PROMPT, type CallModel } from "../agent/agent.ts";
import { buildModel } from "../models/models.ts";
import { chat } from "../models/openrouter.ts";
import { hops } from "../race/race.ts";
import { toolDefinitions } from "../race/tools.ts";
import { gitState, openTrace } from "../agent/trace.ts";
import { snapshotLinks } from "../wikipedia/snapshot.ts";
import { fetchLinks } from "../wikipedia/wikipedia.ts";

// A safety net for this script, not the eval's --max-cost. It's checked
// before each call, so the last call can go over by its own cost.
const MAX_COST = 0.05;

const [start, target] = process.argv.slice(2);
if (!start || !target) {
  console.error('Usage: npm run race-agent -- "Start page" "Target page"');
  process.exit(1);
}

let spent = 0;
let turn = 0;
const startedAt = performance.now();

// The real model, wrapped to enforce the cap and print each turn.
const callModel: CallModel = async (messages) => {
  if (spent >= MAX_COST) {
    throw new Error(`Stopped: spent $${spent.toFixed(4)}, over the $${MAX_COST} cap`);
  }
  const result = await chat({ model: buildModel, messages, tools: toolDefinitions, maxTokens: RACE_LIMITS.maxOutputTokens });
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

const trace = openTrace("runs", `${buildModel.id} ${start} ${target}`);
trace.record({
  type: "run_start",
  model: buildModel,
  start,
  target,
  systemPrompt: SYSTEM_PROMPT,
  promptHash: promptHash(),
  ...gitState(),
  limits: RACE_LIMITS,
});

console.log(`${buildModel.id}: "${start}" → "${target}"\n`);
const result = await runAgent({
  start,
  target,
  callModel,
  getLinks: snapshotLinks("snapshot", fetchLinks),
  maxTurns: RACE_LIMITS.maxTurns,
  maxPromptTokens: RACE_LIMITS.maxPromptTokens,
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
