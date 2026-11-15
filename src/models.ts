// The models this project runs, by exact OpenRouter id. Prices are not kept
// here: cost comes from what OpenRouter reports for each call. Anything we
// don't know is null, never guessed.

// What we ask for in the request's reasoning setting. "default" sends nothing
// and leaves it to the model.
export type ReasoningEffort = "default" | "none" | "low" | "medium" | "high";

export type Model = {
  // Pinned, never a "~...-latest" alias, so a result always names the model
  // that produced it.
  id: string;
  name: string;
  lab: string;
  contextLength: number | null;
  reasoning: ReasoningEffort;
};

// The cheapest capable model, used while building. Reasoning is on by default
// for this model at high effort; low keeps cost down while still showing its
// thinking in traces.
const deepseekV41Flash: Model = {
  id: "deepseek/deepseek-v4.1-flash-1017",
  name: "DeepSeek V4.1 Flash",
  lab: "DeepSeek",
  contextLength: 1_048_576,
  reasoning: "low",
};

export const buildModel = deepseekV41Flash;

export const models: Model[] = [deepseekV41Flash];
