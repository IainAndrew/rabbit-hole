// The agent loop: call the model, run the tools it asks for, append the
// results, repeat. The growing `messages` array is the agent's only memory.

import { OpenRouterError, type AssistantMessage, type ChatResult, type Message } from "./openrouter.ts";
import { startRace, type LinkSource, type Race } from "./race.ts";
import { executeTool } from "./tools.ts";

// Passed in rather than imported, so tests can script the model's replies.
export type CallModel = (messages: Message[]) => Promise<ChatResult>;

// How a race ended. Each one says something about the agent.
export type EndReason =
  | "won"
  | "gave_up"
  | "turn_limit"
  // A call's prompt grew past maxPromptTokens.
  | "token_limit"
  // A reply was cut off at the output cap, so its tool calls can't be trusted.
  | "output_limit"
  // A reply with no tool call, or one the provider's filter blocked.
  | "refused";

// Why a run couldn't finish. These say nothing about the agent, so they are
// kept out of success rates.
export type CrashCause = "no_credits" | "retries_exhausted" | "api_error";

export type RunEnd =
  | { kind: "finished"; reason: EndReason }
  | { kind: "crashed"; cause: CrashCause; error: string };

export type RunResult = {
  race: Race;
  end: RunEnd;
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
  maxPromptTokens: number;
};

export async function runAgent(options: RunOptions): Promise<RunResult> {
  let race = await startRace(options.start, options.target, options.getLinks);
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `You are on "${race.start}". The target is "${race.target}".` },
  ];
  const finished = (reason: EndReason, turns: number): RunResult => ({
    race,
    end: { kind: "finished", reason },
    turns,
    messages,
  });

  for (let turn = 1; turn <= options.maxTurns; turn++) {
    let reply: ChatResult;
    try {
      reply = await options.callModel(messages);
    } catch (err) {
      // Only API failures are crashes. Anything else is a bug: let it throw.
      if (!(err instanceof OpenRouterError)) throw err;
      return { race, end: { kind: "crashed", cause: crashCause(err), error: err.message }, turns: turn - 1, messages };
    }
    messages.push(assistantMessage(reply));

    if (reply.finishReason === "length") return finished("output_limit", turn);
    if (reply.finishReason === "content_filter" || reply.toolCalls.length === 0) {
      return finished("refused", turn);
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

    if (end !== null) return finished(end, turn);
    // Checked after the turn's tools run, so a winning move still counts. The
    // next prompt would be bigger still.
    if (reply.usage.promptTokens > options.maxPromptTokens) return finished("token_limit", turn);
  }

  return finished("turn_limit", options.maxTurns);
}

function crashCause(err: OpenRouterError): CrashCause {
  if (err.status === 402) return "no_credits";
  // fetchWithRetry has already retried these.
  if (err.status === 429 || (err.status !== null && err.status >= 500)) return "retries_exhausted";
  return "api_error";
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
