// The race as an MCP server: the same tools and rules the evals use, for any
// MCP host (Claude Code, Claude Desktop) to play. The host runs the agent loop
// and owns the context; this server only holds the race.

import { fromJsonSchema, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { SCORING_RULE } from "../agent/prompt.ts";
import { startRace, type LinkSource, type Race } from "../race/race.ts";
import { executeTool, toolDefinitions } from "../race/tools.ts";
import { PageNotFoundError } from "../wikipedia/wikipedia.ts";

/** start_race exists only here: in the evals, the harness sets the race up. */
const START_RACE_SCHEMA = {
  type: "object",
  properties: {
    start: { type: "string", description: "Exact Wikipedia page title to start on" },
    target: { type: "string", description: "Exact Wikipedia page title to reach" },
  },
  required: ["start", "target"],
} as const;

/**
 * An MCP server holding one race at a time. Starting a race replaces the one
 * before; a race that ends (won or given up) is cleared.
 *
 * @param getLinks Where links come from: the snapshot when run, a fake in tests.
 */
export function createRaceServer(getLinks: LinkSource): McpServer {
  // The host sees these at connection, the nearest thing MCP has to a system
  // prompt. It's the prompt that worked best in the evals.
  const server = new McpServer({ name: "rabbit-hole", version: "0.1.0" }, { instructions: SCORING_RULE.system });
  let race: Race | null = null;

  // The SDK handles requests as they arrive, so calls a host sends together
  // would overlap and two moves could both start from the same page. Queue
  // them instead: each call runs once the one before has finished, as in the
  // evals.
  let queue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work);
    // A call that throws fails alone; the calls after it still run.
    queue = next.catch(() => undefined);
    return next;
  };

  server.registerTool(
    "start_race",
    {
      description: "Start a Wikipedia race from one page to another. Replaces any race in progress.",
      inputSchema: fromJsonSchema<{ start: string; target: string }>(START_RACE_SCHEMA),
    },
    ({ start, target }) =>
      oneAtATime(async () => {
        try {
          race = await startRace(start, target, getLinks);
        } catch (err) {
          if (err instanceof PageNotFoundError) {
            return result(`Error: ${err.message}`, true);
          }
          throw err;
        }
        return result(`Race started. You are on "${race.start}". The target is "${race.target}".`, false);
      }),
  );

  // The other tools are the eval tools, with the same names, descriptions and
  // checks, so a host plays exactly the game the models were scored on.
  for (const { function: tool } of toolDefinitions) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: fromJsonSchema(tool.parameters) },
      (args) =>
        oneAtATime(async () => {
          if (race === null) {
            return result("Error: no race in progress. Start one with start_race.", true);
          }
          // executeTool takes arguments as the JSON a model writes, and checks them itself.
          const call = { name: tool.name, arguments: JSON.stringify(args) };
          const outcome = await executeTool(call, race, getLinks);
          race = outcome.end === null ? outcome.race : null;
          return result(outcome.content, outcome.status === "error");
        }),
    );
  }

  return server;
}

/** A tool result. `isError` tells the host the call was a mistake the model can recover from. */
function result(text: string, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}
