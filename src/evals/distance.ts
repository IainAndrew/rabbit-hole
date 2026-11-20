// The fewest hops between two pages, found by searching from both ends at
// once: the start's links forward, the target's backlinks back. Each round
// takes the side with fewer pages waiting one level further, so a rarely
// linked target is searched from its own end. Where the two sides meet is a
// shortest path. Used to measure races, and as the no-AI baseline.

import type { GraphSource } from "./race-set.ts";

/** How far to search, and how much work to spend on it. */
export type SearchLimits = {
  /** Paths longer than this aren't looked for. */
  maxHops: number;
  /**
   * Pages to look up, forward or back. A level is only searched if it fits
   * whole, since a half-searched level could miss the shortest path.
   */
  maxLookups: number;
};

/** 4 hops is as far as a race should need; past it, the search grows too big. */
export const DISTANCE_LIMITS: SearchLimits = { maxHops: 4, maxLookups: 5000 };

/** What a search found. */
export type Distance = {
  /** The fewest hops, or null if no path was found. */
  hops: number | null;
  /** One shortest path, start first; empty when none was found. */
  path: string[];
  /** Every path up to this many hops was searched. */
  searchedHops: number;
  /**
   * False if some page's backlinks were cut off (a page linked from more
   * places than fetchBacklinks reads), so a shorter path may have been missed.
   * Cut-offs in the level where the sides met don't count: every shorter
   * path was already ruled out by the levels before it.
   */
  exact: boolean;
  /** Pages looked up. */
  lookups: number;
};

/** How a page was reached: from which page, and how many hops from its end. */
type Step = { via: string | null; depth: number };

/** One end of the search: every page reached so far, and the newest level. */
type Side = { reached: Map<string, Step>; edge: string[]; depth: number };

/**
 * Search from both ends for a shortest path from start to target.
 *
 * @param start A canonical title.
 * @param target A canonical title.
 * @param onLevel Told after each level, for progress.
 */
export async function shortestPath(
  start: string,
  target: string,
  graph: GraphSource,
  limits: SearchLimits,
  onLevel: (direction: "forward" | "back", depth: number, reached: number) => void,
): Promise<Distance> {
  const forward = sideFrom(start);
  const back = sideFrom(target);
  let lookups = 0;
  let exact = true;

  let meeting = closestMeeting(forward, back);
  while (meeting === null && forward.depth + back.depth < limits.maxHops) {
    const goForward = forward.edge.length <= back.edge.length;
    const side = goForward ? forward : back;
    if (lookups + side.edge.length > limits.maxLookups) {
      break;
    }
    const next: string[] = [];
    let levelComplete = true;
    for (const page of side.edge) {
      lookups++;
      let found: Set<string>;
      if (goForward) {
        found = await graph.neighbours(page);
      } else {
        const backlinks = await graph.backlinks(page, () => false);
        levelComplete &&= backlinks.complete;
        found = backlinks.pages;
      }
      for (const other of found) {
        if (!side.reached.has(other)) {
          side.reached.set(other, { via: page, depth: side.depth + 1 });
          next.push(other);
        }
      }
    }
    side.edge = next;
    side.depth++;
    onLevel(goForward ? "forward" : "back", side.depth, side.reached.size);
    meeting = closestMeeting(forward, back);
    if (meeting === null) {
      exact &&= levelComplete;
    }
  }

  const searchedHops = forward.depth + back.depth;
  if (meeting === null) {
    return { hops: null, path: [], searchedHops, exact, lookups };
  }
  const path = [...chain(forward, meeting).reverse(), ...chain(back, meeting).slice(1)];
  return { hops: path.length - 1, path, searchedHops, exact, lookups };
}

/** A side that has reached only its own page. */
function sideFrom(page: string): Side {
  return { reached: new Map([[page, { via: null, depth: 0 }]]), edge: [page], depth: 0 };
}

/**
 * The page both sides have reached with the fewest hops between them, or
 * null if they haven't met. Only the newest levels need checking: older ones
 * were checked when they were new.
 */
function closestMeeting(forward: Side, back: Side): string | null {
  let best: string | null = null;
  let bestHops = Infinity;
  const candidates = [...forward.edge, ...back.edge];
  for (const page of candidates) {
    const there = forward.reached.get(page);
    const fromThere = back.reached.get(page);
    if (there && fromThere && there.depth + fromThere.depth < bestHops) {
      best = page;
      bestHops = there.depth + fromThere.depth;
    }
  }
  return best;
}

/** The pages from `page` back to the side's own end, following `via`. */
function chain(side: Side, page: string): string[] {
  const pages: string[] = [];
  let current: string | null = page;
  while (current !== null) {
    pages.push(current);
    current = side.reached.get(current)!.via;
  }
  return pages;
}
