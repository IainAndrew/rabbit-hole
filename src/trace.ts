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

function slug(text: string): string {
  return text.replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}
