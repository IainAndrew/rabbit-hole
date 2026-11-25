// The site's leaderboards, built from committed sweeps with the same code as
// compare-evals, so the site can't show a number the command line wouldn't.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { EndReason } from "../agent/agent.ts";
import { evalLabel, gapToBaseline, rankEvals, type BaselineGap, type RankRange, type Ranked } from "../evals/compare.ts";
import type { Interval } from "../evals/intervals.ts";
import type { Difficulty, RaceSpec } from "../evals/race-set.ts";
import { loadEval, type LoadedEval } from "../evals/report.ts";
import type { EvalManifest } from "../evals/run-eval.ts";
import type { Averages, Behaviour, Score } from "../evals/score.ts";
import { reasoningLabel } from "../models/models.ts";

/** Which sweep each leaderboard shows: the current ones in results/README.md. */
export const BOARDS: BoardSpec[] = [
  { id: "models", title: "Models", sweep: "2026-11-20-sweep-v2" },
  {
    id: "strategies",
    title: "Context strategies",
    sweep: "2026-11-21-strategies",
    baseline: { varies: "context", value: "full" },
  },
  { id: "prompts", title: "Prompts", sweep: "2026-11-22-prompts", baseline: { varies: "prompt", value: "fewest-hops" } },
];

/** A leaderboard to build: every eval in one sweep folder, ranked together. */
export type BoardSpec = { id: string; title: string; sweep: string; baseline?: Baseline };

/**
 * What each eval on a board is measured against: the same model with the
 * varied setting at its usual value (full history, or the original prompt).
 */
export type Baseline = { varies: "context" | "prompt"; value: string };

/** Everything the site's leaderboards read. */
export type SiteData = { races: SiteRace[]; boards: Board[] };

/** A race as the site shows it, with its measured shortest distance. */
export type SiteRace = {
  id: string;
  start: string;
  target: string;
  difficulty: Difficulty;
  distance: number;
  targetBacklinks: number;
};

/** One ranked sweep, with the setup every eval in it shares. */
export type Board = {
  id: string;
  title: string;
  sweep: string;
  /** What each eval is measured against, on a strategy or prompt board. */
  baseline?: Baseline;
  commit: string;
  repeats: number;
  limits: EvalManifest["limits"];
  races: EvalManifest["races"];
  entries: BoardEntry[];
};

/** One eval in a sweep, with the folder it was loaded from. */
export type SweepEval = { folder: string; loaded: LoadedEval };

/** One eval's row: the ranking and everything reported beside it. */
export type BoardEntry = {
  rank: number;
  rankRange: RankRange;
  /** The eval's folder name inside the sweep, which the replays will use. */
  eval: string;
  model: { id: string; name: string; lab: string; provider: string; reasoning: string };
  context: string;
  prompt: string;
  promptHash: string;
  /** The prompt's text, so the site quotes it rather than paraphrasing it. */
  systemPrompt: string | null;
  score: Score;
  interval: Interval | null;
  vsNext: Interval | null;
  vsNextP: number | null;
  averages: Averages | null;
  costPerWin: number | null;
  endReasons: Record<EndReason, number>;
  behaviour: Behaviour | null;
  /** The gap to this eval's baseline. Null on the baseline itself, or a board without one. */
  vsBaseline: BaselineGap | null;
};

/**
 * Load every eval in a sweep folder. Each subfolder is one eval.
 *
 * @throws If a subfolder isn't a loadable eval (see loadEval).
 */
export function loadSweep(dir: string): SweepEval[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((folder) => ({ folder, loaded: loadEval(join(dir, folder)) }));
}

/**
 * Rank a sweep's evals and keep what the site shows.
 *
 * @throws If the evals can't be compared (see checkComparable).
 */
export function buildBoard(spec: BoardSpec, sweep: SweepEval[]): Board {
  const folderOf = new Map(sweep.map(({ folder, loaded }) => [loaded, folder]));
  const ranked = rankEvals(sweep.map(({ loaded }) => loaded));
  // rankEvals has checked these are the same for every eval.
  const { manifest } = ranked[0]!.eval;
  return {
    ...spec,
    commit: manifest.gitCommit,
    repeats: manifest.repeats,
    limits: manifest.limits,
    races: manifest.races,
    entries: ranked.map((entry) => {
      const base = spec.baseline ? baselineOf(entry.eval, ranked.map((other) => other.eval), spec.baseline) : null;
      return entryOf(entry, folderOf.get(entry.eval)!, base === null ? null : gapToBaseline(entry.eval, base));
    }),
  };
}

/**
 * The eval `loaded` is measured against: same model, same everything else,
 * the varied setting at the baseline's value. Null if `loaded` is the baseline.
 *
 * @throws If the sweep has no such eval: the board can't show the gap.
 */
function baselineOf(loaded: LoadedEval, evals: LoadedEval[], baseline: Baseline): LoadedEval | null {
  const varied = (other: LoadedEval) =>
    baseline.varies === "context" ? other.manifest.contextStrategy : other.manifest.promptVariant;
  const fixed = (other: LoadedEval) =>
    baseline.varies === "context" ? other.manifest.promptVariant : other.manifest.contextStrategy;
  if (varied(loaded) === baseline.value) {
    return null;
  }
  const found = evals.find(
    (other) =>
      other.manifest.model.id === loaded.manifest.model.id && fixed(other) === fixed(loaded) && varied(other) === baseline.value,
  );
  if (found === undefined) {
    throw new Error(`${evalLabel(loaded)} has no baseline in its sweep (${baseline.varies} ${baseline.value})`);
  }
  return found;
}

/** One ranked eval as a site row. */
function entryOf(entry: Ranked, folder: string, vsBaseline: BaselineGap | null): BoardEntry {
  const { model, contextStrategy, promptVariant, promptHash } = entry.eval.manifest;
  return {
    rank: entry.rank,
    rankRange: entry.rankRange,
    eval: folder,
    model: {
      id: model.id,
      name: model.name,
      lab: model.lab,
      provider: model.provider,
      reasoning: reasoningLabel(model.reasoning),
    },
    context: contextStrategy,
    prompt: promptVariant,
    promptHash,
    // loadEval has checked every run had the same prompt.
    systemPrompt: entry.eval.runs[0]?.start.systemPrompt ?? null,
    score: entry.score,
    interval: entry.interval,
    vsNext: entry.vsNext,
    vsNextP: entry.vsNextP,
    averages: entry.averages,
    costPerWin: entry.costPerWin,
    endReasons: entry.endReasons,
    behaviour: entry.behaviour,
    vsBaseline,
  };
}

/**
 * The races the boards were run on, from races.json.
 *
 * @throws If a board ran a race races.json doesn't have, or has with another
 *   tier: the race set changed after the sweep, so its details would be wrong.
 */
export function racesOf(boards: Board[], raceSet: RaceSpec[]): SiteRace[] {
  const byId = new Map(raceSet.map((race) => [race.id, race]));
  const used = new Map<string, SiteRace>();
  for (const board of boards) {
    for (const ran of board.races) {
      const race = byId.get(ran.id);
      if (race === undefined || race.difficulty !== ran.difficulty) {
        throw new Error(`${board.sweep} ran race ${ran.id} (${ran.difficulty}), which races.json no longer has as that`);
      }
      used.set(race.id, siteRace(race));
    }
  }
  return [...used.values()];
}

/** A race spec as the site shows it. */
function siteRace(race: RaceSpec): SiteRace {
  return {
    id: race.id,
    start: race.start,
    target: race.target,
    difficulty: race.difficulty,
    distance: race.measured.distance,
    targetBacklinks: race.measured.targetBacklinks,
  };
}
