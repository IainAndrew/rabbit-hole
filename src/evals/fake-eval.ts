// Fakes for testing evals without a model or the network: race specs on the
// fake Wikipedia, scripted models, and an eval run into a temp directory.

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CallModel } from "../agent/agent.ts";
import { runEval, type EvalManifest, type EvalOptions } from "./run-eval.ts";
import type { RaceSpec } from "./race-set.ts";
import { buildModel } from "../models/models.ts";
import { OpenRouterError, type ChatResult } from "../models/openrouter.ts";
import { fakeLinks } from "../wikipedia/fake-wikipedia.ts";

/** A race on the fake Wikipedia that wins with two moves. */
export function fakeRace(id: string): RaceSpec {
  return {
    id,
    difficulty: "medium",
    start: "Guinness",
    target: "Albert Einstein",
    knownPath: ["Guinness", "Republic of Ireland", "Einstein"],
    measured: { twoHopRoutes: 1, complete: true, examples: [], measuredOn: "2026-11-16" },
  };
}

/** Moves to Republic of Ireland, then Einstein, charging `cost` per call. */
export function winningModel(cost: number | null): CallModel {
  return async (messages) => {
    const moves = messages.filter((message) => message.role === "assistant").length;
    return moveReply(moves === 0 ? "Republic of Ireland" : "Einstein", cost);
  };
}

/** Fails every call the way OpenRouter does with this HTTP status. */
export function failingModel(status: number): CallModel {
  return async () => {
    throw new OpenRouterError("boom", status);
  };
}

/**
 * Run an eval of two fake races, 2 repeats each, into a new temp directory.
 *
 * @returns The directory, the running eval, and a reader for its eval.json.
 */
export function fakeEval(callModel: CallModel, options: Partial<EvalOptions> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "eval-test-"));
  const run = runEval({
    dir,
    model: buildModel,
    races: [fakeRace("a"), fakeRace("b")],
    repeats: 2,
    maxCost: 1,
    callModel,
    getLinks: fakeLinks,
    limits: { maxTurns: 5, maxContextChars: 330_000, maxOutputTokens: 100 },
    git: { gitCommit: "abc123", gitDirty: false },
    log: () => {},
    ...options,
  });
  const manifest = (): EvalManifest => JSON.parse(readFileSync(join(dir, "eval.json"), "utf8"));
  return { dir, run, manifest };
}

/** A reply that calls move_to once. */
function moveReply(page: string, cost: number | null): ChatResult {
  return {
    content: null,
    reasoning: null,
    reasoningDetails: null,
    toolCalls: [{ id: `call_${page}`, name: "move_to", arguments: JSON.stringify({ page }) }],
    finishReason: "tool_calls",
    usage: { promptTokens: 100, cachedTokens: 0, completionTokens: 10, reasoningTokens: 0, cost },
    provider: "fake",
    generationId: null,
    attempts: 1,
    durationMs: 0,
  };
}
