import assert from "node:assert/strict";
import { test } from "node:test";
import { models } from "./models.ts";
import { requestBody } from "./openrouter.ts";

const request = (id: string) => {
  const model = models.find((candidate) => candidate.id === id)!;
  return { model, messages: [{ role: "user" as const, content: "Race." }], tools: [], maxTokens: 2000 };
};

test("a model that caches only when asked gets a cache_control field", () => {
  const body = requestBody(request("anthropic/claude-haiku-5.5"));
  assert.deepEqual(body.cache_control, { type: "ephemeral" });
});

test("a model that caches by itself gets no cache_control field", () => {
  const body = requestBody(request("deepseek/deepseek-v4.1-flash-1017"));
  assert.equal("cache_control" in body, false);
});

test("every call is pinned to the model's endpoint, with no fallback", () => {
  const body = requestBody(request("deepseek/deepseek-v4.1-flash-1017"));
  assert.deepEqual(body.provider, { order: ["morph/fp8"], allow_fallbacks: false, require_parameters: true });
});
