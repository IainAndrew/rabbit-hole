// The eval loop: every race, every repeat, one model, under a spending cap.
// Each run writes its own trace; eval.json says what was planned, which trace
// is which run, and why the eval stopped.

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promptHash, runAgent, SYSTEM_PROMPT, type CallModel } from "../agent/agent.ts";
import type { LinkSource } from "../race/race.ts";
import type { RaceSpec } from "./race-set.ts";
import type { LoadedEval, LoadedRun } from "./report.ts";
import { outcomeOf } from "./score.ts";
import { openTrace } from "../agent/trace.ts";
import type { Model } from "../models/models.ts";

/** Crashes in a row that mean the setup is broken, not unlucky. */
const MAX_CRASHES_IN_A_ROW = 3;

/**
 * Tries per race and repeat, re-runs of crashes included. A run that keeps
 * crashing is probably not bad luck, and is worth reading, not retrying.
 */
const MAX_ATTEMPTS = 3;

/**
 * Why an eval stopped:
 * - `completed`: every planned run ran.
 * - `cost_cap`: spending reached maxCost, so no more runs were started.
 * - `unknown_cost`: a run's cost wasn't reported, so the cap can't be kept.
 * - `no_credits`: the account is out of credits.
 * - `unauthorized`: the API key was refused.
 * - `repeated_crashes`: several runs in a row crashed, e.g. the provider is down.
 */
export type EvalStop = "completed" | "cost_cap" | "unknown_cost" | "no_credits" | "unauthorized" | "repeated_crashes";

/** One eval to run. */
export type EvalOptions = {
  /** Where eval.json and the traces go; one directory per eval. */
  dir: string;
  model: Model;
  races: RaceSpec[];
  /** Runs per race. */
  repeats: number;
  /**
   * Dollars. Checked before each run starts, so the eval can go over by the
   * cost of its last run.
   */
  maxCost: number;
  callModel: CallModel;
  getLinks: LinkSource;
  limits: { maxTurns: number; maxPromptTokens: number; maxOutputTokens: number };
  /** Recorded in every trace; passed in so tests don't depend on the repo. */
  git: { gitCommit: string; gitDirty: boolean };
  /** One line per run as it ends, for the terminal. */
  log: (line: string) => void;
  /**
   * An unfinished eval to pick up, in the same directory. Only runs still to
   * do are run, and its eval.json grows rather than starting again.
   */
  previous?: LoadedEval;
};

/**
 * eval.json: what only the eval knows. How each run went is in its trace,
 * the single source of truth, so it isn't copied here.
 */
export type EvalManifest = {
  model: Model;
  promptHash: string;
  gitCommit: string;
  gitDirty: boolean;
  limits: EvalOptions["limits"];
  repeats: number;
  maxCost: number;
  races: { id: string; difficulty: string }[];
  /** Races × repeats. Runs that never started have no trace, only this count. */
  plannedRuns: number;
  /** Null while the eval runs, or if it was killed. */
  stop: EvalStop | null;
  /** The runs made, in order. */
  runs: ManifestRun[];
};

/** Which race and repeat a trace file is. */
export type ManifestRun = { raceId: string; difficulty: string; repeat: number; trace: string };

/**
 * The runs still to do, all races once before any twice. A race and repeat
 * is done once it has a win or a loss, or after MAX_ATTEMPTS tries. A crash
 * is re-run, never a loss: re-running losses would be picking results.
 *
 * @param previous Runs already made; none for a fresh eval.
 */
export function runsToDo(races: RaceSpec[], repeats: number, previous: LoadedRun[]): { race: RaceSpec; repeat: number }[] {
  const todo = [];
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const race of races) {
      const attempts = previous.filter((run) => run.raceId === race.id && run.repeat === repeat);
      const decided = attempts.some((run) => outcomeOf(run) === "won" || outcomeOf(run) === "lost");
      if (!decided && attempts.length < MAX_ATTEMPTS) {
        todo.push({ race, repeat });
      }
    }
  }
  return todo;
}

/**
 * Run every race `repeats` times, all races once before any twice, so an
 * eval cut short still covers every race it can. With `previous`, pick up an
 * unfinished eval instead: crashed, killed and never-started runs.
 *
 * @returns Why it stopped, what this call spent and how many runs it made.
 * @throws If `previous` was made with another model, prompt or commit.
 */
export async function runEval(options: EvalOptions): Promise<{ stop: EvalStop; spent: number; runs: number }> {
  const manifest = options.previous ? resumedManifest(options.previous.manifest, options) : freshManifest(options);
  const runsBefore = manifest.runs.length;
  let spent = 0;
  mkdirSync(options.dir, { recursive: true });
  // Rewritten after every run, so an eval that's killed still leaves a record.
  const save = () => writeFileSync(join(options.dir, "eval.json"), JSON.stringify(manifest, null, 2) + "\n");
  const stop = (reason: EvalStop) => {
    manifest.stop = reason;
    save();
    return { stop: reason, spent, runs: manifest.runs.length - runsBefore };
  };

  let crashesInARow = 0;
  for (const { race, repeat } of runsToDo(options.races, options.repeats, options.previous?.runs ?? [])) {
    if (spent >= options.maxCost) {
      return stop("cost_cap");
    }

    const trace = openTrace(options.dir, `${race.id}-r${repeat}`);
    trace.record({
      type: "run_start",
      model: options.model,
      start: race.start,
      target: race.target,
      systemPrompt: SYSTEM_PROMPT,
      promptHash: manifest.promptHash,
      ...options.git,
      limits: options.limits,
    });
    const result = await runAgent({
      start: race.start,
      target: race.target,
      callModel: options.callModel,
      getLinks: options.getLinks,
      maxTurns: options.limits.maxTurns,
      maxPromptTokens: options.limits.maxPromptTokens,
      record: trace.record,
    });

    const { end, totals } = result;
    spent += totals.cost ?? 0;
    manifest.runs.push({ raceId: race.id, difficulty: race.difficulty, repeat, trace: basename(trace.path) });
    save();
    const ending = end.kind === "finished" ? end.reason : `crashed (${end.cause})`;
    options.log(`${race.id} r${repeat}: ${ending}, $${(totals.cost ?? 0).toFixed(4)}, total $${spent.toFixed(4)}`);

    if (totals.cost === null) {
      return stop("unknown_cost");
    }
    if (end.kind === "crashed") {
      if (end.cause === "no_credits" || end.cause === "unauthorized") {
        return stop(end.cause);
      }
      crashesInARow++;
      if (crashesInARow >= MAX_CRASHES_IN_A_ROW) {
        return stop("repeated_crashes");
      }
    } else {
      crashesInARow = 0;
    }
  }
  return stop("completed");
}

/** The manifest of a new eval: the plan, and no runs yet. */
function freshManifest(options: EvalOptions): EvalManifest {
  return {
    model: options.model,
    promptHash: promptHash(),
    ...options.git,
    limits: options.limits,
    repeats: options.repeats,
    maxCost: options.maxCost,
    races: options.races.map(({ id, difficulty }) => ({ id, difficulty })),
    plannedRuns: options.races.length * options.repeats,
    stop: null,
    runs: [],
  };
}

/**
 * The manifest of an eval being picked up. Its runs are kept, its cap grows
 * by this call's cap, and it must have been made the same way as this call.
 */
function resumedManifest(previous: EvalManifest, options: EvalOptions): EvalManifest {
  if (previous.gitCommit !== options.git.gitCommit) {
    throw new Error(`The eval was made at commit ${previous.gitCommit}, this is ${options.git.gitCommit}: start a new eval`);
  }
  if (previous.promptHash !== promptHash()) {
    throw new Error("The prompt has changed since the eval was made: start a new eval");
  }
  if (previous.model.id !== options.model.id) {
    throw new Error(`The eval is of ${previous.model.id}, not ${options.model.id}`);
  }
  return { ...previous, maxCost: previous.maxCost + options.maxCost, stop: null };
}
