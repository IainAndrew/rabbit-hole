// Build the site's data from the committed sweeps: one JSON file of
// leaderboards and races, ranked by the same code as compare-evals. Free:
// reads files. Usage: npm run build-site

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseRaceSet } from "../evals/race-set.ts";
import { BOARDS, buildBoard, loadSweep, racesOf, type SiteData } from "../site/leaderboards.ts";

const OUTPUT = join("site", "data", "leaderboards.json");

const boards = BOARDS.map((spec) => buildBoard(spec, loadSweep(join("results", spec.sweep))));
const raceSet = parseRaceSet(JSON.parse(readFileSync("races.json", "utf8")));
const data: SiteData = { races: racesOf(boards, raceSet), boards };

mkdirSync(join("site", "data"), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(data, null, 2) + "\n");

for (const board of boards) {
  const runs = board.entries.reduce((sum, entry) => sum + entry.score.decided + entry.score.crashed + entry.score.killed, 0);
  console.log(`${board.title}: ${board.entries.length} evals, ${runs} runs, ${board.sweep} at ${board.commit.slice(0, 7)}`);
}
console.log(`${data.races.length} races. Wrote ${OUTPUT} (${Math.round(statSync(OUTPUT).size / 1024)} KB)`);
