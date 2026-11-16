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
};

/**
 * The cheapest capable model, used while building. Reasoning is on by default
 * for this model at high effort; low keeps cost down while still showing its
 * thinking in traces.
 */
const deepseekV41Flash: Model = {
  id: "deepseek/deepseek-v4.1-flash-1017",
  name: "DeepSeek V4.1 Flash",
  lab: "DeepSeek",
  contextLength: 1_048_576,
  reasoning: "low",
};

/** The model the race commands use while building. */
export const buildModel = deepseekV41Flash;

/** Every model in the registry. */
export const models: Model[] = [deepseekV41Flash];
