// A thin client for OpenRouter's OpenAI-compatible chat API: one request, one
// checked response. No streaming, no framework.

import type { Model, ReasoningSetting } from "./models.ts";
import { fetchWithRetry } from "../http/retry.ts";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** The conversation, in the wire format: it is sent whole on every call. */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

/** The task and rules, first in every conversation. */
export type SystemMessage = { role: "system"; content: string };

/** A message from our side; here, only the opening that names the race. */
export type UserMessage = { role: "user"; content: string };

/** The model's reply, sent back on later turns exactly as it came. */
export type AssistantMessage = {
  role: "assistant";
  /** Null when the reply is only tool calls. */
  content: string | null;
  /** Left out, not empty, when the reply has none. */
  tool_calls?: WireToolCall[];
  /** Opaque reasoning blocks; see `ChatResult.reasoningDetails`. */
  reasoning_details?: unknown[];
};

/** Answers one tool call. Every call in an assistant message needs one. */
export type ToolMessage = {
  role: "tool";
  /** The `id` of the tool call this answers. */
  tool_call_id: string;
  content: string;
};

/** A tool call as it appears on the wire, nested under "function". */
export type WireToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** A tool call from a reply, flattened out of the wire format. */
export type ModelToolCall = {
  /** Pairs this call with the result we send back. */
  id: string;
  name: string;
  /** A JSON string written by the model, so it may not parse. */
  arguments: string;
};

/** One call's tokens and cost. Null means the provider didn't report it. */
export type Usage = {
  /** Everything sent, including tool definitions and cached tokens. */
  promptTokens: number;
  /** The part of the prompt served from the provider's cache, billed cheaper. */
  cachedTokens: number | null;
  /** Everything generated, including reasoning. */
  completionTokens: number;
  /** The part of completionTokens spent thinking. */
  reasoningTokens: number | null;
  /** Dollars, as OpenRouter charged it. */
  cost: number | null;
};

/** One checked reply from the model. */
export type ChatResult = {
  /** Text the model wrote, if any. */
  content: string | null;
  /** The model's thinking as readable text, when the provider returns it. */
  reasoning: string | null;
  /**
   * Opaque: sent back unchanged on the next turn. Some models sign or encrypt
   * their reasoning and reject a conversation that drops it.
   */
  reasoningDetails: unknown[] | null;
  /** Empty when the model answered in text only. */
  toolCalls: ModelToolCall[];
  /** "tool_calls", "stop", "length" (hit maxTokens), and others. */
  finishReason: string | null;
  usage: Usage;
  /** Which upstream provider OpenRouter routed the call to. */
  provider: string | null;
  /** OpenRouter's id for this call ("gen-..."). */
  generationId: string | null;
  /** Requests sent, retries included. Their waits are part of durationMs. */
  attempts: number;
  /** From sending the first request to reading the last response. */
  durationMs: number;
};

/**
 * A failed call. Callers use `status` to tell "out of credits" from other
 * failures. A network failure has a TypeError as its `cause`.
 */
export class OpenRouterError extends Error {
  override name = "OpenRouterError";
  /**
   * The HTTP status, or null when there was none: the failure came inside a
   * 200 response, or no response arrived at all.
   */
  readonly status: number | null;

  constructor(message: string, status: number | null, options?: { cause: unknown }) {
    super(message, options);
    this.status = status;
  }
}

/** One call to make. */
export type ChatRequest = {
  /** Supplies the model id and its reasoning setting. */
  model: Model;
  /** The whole conversation so far. */
  messages: Message[];
  /** Tool definitions in the OpenAI-compatible format. */
  tools: readonly object[];
  /** Caps one reply, reasoning included, so one call can't run away. */
  maxTokens: number;
};

/**
 * Send the conversation to OpenRouter and return the model's checked reply,
 * always from the model's pinned provider. Reads the key from
 * OPENROUTER_API_KEY. Retries 429s and 5xx, which aren't billed.
 *
 * @throws {OpenRouterError} For an HTTP error, a provider error inside a 200,
 *   a response that doesn't have the expected shape, or no response at all
 *   after every retry.
 * @throws If OPENROUTER_API_KEY isn't set.
 */
export async function chat(request: ChatRequest): Promise<ChatResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  const body = requestBody(request);

  const started = performance.now();
  let attempts = 0;
  // Retries only 429s and 5xx, which aren't billed.
  let response: Response;
  try {
    response = await fetchWithRetry(() => {
      attempts++;
      return fetch(CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    });
  } catch (error) {
    // Every attempt failed before any response arrived. fetch's own message is
    // just "fetch failed"; the reason is in its cause.
    if (!(error instanceof TypeError)) {
      throw error;
    }
    const reason = error.cause instanceof Error ? error.cause.message : error.message;
    throw new OpenRouterError(`No response from OpenRouter after ${attempts} attempts: ${reason}`, null, { cause: error });
  }
  // A gateway error can be an HTML page; treat a body that isn't JSON as empty.
  const json: unknown = await response.json().catch(() => null);
  const durationMs = performance.now() - started;

  if (!response.ok) {
    // 402 means the account is out of credits.
    throw new OpenRouterError(`OpenRouter returned HTTP ${response.status}: ${errorMessage(json)}`, response.status);
  }
  return { ...parseResponse(json), attempts, durationMs };
}

/** The JSON body for one call, built from the request and the model's settings. */
export function requestBody(request: ChatRequest): Record<string, unknown> {
  return {
    model: request.model.id,
    messages: request.messages,
    tools: request.tools,
    max_tokens: request.maxTokens,
    ...reasoningField(request.model.reasoning),
    // Automatic caching: the provider puts the cache point after the last
    // message and moves it forward each turn, so every turn reads the whole
    // conversation so far from the cache and writes only what's new.
    ...(request.model.explicitCaching ? { cache_control: { type: "ephemeral" } } : {}),
    // One provider, no fallback: a different provider is a different setup
    // (price, precision, cache). require_parameters makes a provider that
    // would ignore a setting, such as tools or reasoning, refuse instead.
    provider: { order: [request.model.provider], allow_fallbacks: false, require_parameters: true },
  };
}

/** The request's reasoning field: nothing for "default", else an effort or a token cap. */
function reasoningField(setting: ReasoningSetting): { reasoning?: { effort: string } | { max_tokens: number } } {
  if (setting === "default") {
    return {};
  }
  return typeof setting === "string" ? { reasoning: { effort: setting } } : { reasoning: { max_tokens: setting.maxTokens } };
}

/** The response is outside data: check every field we use. */
function parseResponse(json: unknown): Omit<ChatResult, "attempts" | "durationMs"> {
  if (!isRecord(json) || !Array.isArray(json.choices) || !isRecord(json.usage)) {
    throw new OpenRouterError("Unexpected OpenRouter response", null);
  }
  const choice: unknown = json.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw new OpenRouterError("No choice in OpenRouter response", null);
  }
  // A provider can fail after OpenRouter has already answered 200.
  if (choice.error !== undefined) {
    throw new OpenRouterError(`Provider error: ${errorMessage({ error: choice.error })}`, null);
  }

  const message = choice.message;
  const rawCalls: unknown[] = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const usage = json.usage;
  if (typeof usage.prompt_tokens !== "number" || typeof usage.completion_tokens !== "number") {
    throw new OpenRouterError("Missing token counts in OpenRouter response", null);
  }

  return {
    content: optionalString(message.content),
    reasoning: optionalString(message.reasoning),
    reasoningDetails: Array.isArray(message.reasoning_details) ? message.reasoning_details : null,
    toolCalls: rawCalls.map(parseToolCall),
    finishReason: optionalString(choice.finish_reason),
    usage: {
      promptTokens: usage.prompt_tokens,
      cachedTokens: optionalNumber(isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details.cached_tokens : null),
      completionTokens: usage.completion_tokens,
      reasoningTokens: optionalNumber(
        isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details.reasoning_tokens : null,
      ),
      cost: optionalNumber(usage.cost),
    },
    provider: optionalString(json.provider),
    generationId: optionalString(json.id),
  };
}

/** Check one wire tool call and flatten it. */
function parseToolCall(raw: unknown): ModelToolCall {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    !isRecord(raw.function) ||
    typeof raw.function.name !== "string" ||
    typeof raw.function.arguments !== "string"
  ) {
    throw new OpenRouterError("Malformed tool call in OpenRouter response", null);
  }
  return { id: raw.id, name: raw.function.name, arguments: raw.function.arguments };
}

/** The `error.message` from an error body, if it has one. */
function errorMessage(json: unknown): string {
  if (isRecord(json) && isRecord(json.error) && typeof json.error.message === "string") {
    return json.error.message;
  }
  return "no error message";
}

/** The value if it's a string, otherwise null. */
function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The value if it's a number, otherwise null. */
function optionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** True for any non-null object, so its fields can be read and checked. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
