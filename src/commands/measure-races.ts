// Measure every race in races.json on live Wikipedia and write each one's
// 2-hop route count and difficulty back into the file. The hand-written
// parts (id, start, target, known path) are kept as they are. Free:
// Wikipedia only. Writes nothing if any race can't be measured.
// Usage: npm run measure-races

import { readFileSync, writeFileSync } from "node:fs";
import { measureRace, parseRaceDrafts, type RaceSpec } from "../evals/race-set.ts";
import { fetchBacklinks, fetchNeighbours } from "../wikipedia/wikipedia.ts";

const FILE = "races.json";
const drafts = parseRaceDrafts(JSON.parse(readFileSync(FILE, "utf8")));
const today = new Date().toISOString().slice(0, 10);
const graph = { neighbours: fetchNeighbours, backlinks: fetchBacklinks };

const measured: RaceSpec[] = [];
let failed = 0;
for (const draft of drafts) {
  const result = await measureRace(draft, graph, today);
  if (!result.ok) {
    console.log(`FAIL ${draft.id}: ${result.problem}`);
    failed++;
    continue;
  }
  const { difficulty } = result;
  const { twoHopRoutes, complete, examples } = result.measured;
  console.log(
    `${difficulty.padEnd(6)} ${draft.id.padEnd(34)} ${twoHopRoutes}${complete ? "" : "+"} routes  ${examples.join(", ")}`,
  );
  // Key order kept fixed so the file reads the same way every time.
  measured.push({
    id: draft.id,
    difficulty,
    start: draft.start,
    target: draft.target,
    knownPath: draft.knownPath,
    measured: result.measured,
  });
}

if (failed > 0) {
  console.log(`\n${failed} races couldn't be measured; ${FILE} is unchanged`);
  process.exit(1);
}
writeFileSync(FILE, JSON.stringify(measured, null, 2) + "\n");
console.log(`\nWrote ${measured.length} measured races to ${FILE}. Run check-races next.`);
