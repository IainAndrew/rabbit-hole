// The models this project runs, by exact OpenRouter id. Prices are not kept
// here: cost comes from what OpenRouter reports for each call. Anything we
// don't know is null, never guessed.

/**
 * What we ask for in the request's reasoning setting. "default" sends nothing
 * and leaves it to the model.
 */
export type ReasoningEffort = "default" | "none" | "low" | "medium" | "high";

/** One model in the registry. */
export type Model = {
  /**
   * The exact OpenRouter id. Pinned, never a "~...-latest" alias, so a result
   * always names the model that produced it.
   */
  id: string;
  /** For people: reports and the site. */
  name: string;
  /** Who made it, so the field can have one model per lab. */
  lab: string;
  /** Tokens, as OpenRouter lists it. Null if unknown. */
  contextLength: number | null;
  reasoning: ReasoningEffort;
  /**
   * The OpenRouter provider slug every call goes to, with no fallback. One id
   * is served by dozens of providers at different prices and precisions, and
   * a cache only helps if calls stay on one. Rule: the lab's own endpoint
   * where there is one and the account's data policy allows it (no training
   * on prompts), else the cheapest fp8-or-better endpoint that isn't a flex
   * tier and has 99%+ uptime.
   */
  provider: string;
};

/**
 * The cheapest capable model, used while building. Reasoning is on by default
 * for this model at high effort; low keeps cost down while still showing its
 * thinking in traces. DeepSeek's own endpoint may train on prompts, so this
 * is Morph's fp8 endpoint, the cheapest that meets the rule (16 Nov 2026).
 */
const deepseekV41Flash: Model = {
  id: "deepseek/deepseek-v4.1-flash-1017",
  name: "DeepSeek V4.1 Flash",
  lab: "DeepSeek",
  contextLength: 1_048_576,
  reasoning: "low",
  provider: "morph",
};

/** The model the race commands use while building. */
export const buildModel = deepseekV41Flash;

/** Every model in the registry. */
export const models: Model[] = [deepseekV41Flash];
