// Print every provider endpoint for one model, so choosing a provider follows
// the rule in models.ts from facts rather than memory. Free: no key, no model calls.
// Usage: npm run model-endpoints -- <model id>

import { fetchEndpoints, type Endpoint } from "../models/endpoints.ts";
import { models } from "../models/models.ts";

const [modelId] = process.argv.slice(2);
if (!modelId) {
  console.error("Usage: npm run model-endpoints -- <model id>");
  process.exit(1);
}

const endpoints = await fetchEndpoints(modelId);
const pin = models.find((model) => model.id === modelId)?.provider ?? null;
const pinned = endpoints.filter((endpoint) => pin !== null && matchesPin(endpoint, pin));

console.log(`${modelId}: ${endpoints.length} endpoints, cheapest input first. $ per million tokens.`);
if (pin !== null) {
  console.log(`* = matches the registry's provider pin "${pin}".`);
}
console.log();
console.log(
  `${"endpoint".padEnd(28)}${"tier".padEnd(10)}${"precision".padEnd(10)}` +
    `${"input".padEnd(8)}${"cached".padEnd(8)}${"write".padEnd(8)}${"output".padEnd(8)}` +
    `${"uptime".padEnd(8)}${"caching".padEnd(10)}${"tools".padEnd(7)}price varies`,
);
for (const endpoint of endpoints) {
  console.log(row(endpoint, pinned.includes(endpoint)));
}

if (pinned.length > 1) {
  const tags = pinned.map((endpoint) => endpoint.tag).join(", ");
  console.log(`\nThe pin "${pin}" matches ${pinned.length} endpoints (${tags}); OpenRouter may route to any of them.`);
}
// OpenRouter's API doesn't publish whether a provider trains on or keeps
// prompts; the account's privacy settings filter endpoints at call time.
console.log("\nData policy isn't in OpenRouter's API: check https://openrouter.ai/settings/privacy.");

/** A request's provider order names a slug ("morph") or a full tag ("morph/fp8"). */
function matchesPin(endpoint: Endpoint, pin: string): boolean {
  return endpoint.tag === pin || endpoint.tag.startsWith(`${pin}/`);
}

/** One endpoint as a table row. */
function row(endpoint: Endpoint, isPinned: boolean): string {
  const name = `${endpoint.tag}${isPinned ? " *" : ""}`;
  const caching = endpoint.implicitCaching ? "implicit" : "-";
  const varies = [
    endpoint.longPrompt === null
      ? null
      : `input ${price(endpoint.longPrompt.inputPrice)} over ${endpoint.longPrompt.minTokens / 1000}k`,
    endpoint.pricedByTime ? "by time of day" : null,
  ].filter((part) => part !== null);
  return (
    name.padEnd(28) +
    (endpoint.tier ?? "-").padEnd(10) +
    endpoint.precision.padEnd(10) +
    price(endpoint.inputPrice).padEnd(8) +
    price(endpoint.cachedInputPrice).padEnd(8) +
    price(endpoint.cacheWritePrice).padEnd(8) +
    price(endpoint.outputPrice).padEnd(8) +
    `${endpoint.uptime.toFixed(1)}%`.padEnd(8) +
    caching.padEnd(10) +
    (endpoint.supportsTools ? "yes" : "no").padEnd(7) +
    (varies.join(", ") || "-")
  );
}

/** Dollars per million tokens to 3 places, or "-" when not listed. */
function price(dollars: number | null): string {
  return dollars === null ? "-" : `$${dollars.toFixed(3)}`;
}
