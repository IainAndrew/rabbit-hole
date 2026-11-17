// OpenRouter's live list of models, filtered to ones the race can use.
// Free to call: no key needed.

import { fetchWithRetry } from "../wikipedia/retry.ts";

const MODELS_URL = "https://openrouter.ai/api/v1/models";

/** A model from OpenRouter's live list. Prices are dollars per million tokens. */
export type ListedModel = {
  id: string;
  name: string;
  /** Tokens. */
  contextLength: number;
  inputPrice: number;
  /** Null when the model has no cache price listed. */
  cachedInputPrice: number | null;
  outputPrice: number;
};

/** Fetch OpenRouter's live model list, filtered and sorted as `parseModelList` does. */
export async function fetchModelList(): Promise<ListedModel[]> {
  const response = await fetchWithRetry(() => fetch(MODELS_URL));
  if (!response.ok) {
    throw new Error(`OpenRouter returned HTTP ${response.status} for the model list`);
  }
  return parseModelList(await response.json());
}

/**
 * Keep models the race could run on, cheapest input first. A race is mostly
 * input tokens (the whole conversation is resent every turn), so input price
 * matters most.
 *
 * @param body The list endpoint's JSON, unchecked.
 * @throws If the body or any model in it is malformed.
 */
export function parseModelList(body: unknown): ListedModel[] {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new Error("Unexpected OpenRouter model list");
  }
  return body.data
    .filter(isUsable)
    .map(toListedModel)
    .sort((a, b) => a.inputPrice - b.inputPrice);
}

/** True for models with tools, a pinned id, chat support and a real price. */
function isUsable(raw: unknown): boolean {
  if (!isRecord(raw) || typeof raw.id !== "string") {
    throw new Error("Malformed model in OpenRouter list");
  }
  const params = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : [];
  const endpoints = Array.isArray(raw.endpoints) ? raw.endpoints : [];
  return (
    params.includes("tools") &&
    // "~" ids are aliases that silently move to a newer model.
    !raw.id.startsWith("~") &&
    // ":batch" variants only serve the async batch API, not chat.
    endpoints.includes("/api/v1/chat/completions") &&
    // Free variants are rate-limited, and routers like openrouter/auto list a
    // price of -1 because they pick a different model per call.
    isRecord(raw.pricing) &&
    Number(raw.pricing.prompt) > 0
  );
}

/** Check one raw model and convert its prices. */
function toListedModel(raw: unknown): ListedModel {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.context_length !== "number" ||
    !isRecord(raw.pricing)
  ) {
    throw new Error("Malformed model in OpenRouter list");
  }
  const cached = raw.pricing.input_cache_read;
  return {
    id: raw.id,
    name: raw.name,
    contextLength: raw.context_length,
    inputPrice: perMillion(raw.pricing.prompt, raw.id),
    cachedInputPrice: cached === undefined ? null : perMillion(cached, raw.id),
    outputPrice: perMillion(raw.pricing.completion, raw.id),
  };
}

/**
 * OpenRouter lists prices as strings in dollars per token.
 *
 * @param id What the price belongs to (a model id or endpoint tag), for the error message.
 */
export function perMillion(value: unknown, id: string): number {
  const perToken = Number(value);
  if (typeof value !== "string" || !Number.isFinite(perToken)) {
    throw new Error(`Malformed price for ${id}`);
  }
  return perToken * 1_000_000;
}

/** True for any non-null object, so its fields can be read and checked. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
