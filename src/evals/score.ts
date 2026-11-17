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
