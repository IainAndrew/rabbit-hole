import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEndpoints } from "./endpoints.ts";

// An endpoint as OpenRouter lists it, trimmed to the fields we read.
function endpoint(tag: string, prompt: string, extra: Record<string, unknown> = {}) {
  return {
    tag,
    service_tier: null,
    quantization: "fp8",
    uptime_last_1d: 99.5,
    supports_implicit_caching: true,
    supported_parameters: ["tools", "reasoning"],
    pricing: { prompt, completion: "0.0000005", input_cache_read: "0.000000005" },
    ...extra,
  };
}

test("parses endpoints cheapest input first, with prices per million", () => {
  const endpoints = parseEndpoints({
    data: { endpoints: [endpoint("pricey/fp8", "0.0000003"), endpoint("cheap/fp8", "0.00000006")] },
  });
  assert.deepEqual(
    endpoints.map((e) => e.tag),
    ["cheap/fp8", "pricey/fp8"],
  );
  const [cheap] = endpoints;
  assert.ok(Math.abs(cheap!.inputPrice - 0.06) < 1e-9);
  assert.ok(Math.abs(cheap!.cachedInputPrice! - 0.005) < 1e-9);
  assert.equal(cheap!.cacheWritePrice, null);
  assert.equal(cheap!.implicitCaching, true);
  assert.equal(cheap!.supportsTools, true);
});

test("reads a tier, a cache write price and a long-prompt price", () => {
  const [e] = parseEndpoints({
    data: {
      endpoints: [
        endpoint("lab/flex", "0.0000001", {
          service_tier: "flex",
          supports_implicit_caching: false,
          pricing: {
            prompt: "0.0000001",
            completion: "0.0000005",
            input_cache_write: "0.000000125",
            overrides: [{ min_prompt_tokens: 100_000, prompt: "0.0000005" }],
          },
        }),
      ],
    },
  });
  assert.equal(e!.tier, "flex");
  assert.equal(e!.cachedInputPrice, null);
  assert.ok(Math.abs(e!.cacheWritePrice! - 0.125) < 1e-9);
  assert.equal(e!.longPrompt!.minTokens, 100_000);
  assert.ok(Math.abs(e!.longPrompt!.inputPrice - 0.5) < 1e-9);
});

test("notices peak and off-peak pricing, and refuses an unknown override", () => {
  const timed = endpoint("lab", "0.0000001", {
    pricing: { prompt: "0.0000001", completion: "0.0000005", overrides: [{ utc_start: 0, utc_end: 1400, prompt: "0.0000002" }] },
  });
  assert.equal(parseEndpoints({ data: { endpoints: [timed] } })[0]!.pricedByTime, true);

  const odd = endpoint("lab", "0.0000001", {
    pricing: { prompt: "0.0000001", completion: "0.0000005", overrides: [{ moon_phase: "full" }] },
  });
  assert.throws(() => parseEndpoints({ data: { endpoints: [odd] } }), /Unknown kind of price override/);
});

test("an endpoint with no recent traffic has a null uptime, not a crash", () => {
  const [e] = parseEndpoints({ data: { endpoints: [endpoint("quiet", "0.0000001", { uptime_last_1d: null })] } });
  assert.equal(e!.uptime, null);
});

test("rejects a response that isn't an endpoint list", () => {
  assert.throws(() => parseEndpoints({ data: [] }), /Unexpected/);
  assert.throws(() => parseEndpoints({ data: { endpoints: [{ tag: "x" }] } }), /Malformed endpoint/);
});
