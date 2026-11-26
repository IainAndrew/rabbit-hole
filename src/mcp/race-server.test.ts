import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryTransport, LATEST_PROTOCOL_VERSION, type JSONRPCMessage } from "@modelcontextprotocol/server";
import { createRaceServer } from "./race-server.ts";
import { toolDefinitions } from "../race/tools.ts";
import { fakeLinks } from "../wikipedia/fake-wikipedia.ts";

/**
 * Connect a race server to an in-memory pipe and talk to it in raw JSON-RPC,
 * as a host would, so the tests cover the protocol and not just the handlers.
 */
async function connect() {
  const [hostSide, serverSide] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (message: JSONRPCMessage) => void>();
  hostSide.onmessage = (message) => {
    if ("id" in message && typeof message.id === "number") {
      waiting.get(message.id)?.(message);
    }
  };
  await createRaceServer(fakeLinks).connect(serverSide);
  await hostSide.start();

  let nextId = 1;
  /** Send a request and wait for its result. A test trusts the result's shape. */
  const request = async <Result>(method: string, params: Record<string, unknown>): Promise<Result> => {
    const id = nextId++;
    const reply = new Promise<JSONRPCMessage>((resolve) => waiting.set(id, resolve));
    await hostSide.send({ jsonrpc: "2.0", id, method, params });
    return ((await reply) as unknown as { result: Result }).result;
  };

  const init = await request<{ instructions: string }>("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "test-host", version: "0" },
  });
  await hostSide.send({ jsonrpc: "2.0", method: "notifications/initialized" });

  /** Call a tool and return its text and whether it was an error. */
  const callTool = async (name: string, args: Record<string, unknown>) => {
    const reply = await request<{ content: { text: string }[]; isError?: boolean }>("tools/call", {
      name,
      arguments: args,
    });
    return { text: reply.content[0]!.text, isError: reply.isError === true };
  };
  return { init, request, callTool };
}

test("the server offers start_race and the eval tools, described as in the evals", async () => {
  const { request } = await connect();
  const { tools } = await request<{ tools: { name: string; description: string; inputSchema: unknown }[] }>(
    "tools/list",
    {},
  );
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["start_race", "get_links", "move_to", "give_up"],
  );
  for (const { function: evalTool } of toolDefinitions) {
    const served = tools.find((tool) => tool.name === evalTool.name);
    assert.equal(served?.description, evalTool.description);
    assert.deepEqual(served?.inputSchema, evalTool.parameters);
  }
});

test("only get_links is marked read-only", async () => {
  const { request } = await connect();
  const { tools } = await request<{ tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] }>(
    "tools/list",
    {},
  );
  const readOnly = tools.filter((tool) => tool.annotations?.readOnlyHint === true).map((tool) => tool.name);
  assert.deepEqual(readOnly, ["get_links"]);
});

test("the server's instructions say how the race is scored", async () => {
  const { init } = await connect();
  assert.match(init.instructions, /Reaching the target is what counts/);
});

test("a race can be played to a win, and then it's over", async () => {
  const { callTool } = await connect();
  assert.deepEqual(await callTool("start_race", { start: "Guinness", target: "Einstein" }), {
    text: 'Race started. You are on "Guinness". The target is "Albert Einstein".',
    isError: false,
  });
  assert.equal((await callTool("move_to", { page: "Republic of Ireland" })).isError, false);
  const won = await callTool("move_to", { page: "Einstein" });
  assert.match(won.text, /you won/);
  assert.equal((await callTool("get_links", { page: "Guinness" })).isError, true);
});

test("mistakes come back as tool errors, not protocol errors", async () => {
  const { callTool } = await connect();
  assert.match((await callTool("move_to", { page: "Stout" })).text, /no race in progress/);
  assert.match((await callTool("start_race", { start: "Nowhere", target: "Guinness" })).text, /no page called/);

  await callTool("start_race", { start: "Guinness", target: "Albert Einstein" });
  const illegal = await callTool("move_to", { page: "Physics" });
  assert.equal(illegal.isError, true);
  assert.match(illegal.text, /not a link on "Guinness"/);
});

test("calls sent together run one at a time, in the order sent", async () => {
  const { callTool } = await connect();
  const [, first, second] = await Promise.all([
    callTool("start_race", { start: "Guinness", target: "Albert Einstein" }),
    callTool("move_to", { page: "Republic of Ireland" }),
    callTool("move_to", { page: "Guinness" }),
  ]);
  assert.match(first.text, /Hops: 1/);
  assert.match(second.text, /Hops: 2/);
});

test("giving up ends the race", async () => {
  const { callTool } = await connect();
  await callTool("start_race", { start: "Guinness", target: "Albert Einstein" });
  assert.equal((await callTool("give_up", { reason: "lost" })).text, "Gave up after 0 hops.");
  assert.equal((await callTool("move_to", { page: "Stout" })).isError, true);
});
