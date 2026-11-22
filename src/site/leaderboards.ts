// The site's leaderboards, built from committed sweeps with the same code as
// compare-evals, so the site can't show a number the command line wouldn't.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { EndReason } from "../agent/agent.ts";
import { rankEvals, type Ranked } from "../evals/compare.ts";
import type { Interval } from "../evals/intervals.ts";
import type { Difficulty, RaceSpec } from "../evals/race-set.ts";
import { loadEval, type LoadedEval } from "../evals/report.ts";
import type { EvalManifest } from "../evals/run-eval.ts";
import type { Averages, Behaviour, Score } from "../evals/score.ts";
import { reasoningLabel } from "../models/models.ts";

/** Which sweep each leaderboard shows: the current ones in results/README.md. */
export const BOARDS: BoardSpec[] = [
  { id: "models", title: "Models", sweep: "2026-11-20-sweep-v2" },
  { id: "strategies", title: "Context strategies", sweep: "2026-11-21-strategies" },
  { id: "prompts", title: "Prompts", sweep: "2026-11-22-prompts" },
];

/** A leaderboard to build: every eval in one sweep folder, ranked together. */
export type BoardSpec = { id: string; title: string; sweep: string };

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
  /** The eval's folder name inside the sweep, which the replays will use. */
  eval: string;
  model: { id: string; name: string; lab: string; provider: string; reasoning: string };
  context: string;
  prompt: string;
  promptHash: string;
  score: Score;
  interval: Interval | null;
  vsNext: Interval | null;
  averages: Averages | null;
  costPerWin: number | null;
  endReasons: Record<EndReason, number>;
  behaviour: Behaviour | null;
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
    entries: ranked.map((entry) => entryOf(entry, folderOf.get(entry.eval)!)),
  };
}

/** One ranked eval as a site row. */
function entryOf(entry: Ranked, folder: string): BoardEntry {
  const { model, contextStrategy, promptVariant, promptHash } = entry.eval.manifest;
  return {
    rank: entry.rank,
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
    score: entry.score,
    interval: entry.interval,
    vsNext: entry.vsNext,
    averages: entry.averages,
    costPerWin: entry.costPerWin,
    endReasons: entry.endReasons,
    behaviour: entry.behaviour,
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
