// Send a race's opening message to the build model once and print what comes
// back. No tools are run: this shows the raw reply. Billed.
// Usage: npm run call -- "Start page" "Target page"

import { buildModel } from "./models.ts";
import { chat } from "./openrouter.ts";
import { toolDefinitions } from "./tools.ts";

// One reply, reasoning included. At this model's output price that caps the
// call at about $0.0002.
const MAX_TOKENS = 2000;

const [start, target] = process.argv.slice(2);
if (!start || !target) {
  console.error('Usage: npm run call -- "Start page" "Target page"');
  process.exit(1);
}

const result = await chat({
  model: buildModel,
  messages: [
    {
      role: "user",
      content: `You're on the Wikipedia page "${start}". Reach "${target}" by following links, in as few hops as possible.`,
    },
  ],
  tools: toolDefinitions,
  maxTokens: MAX_TOKENS,
});

console.log(`Model:    ${buildModel.id} (reasoning: ${buildModel.reasoning})`);
console.log(`Provider: ${result.provider ?? "unknown"}`);
console.log(`Finish:   ${result.finishReason ?? "unknown"}`);
console.log();

if (result.reasoning) {
  console.log(`Reasoning:\n${result.reasoning}\n`);
}
if (result.content) {
  console.log(`Text:\n${result.content}\n`);
}
for (const call of result.toolCalls) {
  // Printed raw: the arguments are a JSON string the model wrote.
  console.log(`Tool call ${call.id}: ${call.name}(${call.arguments})`);
}
if (result.toolCalls.length === 0) {
  console.log("No tool calls.");
}

const { usage } = result;
console.log();
console.log(
  `Tokens:   ${usage.promptTokens} in (${usage.cachedTokens ?? "?"} cached), ` +
    `${usage.completionTokens} out (${usage.reasoningTokens ?? "?"} reasoning)`,
);
console.log(`Cost:     ${usage.cost === null ? "not reported" : `$${usage.cost.toFixed(6)}`}`);
console.log(`Time:     ${Math.round(result.durationMs)} ms`);
