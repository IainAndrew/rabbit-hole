// Readers' names for the harness's context strategies and prompt variants,
// whose ids ("masked", "fewest-hops") mean little outside the code.

const CONTEXT_NAMES: Record<string, string> = {
  full: "Full history",
  masked: "Masking",
  state: "Rebuilt state",
};

const PROMPT_NAMES: Record<string, string> = {
  "fewest-hops": "Original",
  "scoring-rule": "Target first, then hops",
};

/** A context strategy's name for readers; its id if it has none yet. */
export function strategyName(id: string): string {
  return CONTEXT_NAMES[id] ?? id;
}

/** A prompt variant's name for readers; its id if it has none yet. */
export function promptName(id: string): string {
  return PROMPT_NAMES[id] ?? id;
}
