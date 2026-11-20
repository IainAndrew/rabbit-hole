// A fake Wikipedia graph for testing searches and measurements without the
// network.

import type { GraphSource } from "./race-set.ts";

/**
 * A graph from each page's links, counting lookups each way. Backlinks of
 * pages in `cutOff` come back incomplete, like a hub's on the real site.
 */
export function fakeGraph(links: Record<string, string[]>, cutOff: string[] = []) {
  const calls = { neighbours: 0, backlinks: 0 };
  const graph: GraphSource = {
    neighbours: async (title) => {
      calls.neighbours++;
      return new Set(links[title] ?? []);
    },
    backlinks: async (title) => {
      calls.backlinks++;
      const pages = Object.keys(links).filter((page) => links[page]!.includes(title));
      return { pages: new Set(pages), complete: !cutOff.includes(title) };
    },
  };
  return { graph, calls };
}
