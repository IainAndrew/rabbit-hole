// Replays for the site: each trace turned into one small file the browser
// loads when a run is opened, and an index of every run in an eval. Link
// lists are cut to their first line ("Links on X (N):"), which is almost all
// of a trace's size; everything the model wrote is kept whole.

import type { RunEnd } from "../agent/agent.ts";
import type { RunEndEvent, RunStartEvent, TraceLine } from "../agent/trace.ts";
import type { LoadedRun } from "../evals/report.ts";
import { outcomeOf, type Outcome } from "../evals/score.ts";
import { linksTitle } from "../race/tools.ts";
import type { Usage } from "../models/openrouter.ts";

/** One run as the site replays it. */
export type Replay = {
  start: Pick<
    RunStartEvent,
    "start" | "target" | "systemPrompt" | "promptHash" | "promptVariant" | "contextStrategy" | "gitCommit" | "limits"
  > & { model: { id: string; name: string } };
  turns: ReplayTurn[];
  /** Null if the run was killed before it finished. */
  end: Omit<RunEndEvent, "type"> | null;
};

/** One model call and the tool calls it asked for. */
export type ReplayTurn = {
  turn: number;
  /** Milliseconds since the run started, when the model call returned. */
  t: number;
  durationMs: number;
  provider: string | null;
  contextChars: number;
  finishReason: string | null;
  content: string | null;
  reasoning: string | null;
  usage: Usage;
  calls: ReplayCall[];
};

/** One tool call. `result` is the text the model saw, unless `trimmed`. */
export type ReplayCall = {
  name: string;
  /** Raw, as the model wrote it, so malformed calls show as they were. */
  arguments: string;
  status: "ok" | "error" | "not_run";
  result: string;
  /** True when a link list was cut to its first line. */
  trimmed: boolean;
  pageAfter: string;
};

/** One run in an eval's index: enough to list it and open its replay. */
export type RunSummary = {
  /** The replay's file name without ".json", from the trace's. */
  file: string;
  raceId: string;
  repeat: number;
  outcome: Outcome;
  /** How it ended: an end reason, or the crash cause. Null if killed. */
  ending: string | null;
  hops: number | null;
  turns: number | null;
  cost: number | null;
};

/**
 * Turn a trace's events into a replay.
 *
 * @throws If the first event isn't run_start, or a tool call comes before any
 *   model call: the trace is malformed.
 */
export function replayOf(events: TraceLine[]): Replay {
  const [first, ...rest] = events;
  if (first?.type !== "run_start") {
    throw new Error("A trace must begin with run_start");
  }
  const turns: ReplayTurn[] = [];
  let end: Replay["end"] = null;
  for (const event of rest) {
    if (event.type === "model_call") {
      const { turn, t, durationMs, provider, contextChars, finishReason, content, reasoning, usage } = event;
      turns.push({ turn, t, durationMs, provider, contextChars, finishReason, content, reasoning, usage, calls: [] });
    } else if (event.type === "tool_call") {
      const current = turns.at(-1);
      if (current === undefined) {
        throw new Error(`Tool call ${event.callId} comes before any model call`);
      }
      current.calls.push(callOf(event.name, event.arguments, event.status, event.result, event.pageAfter));
    } else if (event.type === "run_end") {
      const { type, t, ...kept } = event;
      end = kept;
    }
  }
  return { start: startOf(first), turns, end };
}

/** A tool call with any link list cut to its header line. */
function callOf(name: string, args: string, status: ReplayCall["status"], result: string, pageAfter: string): ReplayCall {
  const trimmed = status === "ok" && linksTitle(result) !== null;
  return { name, arguments: args, status, result: trimmed ? result.split("\n")[0]! : result, trimmed, pageAfter };
}

/** The parts of run_start a replay shows. */
function startOf(event: RunStartEvent): Replay["start"] {
  const { start, target, systemPrompt, promptHash, promptVariant, contextStrategy, gitCommit, limits } = event;
  return {
    model: { id: event.model.id, name: event.model.name },
    start,
    target,
    systemPrompt,
    promptHash,
    promptVariant,
    contextStrategy,
    gitCommit,
    limits,
  };
}

/** A loaded run as a line in its eval's index. */
export function summaryOf(run: LoadedRun): RunSummary {
  return {
    file: run.trace.replace(/\.jsonl$/, ""),
    raceId: run.raceId,
    repeat: run.repeat,
    outcome: outcomeOf(run),
    ending: run.end === null ? null : endingOf(run.end.end),
    hops: run.end?.hops ?? null,
    turns: run.end?.turns ?? null,
    cost: run.end?.totals.cost ?? null,
  };
}

/** An end reason, or what caused a crash. */
function endingOf(end: RunEnd): string {
  return end.kind === "finished" ? end.reason : end.cause;
}
