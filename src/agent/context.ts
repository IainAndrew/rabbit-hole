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
