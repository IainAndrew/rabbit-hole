// Compare evals: check they were run the same way, then rank them by the
// scoring rule. An eval is one model under one context strategy, so evals can
// differ in either. Success rate decides, fewer hops on wins breaks ties, and
// everything else (cost, tokens, time, how runs ended) is shown, not ranked on.

import type { EndReason } from "../agent/agent.ts";
import { differenceInterval, outcomesByRace, rateInterval, type Interval } from "./intervals.ts";
import type { LoadedEval } from "./report.ts";
import { averagesOf, behaviourOf, scoreRuns, type Averages, type Behaviour, type Score } from "./score.ts";

/** One eval's place in the ranking, and what's reported beside it. */
export type Ranked = {
  /** 1 is best. Evals level on both success rate and hops share a rank. */
  rank: number;
  eval: LoadedEval;
  score: Score;
  averages: Averages | null;
  /** How the runs moved and how much the cache served: why, not how well. */
  behaviour: Behaviour | null;
  /**
   * Everything spent, crashed runs included, over the wins: what a win costs.
   * Null with no wins, or if any run's cost is unknown (a killed run has no
   * total).
   */
  costPerWin: number | null;
  /** How the decided runs ended, by reason. */
  endReasons: Record<EndReason, number>;
  /** 95% interval of the success rate. Null with nothing decided. */
  interval: Interval | null;
  /**
   * 95% interval of this success rate minus the next-ranked one, paired by
   * race. Null for the last eval. If it includes 0, the gap could be chance:
   * the order stands, but it isn't evidence that one model is better.
   */
  vsNext: Interval | null;
};

/** Names an eval by what it measures: the model and the context strategy. */
export function evalLabel(loaded: LoadedEval): string {
  return `${loaded.manifest.model.name} / ${loaded.manifest.contextStrategy}`;
}

/**
 * Check every eval was run with the same prompt, races, repeats, limits and
 * code, so a difference in score comes from the model or the context
 * strategy, not the setup. Every
 * model gets the same number of runs, the floor and ceiling included.
 *
 * @throws Naming the first eval that differs from the first one, and how.
 */
export function checkComparable(evals: LoadedEval[]): void {
  const [first, ...rest] = evals;
  if (!first) {
    throw new Error("No evals to compare");
  }
  const describe = (loaded: LoadedEval) => {
    const { manifest } = loaded;
    return {
      prompt: manifest.promptHash,
      commit: manifest.gitCommit,
      limits: JSON.stringify(manifest.limits),
      races: manifest.races.map((race) => race.id).sort().join(", "),
      repeats: String(manifest.repeats),
    };
  };
  const expected = describe(first);
  for (const other of rest) {
    const found = describe(other);
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      if (found[key] !== expected[key]) {
        throw new Error(
          `${evalLabel(other)} was run with ${key} ${found[key]}, ` +
            `${evalLabel(first)} with ${expected[key]}: they can't be compared`,
        );
      }
    }
  }
}

/** Rank comparable evals by the scoring rule, best first. */
export function rankEvals(evals: LoadedEval[]): Ranked[] {
  checkComparable(evals);
  const entries = evals.map((loaded) => {
    const outcomes = outcomesByRace(loaded.runs);
    return {
      eval: loaded,
      outcomes,
      score: scoreRuns(loaded.runs),
      averages: averagesOf(loaded.runs),
      behaviour: behaviourOf(loaded.runs),
      costPerWin: costPerWin(loaded),
      endReasons: endReasons(loaded),
      interval: rateInterval(outcomes),
    };
  });
  entries.sort((a, b) => compareScores(a.score, b.score));

  const ranked: Ranked[] = [];
  for (const [index, { outcomes, ...entry }] of entries.entries()) {
    const previous = ranked[index - 1];
    const tied = previous !== undefined && compareScores(previous.score, entry.score) === 0;
    const next = entries[index + 1];
    const vsNext = next === undefined ? null : differenceInterval(outcomes, next.outcomes);
    ranked.push({ ...entry, rank: tied ? previous.rank : index + 1, vsNext });
  }
  return ranked;
}

/**
 * The scoring rule as a sort order: higher success rate first, then fewer
 * hops on wins. Nothing decided, or no wins, sorts last.
 */
function compareScores(a: Score, b: Score): number {
  const rate = (b.successRate ?? -1) - (a.successRate ?? -1);
  if (rate !== 0) {
    return rate;
  }
  return (a.meanHopsOnWins ?? Infinity) - (b.meanHopsOnWins ?? Infinity);
}

/** Total spent over wins; null with no wins or an unknown cost. */
function costPerWin(loaded: LoadedEval): number | null {
  const wins = scoreRuns(loaded.runs).won;
  let spent = 0;
  for (const run of loaded.runs) {
    const cost = run.end?.totals.cost;
    if (cost === null || cost === undefined) {
      return null;
    }
    spent += cost;
  }
  return wins === 0 ? null : spent / wins;
}

/** Count the decided runs by how they ended. */
function endReasons(loaded: LoadedEval): Record<EndReason, number> {
  const counts: Record<EndReason, number> = {
    won: 0,
    gave_up: 0,
    turn_limit: 0,
    context_limit: 0,
    output_limit: 0,
    refused: 0,
  };
  for (const run of loaded.runs) {
    if (run.end?.end.kind === "finished") {
      counts[run.end.end.reason]++;
    }
  }
  return counts;
}
