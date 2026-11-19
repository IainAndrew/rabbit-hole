// Rank evals of different models against each other, from their manifests
// and traces only. Refuses evals run with a different prompt, race set,
// limits or commit. Free: reads files.
// Usage: npm run compare-evals -- results/<eval> results/<eval> ...

import { rankEvals, type Ranked } from "../evals/compare.ts";
import { loadEval } from "../evals/report.ts";

const dirs = process.argv.slice(2);
if (dirs.length < 2) {
  console.error("Usage: npm run compare-evals -- results/<eval> results/<eval> ...");
  process.exit(1);
}

const ranked = rankEvals(dirs.map(loadEval));
// checkComparable has made sure these are the same for every eval.
const { manifest } = ranked[0]!.eval;
const { limits } = manifest;
console.log(
  `${ranked.length} evals | commit ${manifest.gitCommit.slice(0, 7)} | prompt ${manifest.promptHash} | ${manifest.races.length} races`,
);
console.log(
  `limits: ${limits.maxTurns} turns, ${limits.maxContextChars.toLocaleString()} context chars, ${limits.maxOutputTokens.toLocaleString()} output tokens\n`,
);

console.log("Ranked by success rate, then fewer hops on wins. The columns after hops are reported, not ranked on.\n");
console.log(
  `${"#".padEnd(3)}${"model".padEnd(24)}${"runs".padEnd(10)}${"won".padEnd(12)}${"hops".padEnd(6)}` +
    `${"cost/run".padEnd(10)}${"cost/win".padEnd(10)}${"tokens/run".padEnd(12)}${"turns".padEnd(7)}time/run`,
);
for (const entry of ranked) {
  console.log(rankRow(entry));
}

console.log("\nHow runs ended (crashed and killed runs aren't counted in the score)\n");
const reasons = Object.keys(ranked[0]!.endReasons) as (keyof Ranked["endReasons"])[];
console.log(`${"model".padEnd(24)}${reasons.map((reason) => reason.padEnd(15)).join("")}crashed  killed`);
for (const entry of ranked) {
  const counts = reasons.map((reason) => String(entry.endReasons[reason]).padEnd(15)).join("");
  console.log(`${entry.eval.manifest.model.name.padEnd(24)}${counts}${String(entry.score.crashed).padEnd(9)}${entry.score.killed}`);
}

/** One eval's rank, score, then what's reported beside it. */
function rankRow(entry: Ranked): string {
  const { score, averages, eval: loaded } = entry;
  const rate = score.successRate === null ? "-" : `${Math.round(score.successRate * 100)}%`;
  const hops = score.meanHopsOnWins === null ? "-" : score.meanHopsOnWins.toFixed(1);
  const repeats = `${loaded.manifest.races.length}×${loaded.manifest.repeats}`;
  return (
    String(entry.rank).padEnd(3) +
    loaded.manifest.model.name.padEnd(24) +
    repeats.padEnd(10) +
    `${score.won}/${score.decided} ${rate}`.padEnd(12) +
    hops.padEnd(6) +
    money(averages?.cost ?? null).padEnd(10) +
    money(entry.costPerWin).padEnd(10) +
    (averages ? Math.round(averages.promptTokens).toLocaleString() : "-").padEnd(12) +
    (averages ? averages.turns.toFixed(1) : "-").padEnd(7) +
    (averages ? `${averages.seconds.toFixed(1)} s` : "-")
  );
}

/** Dollars to 4 places, or "-" when unknown or meaningless (no wins). */
function money(dollars: number | null): string {
  return dollars === null ? "-" : `$${dollars.toFixed(4)}`;
}
