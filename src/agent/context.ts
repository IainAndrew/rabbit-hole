// Context strategies: what the model is shown each turn. The agent loop keeps
// the whole conversation (the record); a strategy turns it into the messages
// sent this turn (the view). The trace holds the record, never the view.

import type { Message } from "../models/openrouter.ts";

/** Decides what the model sees each turn, from the whole conversation so far. */
export type ContextStrategy = {
  /** Recorded in every trace and eval.json, so results say how they were made. */
  name: string;
  /**
   * The messages to send this turn. Must depend only on `history`, so any
   * turn's view can be rebuilt from the trace, and must not change it.
   */
  view: (history: readonly Message[]) => Message[];
};

/** The baseline: send the whole conversation, as every run did before strategies existed. */
export const FULL_HISTORY: ContextStrategy = {
  name: "full",
  view: (history) => [...history],
};

/**
 * How many of the latest turns keep their link lists whole under masking.
 * Two, so a lookup made last turn and the one before stay readable while the
 * model plans from them; older lists are the bulk of a long run's context.
 */
export const MASK_KEEP_TURNS = 2;

/**
 * Observation masking: link lists from turns before the last MASK_KEEP_TURNS
 * are cut to their header line, with a note that get_links can fetch them
 * again. Everything the model wrote, and every short result (moves, errors),
 * is kept. The same idea as SWE-agent's "last n observations".
 */
export const MASKED: ContextStrategy = {
  name: "masked",
  view: (history) => {
    // Each assistant message opens a turn; the tool results after it belong to it.
    const turnStarts = history.flatMap((message, index) => (message.role === "assistant" ? [index] : []));
    const keepFrom = turnStarts.at(-MASK_KEEP_TURNS) ?? 0;
    const lookups = new Set(
      history.flatMap((message) => {
        if (message.role !== "assistant") {
          return [];
        }
        return (message.tool_calls ?? []).filter((call) => call.function.name === "get_links").map((call) => call.id);
      }),
    );
    return history.map((message, index) => {
      if (index >= keepFrom || message.role !== "tool" || !lookups.has(message.tool_call_id)) {
        return message;
      }
      return { ...message, content: maskLinks(message.content) };
    });
  },
};

/** Every strategy a run can use, by name. */
export const CONTEXT_STRATEGIES: ContextStrategy[] = [FULL_HISTORY, MASKED];

/**
 * A get_links result cut to its header ("Links on "X" (312):"). An error is
 * a single line with nothing to remove, so it comes back unchanged.
 */
function maskLinks(content: string): string {
  const [header, ...links] = content.split("\n");
  if (links.length === 0) {
    return content;
  }
  return `${header} [hidden to save space: call get_links again to see them]`;
}
