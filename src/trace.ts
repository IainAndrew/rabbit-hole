// Traces: one JSONL file per run, one event per line. The trace is the record
// of a run; reports, replays and the site are all derived from it.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunEnd } from "./agent.ts";
import type { Model } from "./models.ts";
import type { ModelToolCall, Usage } from "./openrouter.ts";

export type TraceEvent = RunStartEvent | ModelCallEvent | ToolCallEvent | RunEndEvent;

// Everything needed to know which results can be compared with which.
export type RunStartEvent = {
  type: "run_start";
  model: Model;
  start: string;
  target: string;
  systemPrompt: string;
  // Covers the system prompt, the opening message and the tool definitions.
  promptHash: string;
  gitCommit: string;
  // Uncommitted changes mean the commit alone doesn't describe the code.
  gitDirty: boolean;
  limits: { maxTurns: number; maxPromptTokens: number; maxOutputTokens: number };
};

export type ModelCallEvent = {
  type: "model_call";
  turn: number;
  provider: string | null;
  // OpenRouter's id for this call, to look it up in their dashboard.
  generationId: string | null;
  // More than 1 means time was spent waiting on retries, not on the model.
  attempts: number;
  durationMs: number;
  finishReason: string | null;
  content: string | null;
  reasoning: string | null;
  toolCalls: ModelToolCall[];
  usage: Usage;
};

export type ToolCallEvent = {
  type: "tool_call";
  turn: number;
  callId: string;
  name: string;
  // Raw, as the model wrote it, even if it doesn't parse.
  arguments: string;
  // The full text the model was shown.
  result: string;
  status: "ok" | "error" | "not_run";
  durationMs: number;
  pageBefore: string;
  pageAfter: string;
};

export type RunEndEvent = {
  type: "run_end";
  end: RunEnd;
  path: string[];
  hops: number;
  turns: number;
  totals: Totals;
};

export type Totals = {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  // Null if any call's cost wasn't reported, rather than a total that's too low.
  cost: number | null;
  // Time in the loop, after the start and target pages were fetched.
  durationMs: number;
};

// Opens a new trace file and returns a function that appends one event to it.
// Each line carries `t`, milliseconds since the trace was opened. Lines are
// written as they happen, so a run that dies part-way still leaves a record.
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

export function gitState(): { gitCommit: string; gitDirty: boolean } {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  return { gitCommit: git("rev-parse", "HEAD"), gitDirty: git("status", "--porcelain") !== "" };
}

// An event as read back from a file, with its time stamp.
export type TraceLine = TraceEvent & { t: number };

// The fields each event type must have, by dotted path. A file is outside
// data: it may be hand-edited, cut short, or from an older version of the
// format. These are the fields the replay relies on.
const requiredFields: Record<TraceEvent["type"], Record<string, string>> = {
  run_start: {
    "model.id": "string",
    start: "string",
    target: "string",
    promptHash: "string",
    gitCommit: "string",
    gitDirty: "boolean",
    "limits.maxPromptTokens": "number",
  },
  model_call: { turn: "number", toolCalls: "array", "usage.promptTokens": "number", durationMs: "number" },
  tool_call: { turn: "number", name: "string", arguments: "string", result: "string", status: "string", pageAfter: "string" },
  run_end: { "end.kind": "string", path: "array", hops: "number", turns: "number", "totals.promptTokens": "number" },
};

// Parse a trace file's text, checking each line before anything trusts it.
export function parseTrace(text: string): TraceLine[] {
  return text
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== "")
    .map(({ line, number }) => parseLine(line, number));
}

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
    if (!ok) throw new Error(`Trace line ${number} (${event.type}): "${path}" should be ${kind}`);
  }
  return event as TraceLine;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function slug(text: string): string {
  return text.replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}
