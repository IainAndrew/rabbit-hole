// Check every race in races.json against the snapshot, recording any page it
// doesn't have yet. Free: Wikipedia only.
// Usage: npm run check-races

import { readFileSync } from "node:fs";
import { checkRace, parseRaceSet } from "../race/race-set.ts";
import { snapshotLinks } from "../wikipedia/snapshot.ts";
import { fetchLinks } from "../wikipedia/wikipedia.ts";

const races = parseRaceSet(JSON.parse(readFileSync("races.json", "utf8")));

let liveFetches = 0;
const getLinks = snapshotLinks("snapshot", (title) => {
  liveFetches++;
  return fetchLinks(title);
});

let failed = 0;
for (const race of races) {
  const problems = await checkRace(race, getLinks);
  const hops = race.knownPath.length - 1;
  console.log(`${problems.length === 0 ? "ok  " : "FAIL"} ${race.difficulty.padEnd(6)} ${race.id.padEnd(34)} ${hops} hops: ${race.knownPath.join(" > ")}`);
  for (const problem of problems) {
    console.log(`       ${problem}`);
  }
  if (problems.length > 0) {
    failed++;
  }
}

const count = (difficulty: string) => races.filter((race) => race.difficulty === difficulty).length;
console.log(`\n${races.length} races: ${count("easy")} easy, ${count("medium")} medium, ${count("hard")} hard`);
console.log(`Pages fetched live and added to snapshot/: ${liveFetches}`);
if (failed > 0) {
  console.log(`${failed} races failed their checks`);
  process.exit(1);
}
