// Report on one eval, from its manifest and traces only. Free: reads files.
// Usage: npm run eval-report -- runs/<eval>

import { loadEval, type LoadedRun } from "../race/report.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: npm run eval-report -- runs/<eval>");
  process.exit(1);
}

const { manifest, runs } = loadEval(dir);
const { model, limits } = manifest;
// Null once any run's cost is unknown: a partial sum would read as a total.
const spent = runs.reduce<number | null>((sum, run) => {
  const cost = run.end?.totals.cost;
  return sum === null || cost === undefined || cost === null ? null : sum + cost;
}, 0);

console.log(`${model.id} on ${model.provider} (reasoning: ${model.reasoning})`);
console.log(`commit ${manifest.gitCommit.slice(0, 7)} | prompt ${manifest.promptHash}`);
console.log(`limits: ${limits.maxTurns} turns, ${limits.maxPromptTokens.toLocaleString()} prompt tokens, ${limits.maxOutputTokens.toLocaleString()} output tokens`);
console.log(`stopped: ${manifest.stop ?? "never (killed, or still running)"}`);
console.log(`runs: ${runs.length} of ${manifest.plannedRuns} planned | spent ${money(spent)} of a $${manifest.maxCost} cap\n`);

console.log(`${"race".padEnd(34)} rep  ${"ending".padEnd(28)} hops  turns  ${"tokens".padStart(9)}  cost`);
for (const run of runs) console.log(row(run));

const notRun = manifest.plannedRuns - runs.length;
if (notRun > 0) console.log(`\n${notRun} planned runs never started`);

/** One line per run: race, repeat, how it ended, and its totals. */
function row(run: LoadedRun): string {
  const { end } = run;
  const ending = !end ? "killed before it finished" : end.end.kind === "finished" ? end.end.reason : `crashed (${end.end.cause})`;
  const numbers = end
    ? `${String(end.hops).padStart(4)}  ${String(end.turns).padStart(5)}  ${end.totals.promptTokens.toLocaleString().padStart(9)}  ${money(end.totals.cost)}`
    : "";
  return `${run.raceId.padEnd(34)} ${String(run.repeat).padStart(3)}  ${ending.padEnd(28)} ${numbers}`;
}

/** Dollars to 4 places, or a word when the cost isn't known. */
function money(dollars: number | null): string {
  return dollars === null ? "unknown" : `$${dollars.toFixed(4)}`;
}
