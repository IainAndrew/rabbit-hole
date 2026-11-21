// Prompts: what the model is told at the start of a run. The system prompt
// comes in named variants; the opening message and the tool definitions are
// the same for every variant.

import { createHash } from "node:crypto";
import { toolDefinitions } from "../race/tools.ts";

/**
 * A system prompt: the task and goal, put one way. Facts about the tools live
 * in their descriptions, the same for every variant.
 */
export type PromptVariant = {
  /** Recorded in every trace and eval.json, so results say which prompt made them. */
  name: string;
  system: string;
};

/** The prompt every run used before variants existed. It asks for the fewest hops. */
export const FEWEST_HOPS: PromptVariant = {
  name: "fewest-hops",
  system: `You are playing a Wikipedia race. You start on one Wikipedia page and must reach the target page by following links, in as few hops as possible.`,
};

/**
 * The scoring rule as it is: reaching the target decides, hops only break
 * ties. Written after DeepSeek kept spending whole replies proving no shorter
 * route existed, never moving, under FEWEST_HOPS.
 */
export const SCORING_RULE: PromptVariant = {
  name: "scoring-rule",
  system: `You are playing a Wikipedia race. You start on one Wikipedia page and must reach the target page by following links. Reaching the target is what counts: fewer hops only break ties between runs that reach it. Once you know a route, take it.`,
};

/** Every prompt a run can use, by name. */
export const PROMPT_VARIANTS: PromptVariant[] = [FEWEST_HOPS, SCORING_RULE];

/** The first user message; `{start}` and `{target}` are filled in per race. */
const OPENING = `You are on "{start}". The target is "{target}".`;

/** The first user message of a race. */
export function openingMessage(start: string, target: string): string {
  return OPENING.replace("{start}", start).replace("{target}", target);
}

/**
 * A short hash of everything the model is told: system prompt, opening
 * message and tool definitions. It changes whenever any of them does, so
 * results say exactly which prompt they were made with.
 */
export function promptHash(prompt: PromptVariant): string {
  const told = JSON.stringify({ system: prompt.system, opening: OPENING, tools: toolDefinitions });
  return createHash("sha256").update(told).digest("hex").slice(0, 12);
}
