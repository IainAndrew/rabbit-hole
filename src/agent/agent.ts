// The agent loop: call the model, run the tools it asks for, append the
// results, repeat. The growing `messages` array is the agent's only memory;
// a context strategy decides how much of it the model is shown each turn.

import { createHash } from "node:crypto";
import type { ContextStrategy } from "./context.ts";
import { OpenRouterError, type AssistantMessage, type ChatResult, type Message } from "../models/openrouter.ts";
import { currentPage, hops, startRace, type LinkSource, type Race } from "../race/race.ts";
import { executeTool, toolDefinitions } from "../race/tools.ts";
import type { Totals, TraceEvent } from "./trace.ts";

/**
 * Sends this turn's messages and returns the model's reply. Passed in
 * rather than imported, so tests can script the model's replies.
 */
export type CallModel = (messages: Message[]) => Promise<ChatResult>;

/**
 * How a race ended. Each one says something about the agent.
 *
 * - `won`: reached the target.
 * - `gave_up`: called give_up.
 * - `turn_limit`: used every turn without finishing.
 * - `context_limit`: the conversation grew past maxContextChars.
 * - `output_limit`: a reply was cut off at the output cap, so its tool calls
 *   can't be trusted.
 * - `refused`: a reply with no tool call, or one the provider's filter blocked.
 */
export type EndReason = "won" | "gave_up" | "turn_limit" | "context_limit" | "output_limit" | "refused";

/**
 * Why a run couldn't finish. These say nothing about the agent, so they are
 * kept out of success rates.
 *
 * - `no_credits`: OpenRouter answered 402.
 * - `unauthorized`: the API key was refused (401 or 403).
 * - `retries_exhausted`: 429s, 5xx or network errors kept coming after every retry.
 * - `api_error`: any other API failure, such as a malformed response.
 */
export type CrashCause = "no_credits" | "unauthorized" | "retries_exhausted" | "api_error";

/** A run either finished, which counts for or against the agent, or crashed, which doesn't. */
export type RunEnd =
  | { kind: "finished"; reason: EndReason }
  | { kind: "crashed"; cause: CrashCause; error: string };

/** Everything a run produced. The trace holds the same, event by event. */
export type RunResult = {
  /** The race as it ended, with the full path. */
  race: Race;
  end: RunEnd;
  /** Model calls made. */
  turns: number;
  totals: Totals;
  /** The whole conversation, the final reply and its tool results included. */
  messages: Message[];
};

/**
 * The limits every race runs under, dev races and evals alike, so their
 * results can be compared.
 */
export const RACE_LIMITS = {
  /** Model calls allowed. */
  maxTurns: 30,
  /**
   * Context size, not cost, in characters rather than tokens: tokenizers
   * differ (Claude counts a link list as ~1.6x the tokens DeepSeek does), so a
   * token limit would give some models less room. About 100k DeepSeek tokens.
   */
  maxContextChars: 330_000,
  /** One reply, reasoning included. */
  maxOutputTokens: 2000,
};

/** The task and goal. Facts about the tools live in their descriptions. */
export const SYSTEM_PROMPT = `You are playing a Wikipedia race. You start on one Wikipedia page and must reach the target page by following links, in as few hops as possible.`;
/** The first user message; `{start}` and `{target}` are filled in per race. */
const OPENING = `You are on "{start}". The target is "{target}".`;

/**
 * A short hash of everything the model is told: system prompt, opening
 * message and tool definitions. It changes whenever any of them does, so
 * results are only compared between runs that saw the same prompt.
 */
export function promptHash(): string {
  const prompt = JSON.stringify({ system: SYSTEM_PROMPT, opening: OPENING, tools: toolDefinitions });
  return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}

/** One race to run, and the limits it runs under. */
export type RunOptions = {
  /** Start page title; redirects are resolved before the first turn. */
  start: string;
  /** Target page title; redirects are resolved before the first turn. */
  target: string;
  callModel: CallModel;
  getLinks: LinkSource;
  /** Turns the whole conversation into what the model is sent each turn. */
  context: ContextStrategy;
  /** Model calls allowed before the run ends as "turn_limit". */
  maxTurns: number;
  /**
   * Context size in characters (see `contextChars`): once the next turn's
   * view is bigger than this after a turn's tools run, the run ends as
   * "context_limit" rather than send it. It measures what the model would be
   * shown, not the whole record.
   */
  maxContextChars: number;
  /**
   * Receives each model call, tool call and the run's end, as they happen.
   * The caller writes run_start itself, since it knows the model and commit.
   */
  record: (event: TraceEvent) => void;
};

/**
 * Play one race: call the model, run the tools it asks for, append the
 * results, and repeat until the race ends or a limit is reached.
 *
 * @returns How it ended. An API failure is returned as a crash, not thrown.
 * @throws Anything that isn't an API failure, because that's a bug.
 */
export async function runAgent(options: RunOptions): Promise<RunResult> {
  let race = await startRace(options.start, options.target, options.getLinks);
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: OPENING.replace("{start}", race.start).replace("{target}", race.target) },
  ];
  const started = performance.now();
  const totals: Totals = { promptTokens: 0, cachedTokens: 0, completionTokens: 0, reasoningTokens: 0, cost: 0, durationMs: 0 };

  const finish = (end: RunEnd, turns: number): RunResult => {
    totals.durationMs = Math.round(performance.now() - started);
    options.record({ type: "run_end", end, path: race.path, hops: hops(race), turns, totals });
    return { race, end, turns, totals, messages };
  };
  const finished = (reason: EndReason, turns: number) => finish({ kind: "finished", reason }, turns);

  for (let turn = 1; turn <= options.maxTurns; turn++) {
    const view = options.context.view(messages, race);
    let reply: ChatResult;
    try {
      reply = await options.callModel(view);
    } catch (err) {
      // Only API failures are crashes. Anything else is a bug: let it throw.
      if (!(err instanceof OpenRouterError)) {
        throw err;
      }
      return finish({ kind: "crashed", cause: crashCause(err), error: err.message }, turn - 1);
    }
    messages.push(assistantMessage(reply));
    addUsage(totals, reply);
    options.record({
      type: "model_call",
      turn,
      contextChars: contextChars(view),
      provider: reply.provider,
      generationId: reply.generationId,
      attempts: reply.attempts,
      durationMs: Math.round(reply.durationMs),
      finishReason: reply.finishReason,
      content: reply.content,
      reasoning: reply.reasoning,
      toolCalls: reply.toolCalls,
      usage: reply.usage,
    });

    if (reply.finishReason === "length") {
      return finished("output_limit", turn);
    }
    if (reply.finishReason === "content_filter" || reply.toolCalls.length === 0) {
      return finished("refused", turn);
    }

    let end: "won" | "gave_up" | null = null;
    for (const call of reply.toolCalls) {
      // Every call must get a result, even ones after the race ended, or the
      // next request is rejected. Those aren't run, so they can't change it.
      const pageBefore = currentPage(race);
      const callStarted = performance.now();
      let content = "Not run: the race is already over.";
      let status: "ok" | "error" | "not_run" = "not_run";
      if (end === null) {
        const outcome = await executeTool(call, race, options.getLinks);
        race = outcome.race;
        end = outcome.end;
        content = outcome.content;
        status = outcome.status;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
      options.record({
        type: "tool_call",
        turn,
        callId: call.id,
        name: call.name,
        arguments: call.arguments,
        result: content,
        status,
        durationMs: Math.round(performance.now() - callStarted),
        pageBefore,
        pageAfter: currentPage(race),
      });
    }

    if (end !== null) {
      return finished(end, turn);
    }
    // Checked after the turn's tools run, so a winning move still counts. This
    // is the size of the next prompt.
    if (contextChars(options.context.view(messages, race)) > options.maxContextChars) {
      return finished("context_limit", turn);
    }
  }

  return finished("turn_limit", options.maxTurns);
}

/**
 * The size of the conversation in characters: every message's text, and the
 * name and arguments of every tool call. Counted the same way for every model,
 * unlike tokens. Opaque reasoning blocks are left out: their form differs by
 * provider. The tool definitions are left out too: they're the same each turn.
 */
export function contextChars(messages: Message[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.content?.length ?? 0;
    if (message.role === "assistant") {
      for (const call of message.tool_calls ?? []) {
        chars += call.function.name.length + call.function.arguments.length;
      }
    }
  }
  return chars;
}

/** Add one call's tokens and cost to the run's totals, in place. */
function addUsage(totals: Totals, reply: ChatResult): void {
  const { usage } = reply;
  totals.promptTokens += usage.promptTokens;
  totals.cachedTokens += usage.cachedTokens ?? 0;
  totals.completionTokens += usage.completionTokens;
  totals.reasoningTokens += usage.reasoningTokens ?? 0;
  // One unreported cost makes the total unknown, not lower.
  totals.cost = totals.cost === null || usage.cost === null ? null : totals.cost + usage.cost;
}

/** Sort an API failure into a crash cause, by HTTP status. */
function crashCause(err: OpenRouterError): CrashCause {
  if (err.status === 402) {
    return "no_credits";
  }
  if (err.status === 401 || err.status === 403) {
    return "unauthorized";
  }
  // A network failure: fetchWithRetry has already retried it.
  if (err.cause instanceof TypeError) {
    return "retries_exhausted";
  }
  // fetchWithRetry has already retried these.
  if (err.status === 429 || (err.status !== null && err.status >= 500)) {
    return "retries_exhausted";
  }
  return "api_error";
}

/**
 * The reply in the form it's sent back on the next turn. It goes back exactly
 * as the model wrote it, reasoning included, so the next turn sees its own
 * earlier thinking.
 */
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
