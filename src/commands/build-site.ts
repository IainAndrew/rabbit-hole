// Build the site's data from the committed sweeps: one JSON file of
// leaderboards and races, ranked by the same code as compare-evals; a replay
// of every run, with an index per eval; and a page for each doc in docs/.
// Free: reads files.
// Usage: npm run build-site

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseTrace } from "../agent/trace.ts";
import { parseRaceSet } from "../evals/race-set.ts";
import { BOARDS, buildBoard, loadSweep, racesOf, type SiteData, type SweepEval } from "../site/leaderboards.ts";
import { renderDoc, type DocPage } from "../site/docs.ts";
import { replayOf, summaryOf } from "../site/replays.ts";

const DATA = join("site", "data");
const LEADERBOARDS = join(DATA, "leaderboards.json");
const DOCS = join("site", "docs");

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

// Each docs/<name>.md as a page at site/docs/<name>/, built fresh like the data.
rmSync(DOCS, { recursive: true, force: true });
for (const file of readdirSync("docs").filter((name) => name.endsWith(".md")).sort()) {
  const name = file.replace(/\.md$/, "");
  const { title } = writeDoc(name, readFileSync(join("docs", file), "utf8"));
  console.log(`Doc page: ${title} → site/docs/${name}/`);
}

/**
 * Write each run's replay and each eval's index.json under
 * site/data/runs/<sweep>/<eval>/.
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

/** Render one doc and write it as site/docs/<name>/index.html. */
function writeDoc(name: string, markdown: string): DocPage {
  const doc = renderDoc(markdown);
  mkdirSync(join(DOCS, name), { recursive: true });
  writeFileSync(join(DOCS, name, "index.html"), doc.html);
  return doc;
}

/** Bytes as megabytes to one place. */
function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
