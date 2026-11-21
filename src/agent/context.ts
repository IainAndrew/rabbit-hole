// Context strategies: what the model is shown each turn. The agent loop keeps
// the whole conversation (the record); a strategy turns it into the messages
// sent this turn (the view). The trace holds the record, never the view.

import type { Message } from "../models/openrouter.ts";
import { currentPage, hops, type Race } from "../race/race.ts";
import { linksTitle, pageArgument } from "../race/tools.ts";

/** Decides what the model sees each turn, from the whole conversation so far. */
export type ContextStrategy = {
  /** Recorded in every trace and eval.json, so results say how they were made. */
  name: string;
  /**
   * The messages to send this turn. Must depend only on `history` and `race`,
   * which the trace records, so any turn's view can be rebuilt from it; must
   * not change either. A strategy only reshapes what the run has already
   * shown the model: it never adds anything new, so the game stays the same.
   */
  view: (history: readonly Message[], race: Race) => Message[];
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

/**
 * Rebuilt state: instead of the conversation, each turn the model gets one
 * fresh message written by the harness, holding facts only. What its last
 * turn's calls returned, the current page's links if it has fetched them, a
 * log of every call so far (one line each, so it can see it's repeating
 * itself), then where it stands: page, target, path and moves refused on this
 * page. None of the model's own earlier words are sent, so it can't build on
 * a mistaken claim, but it can't keep a plan either. The facts come last,
 * where the model is most likely to heed them.
 */
export const REBUILT_STATE: ContextStrategy = {
  name: "state",
  view: (history, race) => {
    // The system prompt stays; everything after it is replaced.
    return [history[0]!, { role: "user", content: rebuildState(history, race) }];
  },
};

/** Every strategy a run can use, by name. */
export const CONTEXT_STRATEGIES: ContextStrategy[] = [FULL_HISTORY, MASKED, REBUILT_STATE];

/** Rebuild where the race stands from the run so far, as the text of the one message REBUILT_STATE sends. */
function rebuildState(history: readonly Message[], race: Race): string {
  const here = currentPage(race);
  const calls = new Map<string, { name: string; arguments: string }>();
  const lists = new Map<string, string>();
  const log: string[] = [];
  let refusedHere: string[] = [];
  let turn = 0;
  for (const message of history) {
    if (message.role === "assistant") {
      turn++;
      for (const call of message.tool_calls ?? []) {
        calls.set(call.id, call.function);
      }
    }
    if (message.role !== "tool") {
      continue;
    }
    const call = calls.get(message.tool_call_id);
    const title = linksTitle(message.content);
    if (title !== null) {
      lists.set(title, message.content);
    }
    log.push(logLine(turn, call, message.content));
    if (call?.name === "move_to" && message.content.startsWith("Error")) {
      refusedHere.push(pageArgument(call.arguments) ?? call.arguments);
    } else if (call?.name === "move_to") {
      // A move that worked starts a new page, with nothing refused on it yet.
      refusedHere = [];
    }
  }

  const lastTurn = history.slice(history.findLastIndex((message) => message.role === "assistant") + 1);
  const lastResults = lastTurn.flatMap((message) => {
    if (message.role !== "tool") {
      return [];
    }
    const call = calls.get(message.tool_call_id);
    return [`${call?.name ?? "?"} ${call?.arguments ?? ""} returned:\n${message.content}`];
  });
  const shownLastTurn = lastTurn.some((message) => message.role === "tool" && linksTitle(message.content) === here);

  const sections: string[] = [];
  if (lastResults.length > 0) {
    sections.push(`Your last turn:\n\n${lastResults.join("\n\n")}`);
  }
  if (!shownLastTurn) {
    sections.push(lists.get(here) ?? `You haven't looked up the links on "${here}" yet.`);
  }
  sections.push(`Your moves and lookups so far:\n${log.length > 0 ? log.join("\n") : "none yet"}`);
  const facts = [`You are on "${here}". The target is "${race.target}".`, `Path so far (${hops(race)} hops): ${race.path.join(" > ")}`];
  if (refusedHere.length > 0) {
    facts.push(`Moves already refused on "${here}" (not links on it): ${refusedHere.join(", ")}`);
  }
  sections.push(facts.join("\n"));
  return sections.join("\n\n");
}

/**
 * One line of REBUILT_STATE's log: the turn, the call, and the first line of
 * what it returned (a list's header, a move's result, an error), never a list.
 */
function logLine(turn: number, call: { name: string; arguments: string } | undefined, result: string): string {
  if (call === undefined) {
    return `turn ${turn}: ${result.split("\n")[0]}`;
  }
  const page = pageArgument(call.arguments);
  const target = page === null ? call.arguments : `"${page}"`;
  return `turn ${turn}: ${call.name} ${target} → ${result.split("\n")[0]}`;
}

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
