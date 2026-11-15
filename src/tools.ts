// The tools the model can call, and the code that runs them.
//
// Every outcome, including a mistake, comes back as text for the model to
// read. Only failures the model didn't cause (network errors) are thrown.

import { currentPage, hops, move, type LinkSource, type Race } from "./race.ts";
import { PageNotFoundError } from "./wikipedia.ts";

// In the OpenAI-compatible format OpenRouter accepts. The descriptions are
// part of the prompt: they're all the model knows about each tool.
export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "get_links",
      description:
        "List the article links on any Wikipedia page. Free: it doesn't move you or count as a hop.",
      parameters: {
        type: "object",
        properties: { page: { type: "string", description: "Exact Wikipedia page title" } },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_to",
      description:
        "Follow a link from your current page to another page. Counts as one hop. Only links on your current page are allowed.",
      parameters: {
        type: "object",
        properties: { page: { type: "string", description: "A link on your current page" } },
        required: ["page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "give_up",
      description: "Stop the race without reaching the target.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string", description: "Why you're giving up" } },
        required: ["reason"],
      },
    },
  },
] as const;

// A tool call as the model sends it: arguments arrive as a JSON string.
export type ToolCall = { name: string; arguments: string };

export type ToolOutcome = {
  // What the model sees.
  content: string;
  // "error" means the model made a mistake it can recover from.
  status: "ok" | "error";
  race: Race;
  // Set when this call ends the race.
  end: "won" | "gave_up" | null;
};

export async function executeTool(call: ToolCall, race: Race, getLinks: LinkSource): Promise<ToolOutcome> {
  const success = (content: string, extra: { end?: ToolOutcome["end"]; race?: Race } = {}): ToolOutcome => ({
    content,
    status: "ok",
    race: extra.race ?? race,
    end: extra.end ?? null,
  });
  const mistake = (content: string): ToolOutcome => ({
    content: `Error: ${content}`,
    status: "error",
    race,
    end: null,
  });

  const args = parseArguments(call.arguments);
  if (args === null) return mistake("arguments must be a JSON object.");

  switch (call.name) {
    case "get_links": {
      const page = stringArg(args, "page");
      if (page === null) return mistake('get_links needs a "page" string.');
      try {
        const result = await getLinks(page);
        return success(`Links on "${result.title}" (${result.links.length}):\n${result.links.join("\n")}`);
      } catch (err) {
        if (err instanceof PageNotFoundError) return mistake(err.message);
        throw err;
      }
    }

    case "move_to": {
      const page = stringArg(args, "page");
      if (page === null) return mistake('move_to needs a "page" string.');
      const result = await move(race, page, getLinks);
      if (!result.ok) {
        const here = currentPage(race);
        return result.reason === "not_a_link"
          ? mistake(`"${page}" is not a link on "${here}". Use get_links on "${here}" to see its links.`)
          : mistake("the race is already over.");
      }
      const where = `Moved to "${currentPage(result.race)}". Hops: ${hops(result.race)}.`;
      return result.won
        ? success(`${where} That's the target: you won.`, { end: "won", race: result.race })
        : success(`${where} Target: "${race.target}".`, { race: result.race });
    }

    case "give_up": {
      const reason = stringArg(args, "reason");
      if (reason === null) return mistake('give_up needs a "reason" string.');
      return success(`Gave up after ${hops(race)} hops.`, { end: "gave_up" });
    }

    default:
      return mistake(`there is no tool called "${call.name}". Use get_links, move_to or give_up.`);
  }
}

// Model output is outside data: it may not be JSON, or not an object.
function parseArguments(json: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
