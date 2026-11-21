// Rank evals of different models or context strategies against each other,
// from their manifests and traces only. Refuses evals run with a different prompt, race set,
// limits or commit. Free: reads files.
// Usage: npm run compare-evals -- results/<sweep>/*

import { evalLabel, rankEvals, type Ranked } from "../evals/compare.ts";
import { withinNoise } from "../evals/intervals.ts";
import { loadEval } from "../evals/report.ts";

// Wide enough for the longest model name and a strategy name.
const LABEL_WIDTH = 32;

const dirs = process.argv.slice(2);
if (dirs.length < 2) {
  console.error("Usage: npm run compare-evals -- results/<sweep>/*");
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

console.log("Ranked by success rate, then fewer hops on wins. The columns after hops are reported, not ranked on.");
console.log("95%: the range the success rate could take by chance. vs next: the gap to the model below, in points,");
console.log("with its 95% range; \"noise\" means the range includes 0, so the order may be chance.\n");
console.log(
  `${"#".padEnd(3)}${"model / context".padEnd(LABEL_WIDTH)}${"runs".padEnd(10)}${"won".padEnd(12)}${"95%".padEnd(11)}${"hops".padEnd(6)}` +
    `${"vs next".padEnd(22)}${"cost/run".padEnd(10)}${"cost/win".padEnd(10)}${"tokens/run".padEnd(12)}${"turns".padEnd(7)}time/run`,
);
for (const entry of ranked) {
  console.log(rankRow(entry));
}

console.log("\nHow runs ended (crashed and killed runs aren't counted in the score)\n");
const reasons = Object.keys(ranked[0]!.endReasons) as (keyof Ranked["endReasons"])[];
console.log(`${"model / context".padEnd(LABEL_WIDTH)}${reasons.map((reason) => reason.padEnd(15)).join("")}crashed  killed`);
for (const entry of ranked) {
  const counts = reasons.map((reason) => String(entry.endReasons[reason]).padEnd(15)).join("");
  console.log(`${evalLabel(entry.eval).padEnd(LABEL_WIDTH)}${counts}${String(entry.score.crashed).padEnd(9)}${entry.score.killed}`);
}

console.log("\nHow runs played, over decided runs: why a score is what it is, not part of it.");
console.log("refused: moves the rules turned down, of all move attempts. first move: mean turn of the first move");
console.log("that worked. never moved: runs with none. cached: prompt tokens served from the provider's cache.\n");
console.log(`${"model / context".padEnd(LABEL_WIDTH)}${"refused".padEnd(10)}${"first move".padEnd(12)}${"never moved".padEnd(13)}cached`);
for (const entry of ranked) {
  console.log(evalLabel(entry.eval).padEnd(LABEL_WIDTH) + behaviourRow(entry));
}

/** An eval's move and cache numbers, or dashes with nothing decided. */
function behaviourRow({ behaviour }: Ranked): string {
  if (behaviour === null) {
    return "-";
  }
  return (
    (behaviour.refusedMoveShare === null ? "-" : percent(behaviour.refusedMoveShare)).padEnd(10) +
    (behaviour.meanFirstMoveTurn === null ? "-" : `turn ${behaviour.meanFirstMoveTurn.toFixed(1)}`).padEnd(12) +
    String(behaviour.neverMoved).padEnd(13) +
    percent(behaviour.cachedShare)
  );
}

/** One eval's rank, score, then what's reported beside it. */
function rankRow(entry: Ranked): string {
  const { score, averages, eval: loaded } = entry;
  const rate = score.successRate === null ? "-" : `${Math.round(score.successRate * 100)}%`;
  const hops = score.meanHopsOnWins === null ? "-" : score.meanHopsOnWins.toFixed(1);
  const repeats = `${loaded.manifest.races.length}×${loaded.manifest.repeats}`;
  return (
    String(entry.rank).padEnd(3) +
    evalLabel(loaded).padEnd(LABEL_WIDTH) +
    repeats.padEnd(10) +
    `${score.won}/${score.decided} ${rate}`.padEnd(12) +
    (entry.interval ? `${percent(entry.interval.low)}–${percent(entry.interval.high)}` : "-").padEnd(11) +
    hops.padEnd(6) +
    gap(entry).padEnd(22) +
    money(averages?.cost ?? null).padEnd(10) +
    money(entry.costPerWin).padEnd(10) +
    (averages ? Math.round(averages.promptTokens).toLocaleString() : "-").padEnd(12) +
    (averages ? averages.turns.toFixed(1) : "-").padEnd(7) +
    (averages ? `${averages.seconds.toFixed(1)} s` : "-")
  );
}

/** The gap to the next model in points, its 95% range, and whether it's noise. */
function gap(entry: Ranked): string {
  const { vsNext, score } = entry;
  const next = ranked[ranked.indexOf(entry) + 1];
  if (vsNext === null || next === undefined || score.successRate === null || next.score.successRate === null) {
    return "-";
  }
  const points = (rate: number) => {
    const rounded = Math.round(rate * 100);
    return rounded > 0 ? `+${rounded}` : String(rounded);
  };
  const range = `${points(score.successRate - next.score.successRate)} [${points(vsNext.low)}, ${points(vsNext.high)}]`;
  return withinNoise(vsNext) ? `${range} noise` : range;
}

/** A rate from 0 to 1 as a whole percentage. */
function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Dollars to 4 places, or "-" when unknown or meaningless (no wins). */
function money(dollars: number | null): string {
  return dollars === null ? "-" : `$${dollars.toFixed(4)}`;
}
