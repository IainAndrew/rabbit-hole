// A thin client for OpenRouter's OpenAI-compatible chat API: one request, one
// checked response. No streaming, no framework.

import type { Model } from "./models.ts";
import { fetchWithRetry } from "../wikipedia/retry.ts";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

// The conversation, in the wire format: it is sent whole on every call.
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export type SystemMessage = { role: "system"; content: string };

export type UserMessage = { role: "user"; content: string };

// The model's reply, sent back on later turns exactly as it came.
export type AssistantMessage = {
  role: "assistant";
  content: string | null;
  tool_calls?: WireToolCall[];
  reasoning_details?: unknown[];
};

// Answers one tool call. Every call in an assistant message needs one.
export type ToolMessage = { role: "tool"; tool_call_id: string; content: string };

// A tool call as it appears on the wire, nested under "function".
export type WireToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

// Arguments arrive as a JSON string written by the model, so they may not
// parse. The id pairs this call with the result we send back.
export type ModelToolCall = { id: string; name: string; arguments: string };

export type Usage = {
  // Everything sent, including tool definitions and cached tokens.
  promptTokens: number;
  // The part of the prompt served from the provider's cache, billed cheaper.
  cachedTokens: number | null;
  // Everything generated, including reasoning.
  completionTokens: number;
  reasoningTokens: number | null;
  // Dollars, as OpenRouter charged it.
  cost: number | null;
};

export type ChatResult = {
  content: string | null;
  reasoning: string | null;
  // Opaque: sent back unchanged on the next turn. Some models sign or encrypt
  // their reasoning and reject a conversation that drops it.
  reasoningDetails: unknown[] | null;
  toolCalls: ModelToolCall[];
  // "tool_calls", "stop", "length" (hit maxTokens), and others.
  finishReason: string | null;
  usage: Usage;
  // Which upstream provider OpenRouter routed the call to.
  provider: string | null;
  // OpenRouter's id for this call ("gen-...").
  generationId: string | null;
  // Requests sent, retries included. Their waits are part of durationMs.
  attempts: number;
  durationMs: number;
};

// A failed call. status is the HTTP status, or null when the failure came
// inside a 200 response. Callers use it to tell "out of credits" from other
// failures.
export class OpenRouterError extends Error {
  override name = "OpenRouterError";
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

export type ChatRequest = {
  model: Model;
  messages: Message[];
  tools: readonly object[];
  // Caps one reply, reasoning included, so one call can't run away.
  maxTokens: number;
};

export async function chat(request: ChatRequest): Promise<ChatResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  const body = {
    model: request.model.id,
    messages: request.messages,
    tools: request.tools,
    max_tokens: request.maxTokens,
    ...(request.model.reasoning === "default" ? {} : { reasoning: { effort: request.model.reasoning } }),
  };

  const started = performance.now();
  let attempts = 0;
  // Retries only 429s and 5xx, which aren't billed.
  const response = await fetchWithRetry(() => {
    attempts++;
    return fetch(CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });
  // A gateway error can be an HTML page; treat a body that isn't JSON as empty.
  const json: unknown = await response.json().catch(() => null);
  const durationMs = performance.now() - started;

  if (!response.ok) {
    // 402 means the account is out of credits.
    throw new OpenRouterError(`OpenRouter returned HTTP ${response.status}: ${errorMessage(json)}`, response.status);
  }
  return { ...parseResponse(json), attempts, durationMs };
}

// The response is outside data: check every field we use.
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

function errorMessage(json: unknown): string {
  if (isRecord(json) && isRecord(json.error) && typeof json.error.message === "string") {
    return json.error.message;
  }
  return "no error message";
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
