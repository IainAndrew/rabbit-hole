// Read an eval back from disk: its manifest and every run's trace, checked
// to be one model, one prompt and one commit before anything is counted.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalManifest, ManifestRun } from "./run-eval.ts";
import { parseTrace, strategyName, type RunEndEvent, type RunStartEvent, type TraceLine } from "../agent/trace.ts";

/** One run, as its trace tells it. */
export type LoadedRun = ManifestRun & {
  start: RunStartEvent;
  /** Null if the run was killed before it finished. */
  end: RunEndEvent | null;
  moves: Moves;
};

/** How a run moved: the facts behind why it won or lost, not part of the score. */
export type Moves = {
  /** move_to calls that ran, legal or not. */
  attempts: number;
  /** Attempts the rules refused: not a link here, a red link, or bad arguments. */
  refused: number;
  /** The turn of the first move that worked; null if the run never moved. */
  firstTurn: number | null;
};

/** An eval read back: its manifest and its runs, in the order they ran. */
export type LoadedEval = { manifest: EvalManifest; runs: LoadedRun[] };

/**
 * Load an eval directory and check every trace belongs with the rest.
 *
 * @param dir The eval's directory, holding eval.json and its traces.
 * @throws If eval.json is malformed, a trace is missing or malformed, or a
 *   trace was made with a different model, context strategy, prompt or
 *   commit, or with uncommitted code: such runs can't be compared.
 */
export function loadEval(dir: string): LoadedEval {
  const manifest = parseManifest(JSON.parse(readFileSync(join(dir, "eval.json"), "utf8")));
  const runs = manifest.runs.map((run) => {
    const events = parseTrace(readFileSync(join(dir, run.trace), "utf8"));

    const start = events[0];
    if (start?.type !== "run_start") {
      throw new Error(`${run.trace} doesn't begin with run_start`);
    }
    checkComparable(run.trace, start, manifest);

    const last = events.at(-1);
    const end = last?.type === "run_end" ? last : null;
    return { ...run, start, end, moves: movesOf(events) };
  });
  return { manifest, runs };
}

/** Count a run's move attempts from its tool calls. Calls that weren't run don't count. */
export function movesOf(events: TraceLine[]): Moves {
  const moves: Moves = { attempts: 0, refused: 0, firstTurn: null };
  for (const event of events) {
    if (event.type !== "tool_call" || event.name !== "move_to" || event.status === "not_run") {
      continue;
    }
    moves.attempts++;
    if (event.status === "error") {
      moves.refused++;
    } else if (moves.firstTurn === null) {
      moves.firstTurn = event.turn;
    }
  }
  return moves;
}

/**
 * Check a run was made the same way as the rest of the eval.
 *
 * @param file The trace's file name, for error messages.
 * @throws If the model, context strategy, prompt or commit differs, or the
 *   code was uncommitted.
 */
function checkComparable(file: string, start: RunStartEvent, manifest: EvalManifest): void {
  const mismatch = (what: string, found: string, expected: string) => {
    return new Error(`${file} was made with ${what} ${found}, the eval with ${expected}: they can't be compared`);
  };

  if (start.model.id !== manifest.model.id) {
    throw mismatch("model", start.model.id, manifest.model.id);
  }
  if (start.contextStrategy !== manifest.contextStrategy) {
    throw mismatch("context strategy", start.contextStrategy, manifest.contextStrategy);
  }
  if (start.promptHash !== manifest.promptHash) {
    throw mismatch("prompt", start.promptHash, manifest.promptHash);
  }
  if (start.gitCommit !== manifest.gitCommit) {
    throw mismatch("commit", start.gitCommit, manifest.gitCommit);
  }
  if (start.gitDirty) {
    throw new Error(`${file} was made with uncommitted code`);
  }
}

/** eval.json is outside data: check the fields the report relies on. */
function parseManifest(value: unknown): EvalManifest {
  const bad = (why: string) => {
    return new Error(`Malformed eval.json: ${why}`);
  };

  if (!isRecord(value) || !isRecord(value.model) || typeof value.model.id !== "string") {
    throw bad("no model");
  }
  if (typeof value.promptHash !== "string" || typeof value.gitCommit !== "string") {
    throw bad("no prompt hash or commit");
  }
  if (typeof value.plannedRuns !== "number" || typeof value.maxCost !== "number") {
    throw bad("no plan");
  }
  if (value.stop !== null && typeof value.stop !== "string") {
    throw bad('"stop" must be a reason or null');
  }
  if (!Array.isArray(value.runs)) {
    throw bad("no runs");
  }
  value.contextStrategy = strategyName(value.contextStrategy, "Malformed eval.json");
  for (const run of value.runs) {
    if (
      !isRecord(run) ||
      typeof run.raceId !== "string" ||
      typeof run.difficulty !== "string" ||
      typeof run.repeat !== "number" ||
      typeof run.trace !== "string"
    ) {
      throw bad("a run needs raceId, difficulty, repeat and trace");
    }
  }
  return value as EvalManifest;
}

/** True for any non-null object, so its fields can be read and checked. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
