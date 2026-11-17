// Every provider endpoint OpenRouter has for one model. The same model id is
// served by many providers at different prices, precisions and reliability,
// so choosing a model is also choosing an endpoint. Free to call: no key.

import { fetchWithRetry } from "../wikipedia/retry.ts";
import { isRecord, perMillion } from "./model-list.ts";

/** One provider's endpoint for a model. Prices are dollars per million tokens. */
export type Endpoint = {
  /**
   * Provider slug plus variant, such as "morph/fp8" or "deepinfra/fp8/flex".
   * The part before the first slash is what a request's provider order names.
   */
  tag: string;
  /** "flex" (cheaper, may be slow or queued), "priority" (faster, dearer), or null. */
  tier: string | null;
  /** Weight precision such as "fp8" or "fp4"; "unknown" when the provider doesn't say. */
  precision: string;
  inputPrice: number;
  /** Null when the endpoint lists no cache price. */
  cachedInputPrice: number | null;
  /** What writing to the cache costs. Listed by models that cache only when asked to. */
  cacheWritePrice: number | null;
  outputPrice: number;
  /** True if the provider caches repeated prompt prefixes without being asked. */
  implicitCaching: boolean;
  supportsTools: boolean;
  /** Percent of requests that succeeded over the last day. */
  uptime: number;
  /**
   * Some endpoints charge more once a prompt passes a size, such as 5x the
   * input price over 100k tokens. Null when the price is flat.
   */
  longPrompt: { minTokens: number; inputPrice: number } | null;
  /**
   * True if the price changes with the time of day or day of the week (peak
   * and off-peak), so the same run can cost more at another hour.
   */
  pricedByTime: boolean;
};

/** Fetch every endpoint for a model id, cheapest input first. */
export async function fetchEndpoints(modelId: string): Promise<Endpoint[]> {
  const path = modelId.split("/").map(encodeURIComponent).join("/");
  const url = `https://openrouter.ai/api/v1/models/${path}/endpoints`;
  const response = await fetchWithRetry(() => fetch(url));
  if (!response.ok) {
    throw new Error(`OpenRouter returned HTTP ${response.status} for the endpoints of ${modelId}`);
  }
  return parseEndpoints(await response.json());
}

/**
 * Check the endpoints response and convert its prices, cheapest input first.
 *
 * @param body The endpoints JSON, unchecked.
 * @throws If the body or any endpoint in it is malformed.
 */
export function parseEndpoints(body: unknown): Endpoint[] {
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.endpoints)) {
    throw new Error("Unexpected OpenRouter endpoints response");
  }
  return body.data.endpoints.map(toEndpoint).sort((a, b) => a.inputPrice - b.inputPrice);
}

/** Check one raw endpoint and convert it. */
function toEndpoint(raw: unknown): Endpoint {
  if (
    !isRecord(raw) ||
    typeof raw.tag !== "string" ||
    typeof raw.quantization !== "string" ||
    typeof raw.uptime_last_1d !== "number" ||
    !Array.isArray(raw.supported_parameters) ||
    !isRecord(raw.pricing)
  ) {
    throw new Error("Malformed endpoint in OpenRouter response");
  }
  const pricing = raw.pricing;
  return {
    tag: raw.tag,
    tier: typeof raw.service_tier === "string" ? raw.service_tier : null,
    precision: raw.quantization,
    inputPrice: perMillion(pricing.prompt, raw.tag),
    cachedInputPrice: optionalPrice(pricing.input_cache_read, raw.tag),
    cacheWritePrice: optionalPrice(pricing.input_cache_write, raw.tag),
    outputPrice: perMillion(pricing.completion, raw.tag),
    implicitCaching: raw.supports_implicit_caching === true,
    supportsTools: raw.supported_parameters.includes("tools"),
    uptime: raw.uptime_last_1d,
    ...priceOverrides(pricing.overrides, raw.tag),
  };
}

/** A price that may be absent: null rather than a guessed zero. */
function optionalPrice(value: unknown, tag: string): number | null {
  return value === undefined ? null : perMillion(value, tag);
}

/**
 * Read the overrides to the listed price: by prompt size, by time of day, or
 * both. An unknown kind throws, so a new way of charging can't go unnoticed.
 */
function priceOverrides(overrides: unknown, tag: string): Pick<Endpoint, "longPrompt" | "pricedByTime"> {
  const found: Pick<Endpoint, "longPrompt" | "pricedByTime"> = { longPrompt: null, pricedByTime: false };
  const list: unknown[] = Array.isArray(overrides) ? overrides : [];
  for (const override of list) {
    if (!isRecord(override)) {
      throw new Error(`Malformed price override for ${tag}`);
    }
    if (typeof override.min_prompt_tokens === "number") {
      found.longPrompt ??= { minTokens: override.min_prompt_tokens, inputPrice: perMillion(override.prompt, tag) };
    } else if ("utc_start" in override || "utc_days" in override) {
      found.pricedByTime = true;
    } else {
      throw new Error(`Unknown kind of price override for ${tag}`);
    }
  }
  return found;
}
