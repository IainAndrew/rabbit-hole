// Print OpenRouter's tool-capable models, cheapest input first, and check the
// registry against the live list. Free: no key, no model calls.
// Usage: npm run list-models

import { fetchModelList } from "../models/model-list.ts";
import { models } from "../models/models.ts";

const listed = await fetchModelList();

console.log("$ per million tokens: input / cached input / output, then context size\n");
for (const model of listed) {
  const cached = model.cachedInputPrice === null ? "-" : price(model.cachedInputPrice);
  const prices = `${price(model.inputPrice)} / ${cached} / ${price(model.outputPrice)}`;
  const context = `${Math.round(model.contextLength / 1000)}k`;
  console.log(`${model.id.padEnd(50)} ${prices.padEnd(26)} ${context}`);
}
console.log(`\n${listed.length} models`);

// A registry model can be retired or lose tool support upstream; say so now
// rather than when a race fails.
console.log("\nRegistry:");
for (const model of models) {
  const live = listed.find((candidate) => candidate.id === model.id);
  if (!live) {
    console.log(`  ${model.id}: MISSING from the live list (retired, or no longer supports tools)`);
  } else if (live.contextLength !== model.contextLength) {
    console.log(`  ${model.id}: context is ${live.contextLength} live, ${model.contextLength} in registry`);
  } else {
    console.log(`  ${model.id}: ok`);
  }
}

function price(dollars: number): string {
  return `$${dollars.toFixed(3)}`;
}
