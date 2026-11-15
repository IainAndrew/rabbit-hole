// The agent loop: call the model, run the tools it asks for, append the
// results, repeat. The growing `messages` array is the agent's only memory.

import type { AssistantMessage, ChatResult, Message } from "./openrouter.ts";
import { startRace, type LinkSource, type Race } from "./race.ts";
import { executeTool } from "./tools.ts";

// Passed in rather than imported, so tests can script the model's replies.
export type CallModel = (messages: Message[]) => Promise<ChatResult>;

// Step 4 adds the rest: token limit, output limit, refused.
export type EndReason = "won" | "gave_up" | "no_tool_call" | "turn_limit";

export type RunResult = {
  race: Race;
  end: EndReason;
  // Model calls made.
  turns: number;
  messages: Message[];
};

const SYSTEM_PROMPT = `You are playing a Wikipedia race. You start on one Wikipedia page and must reach the target page by following links, in as few hops as possible.`;

export type RunOptions = {
  start: string;
  target: string;
  callModel: CallModel;
  getLinks: LinkSource;
  maxTurns: number;
};

export async function runAgent(options: RunOptions): Promise<RunResult> {
  let race = await startRace(options.start, options.target, options.getLinks);
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `You are on "${race.start}". The target is "${race.target}".` },
  ];

  for (let turn = 1; turn <= options.maxTurns; turn++) {
    const reply = await options.callModel(messages);
    messages.push(assistantMessage(reply));

    if (reply.toolCalls.length === 0) {
      return { race, end: "no_tool_call", turns: turn, messages };
    }

    let end: "won" | "gave_up" | null = null;
    for (const call of reply.toolCalls) {
      // Every call must get a result, even ones after the race ended, or the
      // next request is rejected. Those aren't run, so they can't change it.
      let content = "Not run: the race is already over.";
      if (end === null) {
        const outcome = await executeTool(call, race, options.getLinks);
        race = outcome.race;
        end = outcome.end;
        content = outcome.content;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }

    if (end !== null) {
      return { race, end, turns: turn, messages };
    }
  }

  return { race, end: "turn_limit", turns: options.maxTurns, messages };
}

// The model's reply goes back into the conversation exactly as it asked,
// including reasoning, so the next turn sees its own earlier thinking.
function assistantMessage(reply: ChatResult): AssistantMessage {
  return {
    role: "assistant",
    content: reply.content,
    ...(reply.toolCalls.length > 0 && {
      tool_calls: reply.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    }),
    ...(reply.reasoningDetails !== null && { reasoning_details: reply.reasoningDetails }),
  };
}
