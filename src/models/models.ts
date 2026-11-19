// The models this project runs, by exact OpenRouter id. Prices are not kept
// here: cost comes from what OpenRouter reports for each call. Anything we
// don't know is null, never guessed.

/**
 * What we ask for in the request's reasoning setting. "default" sends nothing
 * and leaves it to the model.
 */
export type ReasoningEffort = "default" | "none" | "low" | "medium" | "high";

/**
 * An effort level, or a cap on reasoning tokens for a model that takes a cap
 * but no effort level.
 */
export type ReasoningSetting = ReasoningEffort | { maxTokens: number };

/** The setting in words, for reports and replays. */
export function reasoningLabel(setting: ReasoningSetting): string {
  return typeof setting === "string" ? setting : `up to ${setting.maxTokens} tokens`;
}

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
  reasoning: ReasoningSetting;
  /**
   * The OpenRouter endpoint tag every call goes to, with no fallback, such as
   * "morph/fp8". A bare slug ("morph") would match every endpoint that
   * provider has, including dearer priority tiers. One id is served by dozens
   * of endpoints at different prices and precisions, and a cache only helps
   * if calls stay on one. Rule: the lab's own endpoint where the account's
   * data policy allows it (no training on prompts), unless its price varies
   * by time of day or its uptime is under 99%; else the cheapest fp8-or-better
   * endpoint that isn't a flex tier and has 99%+ uptime. Chosen from
   * `npm run model-endpoints` on 17 Nov 2026.
   */
  provider: string;
  /**
   * True for models that cache only when the request asks (Anthropic's), so
   * chat() sends a cache_control field. The rest cache repeated prompts
   * without being asked. Without it, every turn pays full price for the
   * whole conversation, which grows each turn.
   */
  explicitCaching: boolean;
};

// The field: one cheap, recent, tool-capable model per lab, at about
// $0.06-0.25 per million input tokens. Reasoning is "low" wherever a model
// takes an effort setting, so no model thinks much longer than another.

const claudeHaiku55: Model = {
  id: "anthropic/claude-haiku-5.5",
  name: "Claude Haiku 5.5",
  lab: "Anthropic",
  contextLength: 1_000_000,
  reasoning: "low",
  provider: "anthropic",
  explicitCaching: true,
};

const gpt6Luna: Model = {
  id: "openai/gpt-6-luna",
  name: "GPT-6 Luna",
  lab: "OpenAI",
  contextLength: 1_050_000,
  reasoning: "low",
  provider: "openai",
  explicitCaching: false,
};

const gemini31FlashLite: Model = {
  id: "google/gemini-3.1-flash-lite",
  name: "Gemini 3.1 Flash Lite",
  lab: "Google",
  contextLength: 1_048_576,
  reasoning: "low",
  provider: "google-ai-studio",
  explicitCaching: false,
};

/**
 * The cheapest capable model, used while building. DeepSeek's own endpoint
 * may train on prompts, so this is Morph's fp8 endpoint, the cheapest that
 * meets the rule.
 */
const deepseekV41Flash: Model = {
  id: "deepseek/deepseek-v4.1-flash-1017",
  name: "DeepSeek V4.1 Flash",
  lab: "DeepSeek",
  contextLength: 1_048_576,
  reasoning: "low",
  provider: "morph/fp8",
  explicitCaching: false,
};

/**
 * Alibaba serves it from two endpoints; this one caches without being asked.
 * It takes no effort level, and at its default it spent a whole 2,000-token
 * reply thinking in the smoke test. A cap of half the reply is its nearest
 * equivalent to "low", and leaves room to act.
 */
const qwen38Flash: Model = {
  id: "qwen/qwen3.8-flash",
  name: "Qwen3.8 Flash",
  lab: "Qwen",
  contextLength: 1_000_000,
  reasoning: { maxTokens: 1000 },
  provider: "alibaba/us-east-1",
  explicitCaching: false,
};

/** Its only efforts are "high" and "none"; "none" is its default. */
const mistralSmall2603: Model = {
  id: "mistralai/mistral-small-2603",
  name: "Mistral Small 4",
  lab: "Mistral",
  contextLength: 262_144,
  reasoning: "none",
  provider: "mistral/zdr",
  explicitCaching: false,
};

const glm53Flash: Model = {
  id: "z-ai/glm-5.3-flash",
  name: "GLM-5.3 Flash",
  lab: "Zhipu",
  contextLength: 1_048_576,
  reasoning: "low",
  provider: "z-ai/fp8",
  explicitCaching: false,
};

/** MiniMax's own endpoint is priced by time of day, with 98.7% uptime. */
const minimaxM31Flash: Model = {
  id: "minimax/minimax-m3.1-flash",
  name: "MiniMax M3.1 Flash",
  lab: "MiniMax",
  contextLength: 1_048_576,
  reasoning: "low",
  provider: "parasail/fp8",
  explicitCaching: false,
};

/**
 * The floor: a 1.7B-parameter model, to show how small the agent can go.
 * Reasoning is always on and takes no effort setting.
 */
const lfm3: Model = {
  id: "liquid/lfm-3-1.7b",
  name: "LFM-3 1.7B",
  lab: "Liquid AI",
  contextLength: 262_144,
  reasoning: "default",
  provider: "liquid/fp8",
  explicitCaching: false,
};

/**
 * The ceiling: a strong model, to show how far the cheap field is from the
 * best. It runs under the same rules and repeats as every other model.
 */
const claudeOpus55: Model = {
  id: "anthropic/claude-opus-5.5",
  name: "Claude Opus 5.5",
  lab: "Anthropic",
  contextLength: 1_000_000,
  reasoning: "low",
  provider: "anthropic",
  explicitCaching: true,
};

/** The model the race commands use while building. */
export const buildModel = deepseekV41Flash;

/** Every model in the registry: the field, then the floor and the ceiling. */
export const models: Model[] = [
  claudeHaiku55,
  gpt6Luna,
  gemini31FlashLite,
  deepseekV41Flash,
  qwen38Flash,
  mistralSmall2603,
  glm53Flash,
  minimaxM31Flash,
  lfm3,
  claudeOpus55,
];
