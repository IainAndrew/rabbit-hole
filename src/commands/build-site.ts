// Build the site's data from the committed sweeps, into site/public/ where the
// site's build picks it up: one JSON file of leaderboards and races, ranked by
// the same code as compare-evals; a replay of every run, with an index per
// eval; and each doc in docs/ rendered to HTML. Free: reads files.
// Usage: npm run build-site (which then builds the site itself)

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseTrace } from "../agent/trace.ts";
import { parseRaceSet } from "../evals/race-set.ts";
import { BOARDS, buildBoard, loadSweep, racesOf, type SiteData, type SweepEval } from "../site-data/leaderboards.ts";
import { renderDoc, type DocPage } from "../site-data/docs.ts";
import { replayOf, summaryOf } from "../site-data/replays.ts";

const DATA = join("site", "public", "data");
const LEADERBOARDS = join(DATA, "leaderboards.json");
const DOCS = join("site", "public", "docs");

// Built fresh each time, so a run dropped from a sweep can't linger as a replay.
rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const sweeps = BOARDS.map((spec) => loadSweep(join("results", spec.sweep)));
const boards = BOARDS.map((spec, index) => buildBoard(spec, sweeps[index]!));
const raceSet = parseRaceSet(JSON.parse(readFileSync("races.json", "utf8")));
const data: SiteData = { races: racesOf(boards, raceSet), boards };
writeFileSync(LEADERBOARDS, JSON.stringify(data, null, 2) + "\n");

for (const [index, board] of boards.entries()) {
  const replayBytes = writeReplays(board.sweep, sweeps[index]!);
  const runs = sweeps[index]!.reduce((sum, { loaded }) => sum + loaded.runs.length, 0);
  console.log(
    `${board.title}: ${board.entries.length} evals, ${runs} runs, ${board.sweep} at ${board.commit.slice(0, 7)}; ` +
      `replays ${megabytes(replayBytes)}`,
  );
}
console.log(`${data.races.length} races. Wrote ${LEADERBOARDS} (${Math.round(statSync(LEADERBOARDS).size / 1024)} KB)`);

// Each docs/<name>.md as site/public/docs/<name>.json, built fresh like the data.
rmSync(DOCS, { recursive: true, force: true });
mkdirSync(DOCS, { recursive: true });
for (const file of readdirSync("docs").filter((name) => name.endsWith(".md")).sort()) {
  const name = file.replace(/\.md$/, "");
  const { title } = writeDoc(name, readFileSync(join("docs", file), "utf8"));
  console.log(`Doc: ${title} → ${join(DOCS, `${name}.json`)}`);
}

/**
 * Write each run's replay and each eval's index.json under
 * site/public/data/runs/<sweep>/<eval>/.
 *
 * @returns The bytes written, to report the site's size.
 */
function writeReplays(sweep: string, evals: SweepEval[]): number {
  let bytes = 0;
  for (const { folder, loaded } of evals) {
    const out = join(DATA, "runs", sweep, folder);
    mkdirSync(out, { recursive: true });
    const summaries = loaded.runs.map(summaryOf);
    for (const [index, run] of loaded.runs.entries()) {
      const events = parseTrace(readFileSync(join("results", sweep, folder, run.trace), "utf8"));
      const text = JSON.stringify(replayOf(events));
      writeFileSync(join(out, `${summaries[index]!.file}.json`), text);
      bytes += Buffer.byteLength(text);
    }
    const index = JSON.stringify(summaries);
    writeFileSync(join(out, "index.json"), index);
    bytes += Buffer.byteLength(index);
  }
  return bytes;
}

/** Render one doc and write its title and HTML as site/public/docs/<name>.json. */
function writeDoc(name: string, markdown: string): DocPage {
  const doc = renderDoc(markdown);
  writeFileSync(join(DOCS, `${name}.json`), JSON.stringify(doc));
  return doc;
}

/** Bytes as megabytes to one place. */
function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
