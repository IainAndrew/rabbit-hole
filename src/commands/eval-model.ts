// Run the race set against one model: every race, --repeats times, under a
// --max-cost cap. Billed. Refuses to start with uncommitted code, so every
// result points at a commit that describes it.
// With --resume, picks up an unfinished eval instead: crashed, killed and
// never-started runs, at the same commit.
// Usage: npm run eval-model -- --model <id> --max-cost <dollars> [--repeats 3]
//        npm run eval-model -- --resume results/<eval> --max-cost <dollars>

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { RACE_LIMITS } from "../agent/agent.ts";
import { loadEval } from "../evals/report.ts";
import { runEval, runsToDo } from "../evals/run-eval.ts";
import { parseRaceSet } from "../evals/race-set.ts";
import { toolDefinitions } from "../race/tools.ts";
import { gitState } from "../agent/trace.ts";
import { models } from "../models/models.ts";
import { chat } from "../models/openrouter.ts";
import { snapshotLinks } from "../wikipedia/snapshot.ts";
import { fetchLinks } from "../wikipedia/wikipedia.ts";

const USAGE = `Usage: npm run eval-model -- --model <id> --max-cost <dollars> [--repeats 3]
       npm run eval-model -- --resume results/<eval> --max-cost <dollars>`;

const { values } = parseArgs({
  options: {
    model: { type: "string" },
    "max-cost": { type: "string" },
    repeats: { type: "string" },
    resume: { type: "string" },
  },
});

// A resumed eval keeps its own model and repeats.
const previous = values.resume ? loadEval(values.resume) : undefined;
if (previous && (values.model || values.repeats)) {
  fail("--resume takes the model and repeats from the eval: leave out --model and --repeats");
}
const model = models.find((candidate) => candidate.id === (previous?.manifest.model.id ?? values.model));
const maxCost = Number(values["max-cost"]);
const repeats = previous?.manifest.repeats ?? Number(values.repeats ?? "3");
if (!model) {
  fail(`--model must be one of: ${models.map((m) => m.id).join(", ")}`);
}
// No default: the cap is a decision, made each time.
if (!(maxCost > 0)) {
  fail("--max-cost must be a number of dollars above 0");
}
if (!Number.isInteger(repeats) || repeats < 1) {
  fail("--repeats must be a whole number, 1 or more");
}

const git = gitState();
if (git.gitDirty) {
  console.error("Uncommitted code (outside snapshot/ and results/): commit it first, so the results point at the code that made them");
  process.exit(1);
}

const races = parseRaceSet(JSON.parse(readFileSync("races.json", "utf8")));
// Evals live in results/, committed by name when kept; runs/ is for dev races.
const dir = values.resume ?? `results/${new Date().toISOString().replaceAll(":", "-")}_${model.id.replaceAll("/", "-")}`;
const todo = runsToDo(races, repeats, previous?.runs ?? []).length;

console.log(`${model.id} on ${model.provider}: ${todo} runs to do (${races.length} races × ${repeats}), cap $${maxCost}`);
console.log(`${previous ? "Resuming" : "Writing to"} ${dir}\n`);

const result = await runEval({
  dir,
  model,
  races,
  repeats,
  maxCost,
  callModel: (messages) => chat({ model, messages, tools: toolDefinitions, maxTokens: RACE_LIMITS.maxOutputTokens }),
  getLinks: snapshotLinks("snapshot", fetchLinks),
  limits: RACE_LIMITS,
  git,
  log: (line) => console.log(line),
  ...(previous && { previous }),
});

console.log(`\nStopped: ${result.stop} after ${result.runs} of ${todo} runs, $${result.spent.toFixed(4)} spent`);
console.log(`Results: ${dir}/eval.json`);
// Running out of budget is the cap working; anything else needs a look.
if (result.stop !== "completed" && result.stop !== "cost_cap") {
  process.exit(1);
}

function fail(message: string): never {
  console.error(`${message}\n${USAGE}`);
  process.exit(1);
}
