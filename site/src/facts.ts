// The figures the page's prose quotes, read from the data rather than typed
// into the copy, so the words can't drift from the results.

import type { Board, SiteData } from "@harness/site-data/leaderboards.ts";
import { formatNumber, money, percent, points } from "./format.ts";

export type Facts = {
  models: string;
  labs: string;
  races: string;
  repeats: string;
  runs: string;
  runsPerModel: string;
  maxTurns: string;
  maxContextChars: string;
  maxOutputTokens: string;
  fix: FixFacts;
};

/** The story's before and after: the original prompt against the one that states the order. */
export type FixFacts = {
  rateBefore: string;
  rateAfter: string;
  outputBefore: string;
  outputAfter: string;
  costBefore: string;
  costAfter: string;
  p: string;
  range: string;
};

/** Every fact, from the model board's size, the limits every run had, and the prompt board. */
export function factsOf(data: SiteData): Facts {
  const models = boardOf(data, "models");
  const runs = data.boards.reduce(
    (sum, board) =>
      sum + board.entries.reduce((n, entry) => n + entry.score.decided + entry.score.crashed + entry.score.killed, 0),
    0,
  );
  return {
    models: String(models.entries.length),
    labs: String(new Set(models.entries.map((entry) => entry.model.lab)).size),
    races: String(data.races.length),
    repeats: String(models.repeats),
    runs: formatNumber(runs),
    runsPerModel: String(models.races.length * models.repeats),
    maxTurns: String(models.limits.maxTurns),
    maxContextChars: formatNumber(models.limits.maxContextChars),
    maxOutputTokens: formatNumber(models.limits.maxOutputTokens),
    fix: fixFacts(boardOf(data, "prompts")),
  };
}

/**
 * A board by id.
 *
 * @throws If the data has no such board: build-site and the page disagree.
 */
export function boardOf(data: SiteData, id: string): Board {
  const board = data.boards.find((candidate) => candidate.id === id);
  if (board === undefined) {
    throw new Error(`The site data has no "${id}" board`);
  }
  return board;
}

/**
 * The prompt board's baseline and its one variant.
 *
 * @throws If the board isn't one baseline and one variant with a gap.
 */
function fixFacts(board: Board): FixFacts {
  const before = board.entries.find((entry) => entry.vsBaseline === null);
  const after = board.entries.find((entry) => entry.vsBaseline !== null);
  const gap = after?.vsBaseline;
  if (before === undefined || after === undefined || !gap || gap.interval === null || gap.p === null) {
    throw new Error("The prompt board needs a baseline and one variant with a gap");
  }
  const rate = (value: number | null) => (value === null ? "–" : percent(value));
  const cost = (value: number | null) => (value === null ? "–" : money(value));
  return {
    rateBefore: rate(before.score.successRate),
    rateAfter: rate(after.score.successRate),
    outputBefore: String(before.endReasons.output_limit),
    outputAfter: String(after.endReasons.output_limit),
    costBefore: cost(before.costPerWin),
    costAfter: cost(after.costPerWin),
    p: gap.p < 0.001 ? "< 0.001" : gap.p.toFixed(3),
    range: `${points(gap.interval.low)} and ${points(gap.interval.high)}`,
  };
}
