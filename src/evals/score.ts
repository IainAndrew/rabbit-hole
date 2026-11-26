// The scoring rule. Success rate decides; fewer hops on wins breaks ties.
// Crashes and killed runs say nothing about the model, so they're counted
// apart and never as losses. Turns, tokens, cost and time are reported only.

import type { RunEndEvent } from "../agent/trace.ts";
import type { LoadedRun } from "./report.ts";

/**
 * How one run counts:
 * - `won`: reached the target.
 * - `lost`: finished any other way (gave up, a limit, refused).
 * - `crashed`: an API or network failure ended it.
 * - `killed`: the trace stops without a run_end.
 */
export type Outcome = "won" | "lost" | "crashed" | "killed";

/** A set of runs scored by the rule. */
export type Score = {
  won: number;
  /** Runs that count: won plus lost. */
  decided: number;
  /** won / decided, from 0 to 1. Null when nothing was decided. */
  successRate: number | null;
  /** Losses have no meaningful hop count, so only wins are averaged. */
  meanHopsOnWins: number | null;
  crashed: number;
  killed: number;
};

/** Per-run averages over decided runs, for reporting, never ranking. */
export type Averages = {
  turns: number;
  promptTokens: number;
  /** Null if any decided run's cost is unknown. */
  cost: number | null;
  seconds: number;
};

/**
 * How decided runs played, to explain a score rather than rank on it. Shares
 * are pooled over all runs (total refused over total attempts, say), so a run
 * with many moves weighs more than one with few.
 */
export type Behaviour = {
  /** Refused moves over move attempts; null if no run tried to move. */
  refusedMoveShare: number | null;
  /** Mean turn of the first move that worked, over runs that moved; null if none did. */
  meanFirstMoveTurn: number | null;
  /** Runs that never made a move that worked. */
  neverMoved: number;
  /**
   * Cached prompt tokens over all prompt tokens: how much the provider's cache
   * served. A provider that doesn't report cached tokens counts as 0 here.
   */
  cachedShare: number;
};

/**
 * How close wins came to the shortest route between their pages. Raw hops
 * depend on which races a model won (a model that only wins 2-hop races
 * averages 2 hops), so this is the fairer way to compare how directly models
 * move. Reported only: the scoring rule's tie-break stays raw hops.
 */
export type Routes = {
  /** Hops beyond the shortest route, averaged over wins: 0 means every win was a shortest route. */
  meanExtraHops: number;
  /** Wins that took a shortest route, from 0 to 1. */
  shortestShare: number;
};

/** How a run counts under the scoring rule. */
export function outcomeOf(run: LoadedRun): Outcome {
  if (!run.end) {
    return "killed";
  }
  const { end } = run.end;
  if (end.kind === "crashed") {
    return "crashed";
  }
  return end.reason === "won" ? "won" : "lost";
}

/** Score any set of runs: a race, a tier, a repeat, or the whole eval. */
export function scoreRuns(runs: LoadedRun[]): Score {
  const count = (outcome: Outcome) => runs.filter((run) => outcomeOf(run) === outcome).length;
  const ends = decidedEnds(runs);
  const wins = ends.filter((end) => end.end.kind === "finished" && end.end.reason === "won");
  return {
    won: wins.length,
    decided: ends.length,
    successRate: ends.length === 0 ? null : wins.length / ends.length,
    meanHopsOnWins: wins.length === 0 ? null : mean(wins.map((end) => end.hops)),
    crashed: count("crashed"),
    killed: count("killed"),
  };
}

/**
 * Wins measured against each race's shortest route; null if nothing was won.
 *
 * @param shortest The fewest hops between a race's pages, by race id.
 * @throws If a won race has no shortest route: the comparison would be made up.
 */
export function routesOf(runs: LoadedRun[], shortest: ReadonlyMap<string, number>): Routes | null {
  const extras: number[] = [];
  for (const run of runs) {
    if (outcomeOf(run) !== "won") {
      continue;
    }
    const best = shortest.get(run.raceId);
    if (best === undefined) {
      throw new Error(`No shortest route for race ${run.raceId}`);
    }
    extras.push(run.end!.hops - best);
  }
  if (extras.length === 0) {
    return null;
  }
  return {
    meanExtraHops: mean(extras),
    shortestShare: extras.filter((extra) => extra <= 0).length / extras.length,
  };
}

/** Averages over the decided runs; null if there are none. */
export function averagesOf(runs: LoadedRun[]): Averages | null {
  const ends = decidedEnds(runs);
  if (ends.length === 0) {
    return null;
  }
  const costs = ends.map((end) => end.totals.cost);
  const known = costs.filter((cost): cost is number => cost !== null);
  return {
    turns: mean(ends.map((end) => end.turns)),
    promptTokens: mean(ends.map((end) => end.totals.promptTokens)),
    cost: known.length === costs.length ? mean(known) : null,
    seconds: mean(ends.map((end) => end.totals.durationMs / 1000)),
  };
}

/** How the decided runs played; null if there are none. */
export function behaviourOf(runs: LoadedRun[]): Behaviour | null {
  const decided = runs.filter((run) => outcomeOf(run) === "won" || outcomeOf(run) === "lost");
  if (decided.length === 0) {
    return null;
  }
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const attempts = sum(decided.map((run) => run.moves.attempts));
  const firstTurns = decided.flatMap((run) => (run.moves.firstTurn === null ? [] : [run.moves.firstTurn]));
  const ends = decidedEnds(decided);
  const promptTokens = sum(ends.map((end) => end.totals.promptTokens));
  return {
    refusedMoveShare: attempts === 0 ? null : sum(decided.map((run) => run.moves.refused)) / attempts,
    meanFirstMoveTurn: firstTurns.length === 0 ? null : mean(firstTurns),
    neverMoved: decided.length - firstTurns.length,
    cachedShare: promptTokens === 0 ? 0 : sum(ends.map((end) => end.totals.cachedTokens)) / promptTokens,
  };
}

/** The run_end of every run that counts: won or lost. */
function decidedEnds(runs: LoadedRun[]): RunEndEvent[] {
  const ends: RunEndEvent[] = [];
  for (const run of runs) {
    if (run.end && run.end.end.kind === "finished") {
      ends.push(run.end);
    }
  }
  return ends;
}

/** The mean of a non-empty list. */
function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
