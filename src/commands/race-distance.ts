// Find the fewest hops between two Wikipedia pages, and one path that takes
// them, by searching live Wikipedia from both ends. Free: Wikipedia only, but
// a far-apart pair can take several minutes.
// Usage: npm run race-distance -- "Start" "Target"

import { DISTANCE_LIMITS, shortestPath } from "../evals/distance.ts";
import { fetchBacklinks, fetchLinks, fetchNeighbours } from "../wikipedia/wikipedia.ts";

const [startInput, targetInput] = process.argv.slice(2);
if (!startInput || !targetInput) {
  console.error('Usage: npm run race-distance -- "Start" "Target"');
  process.exit(1);
}

// The search compares canonical titles, so resolve what was typed first.
const start = (await fetchLinks(startInput)).title;
const target = (await fetchLinks(targetInput)).title;
const began = performance.now();
const graph = { neighbours: fetchNeighbours, backlinks: fetchBacklinks };
const result = await shortestPath(start, target, graph, DISTANCE_LIMITS, (direction, depth, reached) => {
  const from = direction === "forward" ? start : target;
  console.log(`  ${direction} ${depth} from ${from}: ${reached.toLocaleString()} pages reached`);
});
const seconds = Math.round((performance.now() - began) / 1000);

if (result.hops === null) {
  const { maxHops, maxLookups } = DISTANCE_LIMITS;
  const why = result.searchedHops < maxHops ? `the search stopped at ${maxLookups} lookups` : "the limit";
  console.log(`\n${start} > ${target}: no path of ${result.searchedHops} hops or fewer (${why})`);
} else {
  console.log(`\n${start} > ${target}: ${result.hops} hops`);
  console.log(result.path.join(" > "));
}
console.log(`${result.lookups.toLocaleString()} pages looked up in ${seconds} s`);
if (!result.exact) {
  console.log("Not exact: some pages had more backlinks than were read, so a shorter path may exist.");
}
