// Report on one eval, from its manifest and traces only: the score, then the
// same by tier, by repeat and by race. Free: reads files.
// Usage: npm run eval-report -- runs/<eval>

import { loadEval, type LoadedRun } from "../evals/report.ts";
import { averagesOf, outcomeOf, scoreRuns, type Outcome, type Score } from "../evals/score.ts";

const TIERS = ["easy", "medium", "hard"];
const LETTERS: Record<Outcome, string> = { won: "W", lost: "L", crashed: "C", killed: "K" };

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

const overall = scoreRuns(runs);
console.log(`Score: ${won(overall)}, ${hops(overall)} hops on wins${notCounted(overall)}\n`);

console.log(`${"tier".padEnd(8)} ${"won".padEnd(12)} hops  turns  tokens/run  cost/run  time/run`);
for (const tier of TIERS) {
  const tierRuns = runs.filter((run) => run.difficulty === tier);
  if (tierRuns.length > 0) {
    console.log(tierRow(tier, tierRuns));
  }
}

const byRepeat = [];
for (let repeat = 1; repeat <= manifest.repeats; repeat++) {
  byRepeat.push(`r${repeat} ${won(scoreRuns(runs.filter((run) => run.repeat === repeat)))}`);
}
console.log(`\nby repeat: ${byRepeat.join("   ")}\n`);

console.log(`${"race".padEnd(34)} ${"repeats".padEnd(10)} ${"won".padEnd(12)} hops`);
for (const race of manifest.races) {
  const raceRuns = runs.filter((run) => run.raceId === race.id);
  const letters = raceRuns.map((run) => LETTERS[outcomeOf(run)]).join(" ") || "-";
  const score = scoreRuns(raceRuns);
  console.log(`${race.id.padEnd(34)} ${letters.padEnd(10)} ${won(score).padEnd(12)} ${hops(score)}`);
}
console.log("\nW won, L lost, C crashed, K killed. Crashed and killed runs aren't counted.");

const notRun = manifest.plannedRuns - runs.length;
if (notRun > 0) {
  console.log(`${notRun} planned runs never started`);
}

/** "15/24 63%": wins out of decided runs, then the rate. */
function won(score: Score): string {
  const rate = score.successRate === null ? "-" : `${Math.round(score.successRate * 100)}%`;
  return `${score.won}/${score.decided} ${rate}`;
}

/** Mean hops on wins to one place, or "-" with no wins. */
function hops(score: Score): string {
  return score.meanHopsOnWins === null ? "-" : score.meanHopsOnWins.toFixed(1);
}

/** The runs left out of the score, if any. */
function notCounted(score: Score): string {
  if (score.crashed === 0 && score.killed === 0) {
    return "";
  }
  return `   (not counted: ${score.crashed} crashed, ${score.killed} killed)`;
}

/** One tier's score, then its per-run averages. */
function tierRow(tier: string, tierRuns: LoadedRun[]): string {
  const score = scoreRuns(tierRuns);
  const averages = averagesOf(tierRuns);
  const numbers = averages
    ? `${averages.turns.toFixed(1).padStart(5)}  ${Math.round(averages.promptTokens).toLocaleString().padStart(10)}  ${money(averages.cost).padStart(8)}  ${averages.seconds.toFixed(1).padStart(6)} s`
    : "";
  return `${tier.padEnd(8)} ${won(score).padEnd(12)} ${hops(score).padStart(4)}  ${numbers}`;
}

/** Dollars to 4 places, or a word when the cost isn't known. */
function money(dollars: number | null): string {
  return dollars === null ? "unknown" : `$${dollars.toFixed(4)}`;
}
