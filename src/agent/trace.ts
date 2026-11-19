// Traces: one JSONL file per run, one event per line. The trace is the record
// of a run; reports, replays and the site are all derived from it.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunEnd } from "./agent.ts";
import type { Model } from "../models/models.ts";
import type { ModelToolCall, Usage } from "../models/openrouter.ts";

/** One line of a trace. A run writes run_start, then model and tool calls, then run_end. */
export type TraceEvent = RunStartEvent | ModelCallEvent | ToolCallEvent | RunEndEvent;

/** Everything needed to know which results can be compared with which. */
export type RunStartEvent = {
  type: "run_start";
  /** The registry entry, copied whole so the trace stands alone. */
  model: Model;
  /** The start title as given, before redirects are resolved. */
  start: string;
  /** The target title as given, before redirects are resolved. */
  target: string;
  systemPrompt: string;
  /** Covers the system prompt, the opening message and the tool definitions. */
  promptHash: string;
  /** The harness commit the run was made with. */
  gitCommit: string;
  /** Uncommitted changes mean the commit alone doesn't describe the code. */
  gitDirty: boolean;
  /** maxOutputTokens caps one reply, reasoning included. */
  limits: { maxTurns: number; maxContextChars: number; maxOutputTokens: number };
};

/** One call to the model and its full reply. */
export type ModelCallEvent = {
  type: "model_call";
  /** Counts from 1. A turn is one model call and the tool calls it asked for. */
  turn: number;
  /** Size of the prompt sent, in characters, the measure the context limit uses. */
  contextChars: number;
  /** Which upstream provider OpenRouter routed the call to. */
  provider: string | null;
  /** OpenRouter's id for this call, to look it up in their dashboard. */
  generationId: string | null;
  /** More than 1 means time was spent waiting on retries, not on the model. */
  attempts: number;
  /** Retry waits included. */
  durationMs: number;
  /** "tool_calls", "stop", "length" (hit the output cap), and others. */
  finishReason: string | null;
  /** Text the model wrote alongside its tool calls, if any. */
  content: string | null;
  /** The model's thinking, when the provider returns it as text. */
  reasoning: string | null;
  toolCalls: ModelToolCall[];
  usage: Usage;
};

/** One tool call, what it returned, and where the race stood around it. */
export type ToolCallEvent = {
  type: "tool_call";
  /** The turn whose model call asked for this. */
  turn: number;
  /** Pairs this call with the model's request for it. */
  callId: string;
  name: string;
  /** Raw, as the model wrote it, even if it doesn't parse. */
  arguments: string;
  /** The full text the model was shown. */
  result: string;
  /**
   * "error" is a mistake the model could recover from. "not_run" is a call
   * that came after the race had ended in the same turn.
   */
  status: "ok" | "error" | "not_run";
  durationMs: number;
  /** The current page before the call. */
  pageBefore: string;
  /** The current page after it: different only after a move. */
  pageAfter: string;
};

/** How the run ended, with its totals. Missing if the process was killed. */
export type RunEndEvent = {
  type: "run_end";
  end: RunEnd;
  /** Every page visited, canonical titles, start first. */
  path: string[];
  hops: number;
  /** Model calls made. */
  turns: number;
  totals: Totals;
};

/**
 * A run's sums over every model call. A cached or reasoning count a provider
 * didn't report adds 0; an unreported cost doesn't (see below).
 */
export type Totals = {
  /** Summed over calls, so the shared start of the conversation is counted every turn. */
  promptTokens: number;
  /** The part of promptTokens served from the provider's cache, billed cheaper. */
  cachedTokens: number;
  /** Everything generated, reasoning included. */
  completionTokens: number;
  reasoningTokens: number;
  /** Dollars. Null if any call's cost wasn't reported, rather than a total that's too low. */
  cost: number | null;
  /** Time in the loop, after the start and target pages were fetched. */
  durationMs: number;
};

/**
 * Open a new trace file and return a function that appends one event to it.
 * Each line carries `t`, milliseconds since the trace was opened. Lines are
 * written as they happen, so a run that dies part-way still leaves a record.
 *
 * @param dir Where to write it; created if missing.
 * @param name Describes the run in the file name, after a timestamp.
 * @throws If the file already exists: a trace is never overwritten.
 */
export function openTrace(dir: string, name: string): { path: string; record: (event: TraceEvent) => void } {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${new Date().toISOString().replaceAll(":", "-")}_${slug(name)}.jsonl`);
  // "wx" fails if the file exists: a trace is never overwritten.
  writeFileSync(path, "", { flag: "wx" });
  const opened = performance.now();
  const record = (event: TraceEvent) => {
    const line = { t: Math.round(performance.now() - opened), ...event };
    appendFileSync(path, `${JSON.stringify(line)}\n`);
  };
  return { path, record };
}

/**
 * The harness commit and whether the code has uncommitted changes. Data
 * that grows during runs doesn't count: snapshot/, where a page added never
 * changes one already there, and results/, where evals write their traces.
 */
export function gitState(): { gitCommit: string; gitDirty: boolean } {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const changes = git("status", "--porcelain", "--", ".", ":(exclude)snapshot", ":(exclude)results");
  return { gitCommit: git("rev-parse", "HEAD"), gitDirty: changes !== "" };
}

/** An event as read back from a file, with `t`, ms since the trace was opened. */
export type TraceLine = TraceEvent & { t: number };

/**
 * The fields each event type must have, by dotted path. A file is outside
 * data: it may be hand-edited, cut short, or from an older version of the
 * format. These are the fields the replay relies on.
 */
const requiredFields: Record<TraceEvent["type"], Record<string, string>> = {
  run_start: {
    "model.id": "string",
    start: "string",
    target: "string",
    promptHash: "string",
    gitCommit: "string",
    gitDirty: "boolean",
    "limits.maxContextChars": "number",
  },
  model_call: { turn: "number", contextChars: "number", toolCalls: "array", "usage.promptTokens": "number", durationMs: "number" },
  tool_call: { turn: "number", name: "string", arguments: "string", result: "string", status: "string", pageAfter: "string" },
  run_end: { "end.kind": "string", path: "array", hops: "number", turns: "number", "totals.promptTokens": "number" },
};

/**
 * Parse a trace file's text, checking each line before anything trusts it.
 *
 * @throws On the first line that isn't JSON or lacks a required field.
 */
export function parseTrace(text: string): TraceLine[] {
  return text
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, number }) => parseLine(line, number));
}

/**
 * Parse and check one line.
 *
 * @param number The line number, 1-based, for error messages.
 */
function parseLine(line: string, number: number): TraceLine {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    throw new Error(`Trace line ${number} is not JSON`);
  }
  if (!isRecord(event) || typeof event.t !== "number" || typeof event.type !== "string") {
    throw new Error(`Trace line ${number} has no "t" and "type"`);
  }
  // hasOwn, so a type like "constructor" can't match the object's prototype.
  if (!Object.hasOwn(requiredFields, event.type)) {
    throw new Error(`Trace line ${number} has unknown type "${event.type}"`);
  }
  const fields = requiredFields[event.type as TraceEvent["type"]];
  for (const [path, kind] of Object.entries(fields)) {
    const value = path.split(".").reduce<unknown>((at, key) => (isRecord(at) ? at[key] : undefined), event);
    const ok = kind === "array" ? Array.isArray(value) : typeof value === kind;
    if (!ok) {
      throw new Error(`Trace line ${number} (${event.type}): "${path}" should be ${kind}`);
    }
  }
  return event as TraceLine;
}

/** True for any non-null object, so its fields can be read and checked. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Make text safe for a file name: runs of other characters become one dash. */
function slug(text: string): string {
  return text.replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}
