// What a replay means turn by turn, worked out from its data once: where the
// agent stood, what it had looked at, which moves were refused, and its
// running totals. The stage draws from this; nothing here touches the page.

import type { RunEnd } from "@harness/agent/agent.ts";
import type { Replay, ReplayCall, ReplayTurn } from "@harness/site-data/replays.ts";

/** A page the agent has read the links of, how often, and in which turn last. */
export type Looked = { page: string; links: number; times: number; turn: number };

/** A move the rules refused, how often, and in which turn last. */
export type Refused = { page: string; times: number; turn: number };

/** The run as it stood after one turn. */
export type Step = {
  turn: ReplayTurn;
  path: string[];
  looked: Looked[];
  refused: Refused[];
  totals: { tokens: number; cost: number | null; hops: number; seconds: number };
};

/** The run after each turn, first to last. */
export function stepsOf(replay: Replay): Step[] {
  const path = [replay.end?.path[0] ?? replay.start.start];
  const looked = new Map<string, Looked>();
  const refused = new Map<string, Refused>();
  let tokens = 0;
  // Null from the first turn whose cost is unknown: a partial sum would read as a total.
  let cost: number | null = 0;
  return replay.turns.map((turn, index) => {
    for (const call of turn.calls) {
      const listed = /^Links on "(.*)" \((\d+)\):/.exec(call.result);
      if (call.name === "get_links" && call.status === "ok" && listed !== null) {
        const page = listed[1]!;
        looked.set(page, { page, links: Number(listed[2]), times: (looked.get(page)?.times ?? 0) + 1, turn: index });
      } else if (call.name === "move_to" && call.status === "ok") {
        path.push(call.pageAfter);
      } else if (call.name === "move_to" && call.status === "error") {
        const page = pageOf(call.arguments);
        refused.set(page, { page, times: (refused.get(page)?.times ?? 0) + 1, turn: index });
      }
    }
    tokens += turn.usage.promptTokens;
    cost = cost === null || turn.usage.cost === null ? null : cost + turn.usage.cost;
    return {
      turn,
      path: [...path],
      looked: [...looked.values()],
      refused: [...refused.values()],
      totals: { tokens, cost, hops: path.length - 1, seconds: turn.t / 1000 },
    };
  });
}

/** A turn's reasoning, or what it said if it gave none, or a note that it gave neither. */
export function wordsOf(turn: ReplayTurn): string {
  return turn.reasoning ?? turn.content ?? "No reasoning this turn.";
}

/** The page a tool call named, or its raw arguments if they don't parse. */
export function pageOf(args: string): string {
  return argumentOf(args, "page");
}

/** One tool call as a short action, and how to show it. */
export function actionOf(call: ReplayCall): { kind: "look" | "move" | "refused"; text: string } {
  if (call.name === "get_links") {
    return { kind: "look", text: `Looked up ${pageOf(call.arguments)}` };
  }
  if (call.name === "move_to") {
    return call.status === "ok"
      ? { kind: "move", text: `Moved to ${call.pageAfter}` }
      : { kind: "refused", text: `Tried ${pageOf(call.arguments)}: refused` };
  }
  if (call.name === "give_up") {
    return { kind: "refused", text: `Gave up: ${argumentOf(call.arguments, "reason")}` };
  }
  return { kind: "refused", text: `${call.name}: not a tool` };
}

/** One named argument of a tool call, or the raw arguments if they don't parse: model output is outside data. */
function argumentOf(args: string, name: string): string {
  try {
    const parsed: unknown = JSON.parse(args);
    if (typeof parsed === "object" && parsed !== null && name in parsed) {
      return String((parsed as Record<string, unknown>)[name]);
    }
    return args;
  } catch {
    return args;
  }
}

const ENDINGS = {
  won: "Won",
  gave_up: "Gave up",
  turn_limit: "Hit the turn limit",
  context_limit: "Hit the context limit",
  output_limit: "Hit the output limit",
  refused: "Replied without a tool call",
} as const;

/** How the run ended, for its header. */
export function endingText(end: Replay["end"]): string {
  if (end === null) {
    return "Killed before it finished: no totals.";
  }
  const cost = end.totals.cost === null ? "cost unknown" : `$${end.totals.cost.toFixed(4)}`;
  const totals = `${end.turns} turns, ${end.totals.promptTokens.toLocaleString("en-US")} prompt tokens, ${cost}, ${(
    end.totals.durationMs / 1000
  ).toFixed(1)} s`;
  if (end.end.kind === "crashed") {
    return `Crashed (${end.end.cause}): not counted. ${totals}`;
  }
  const hops = end.end.reason === "won" ? ` in ${hopsText(end.hops)}` : ` after ${hopsText(end.hops)}`;
  return `${ENDINGS[end.end.reason]}${hops}. ${totals}`;
}

/** How the run ended, short enough for a stamp. */
export function stampText(end: RunEnd, hops: number): string {
  if (end.kind === "crashed") {
    return "Crashed: not counted";
  }
  const words = {
    won: "Won in",
    gave_up: "Gave up after",
    turn_limit: "Out of turns after",
    context_limit: "Out of context after",
    output_limit: "Cut off after",
    refused: "No tool call after",
  } as const;
  return `${words[end.reason]} ${hopsText(hops)}`;
}

/** True if the run reached the target. */
export function isWin(end: Replay["end"]): boolean {
  return end?.end.kind === "finished" && end.end.reason === "won";
}

function hopsText(hops: number): string {
  return `${hops} ${hops === 1 ? "hop" : "hops"}`;
}
