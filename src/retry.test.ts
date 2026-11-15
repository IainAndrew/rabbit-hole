import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry, type RetryOptions } from "./retry.ts";

// Hands out the given responses in order and records every wait.
function fakeServer(...responses: Response[]) {
  let calls = 0;
  const waits: number[] = [];
  const request = async () => {
    const response = responses[calls++];
    if (!response) throw new Error("Server asked for more responses than given");
    return response;
  };
  const options: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    sleep: async (ms) => {
      waits.push(ms);
    },
  };
  return { request, options, waits, calls: () => calls };
}

const ok = () => new Response("ok", { status: 200 });
const tooMany = (headers?: Record<string, string>) =>
  new Response("slow down", { status: 429, ...(headers ? { headers } : {}) });

test("returns a successful response without retrying", async () => {
  const server = fakeServer(ok());
  const response = await fetchWithRetry(server.request, server.options);
  assert.equal(response.status, 200);
  assert.equal(server.calls(), 1);
  assert.deepEqual(server.waits, []);
});

test("retries a 429 with doubling backoff", async () => {
  const server = fakeServer(tooMany(), tooMany(), ok());
  const response = await fetchWithRetry(server.request, server.options);
  assert.equal(response.status, 200);
  assert.deepEqual(server.waits, [100, 200]);
});

test("waits as long as Retry-After says, capped", async () => {
  const server = fakeServer(tooMany({ "Retry-After": "2" }), tooMany({ "Retry-After": "600" }), ok());
  await fetchWithRetry(server.request, server.options);
  assert.deepEqual(server.waits, [2000, 5000]);
});

test("gives up after maxAttempts and returns the last response", async () => {
  const server = fakeServer(tooMany(), tooMany(), tooMany());
  const response = await fetchWithRetry(server.request, server.options);
  assert.equal(response.status, 429);
  assert.equal(server.calls(), 3);
});

test("does not retry a client error like 404", async () => {
  const server = fakeServer(new Response("missing", { status: 404 }));
  const response = await fetchWithRetry(server.request, server.options);
  assert.equal(response.status, 404);
  assert.equal(server.calls(), 1);
});
