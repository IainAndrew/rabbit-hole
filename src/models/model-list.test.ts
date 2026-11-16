import assert from "node:assert/strict";
import { test } from "node:test";
import { parseModelList } from "./model-list.ts";

// A model as OpenRouter lists it, trimmed to the fields we read.
function listed(id: string, prompt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    context_length: 128_000,
    pricing: { prompt, completion: "0.000001" },
    supported_parameters: ["tools"],
    endpoints: ["/api/v1/chat/completions"],
    ...overrides,
  };
}

test("keeps tool-capable chat models, cheapest input first", () => {
  const models = parseModelList({
    data: [listed("lab/pricier", "0.000002"), listed("lab/cheaper", "0.0000001")],
  });
  assert.deepEqual(
    models.map((model) => model.id),
    ["lab/cheaper", "lab/pricier"],
  );
});

test("converts per-token price strings to dollars per million", () => {
  const [model] = parseModelList({
    data: [
      listed("lab/model", "0.00000002", {
        pricing: { prompt: "0.00000002", completion: "0.000000108", input_cache_read: "0.000000007" },
      }),
    ],
  });
  assert.ok(model);
  assert.ok(Math.abs(model.inputPrice - 0.02) < 1e-9);
  assert.ok(Math.abs(model.outputPrice - 0.108) < 1e-9);
  assert.ok(model.cachedInputPrice !== null && Math.abs(model.cachedInputPrice - 0.007) < 1e-9);
});

test("a model with no cache price has null, not zero", () => {
  const [model] = parseModelList({ data: [listed("lab/model", "0.000001")] });
  assert.equal(model?.cachedInputPrice, null);
});

test("drops models the race can't use", () => {
  const models = parseModelList({
    data: [
      listed("lab/no-tools", "0.000001", { supported_parameters: ["temperature"] }),
      listed("~lab/model-latest", "0.000001"),
      listed("lab/model:batch", "0.000001", { endpoints: ["/api/v1/batches"] }),
      listed("lab/model:free", "0"),
      listed("openrouter/auto", "-1"),
    ],
  });
  assert.deepEqual(models, []);
});

test("rejects a response that isn't a model list", () => {
  assert.throws(() => parseModelList({ models: [] }), /Unexpected OpenRouter model list/);
  assert.throws(
    () =>
      parseModelList({
        data: [listed("lab/model", "0.000001", { pricing: { prompt: "0.000001", completion: "n/a" } })],
      }),
    /Malformed price for lab\/model/,
  );
});
