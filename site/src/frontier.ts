// Which models are worth their price: the ones no other model beats on both
// cost per win and success rate. Shared by the frontier cards and the chart.

import type { BoardEntry } from "@harness/site-data/leaderboards.ts";

/** An entry with a cost per win and a success rate, so it can be placed on cost and success. */
export type Placed = BoardEntry & { costPerWin: number; score: BoardEntry["score"] & { successRate: number } };

/** The entries that have both numbers. */
export function placedOf(entries: BoardEntry[]): Placed[] {
  return entries.filter((entry): entry is Placed => entry.costPerWin !== null && entry.score.successRate !== null);
}

/** The models nobody beats on both counts: no other is cheaper per win and at least as successful. Cheapest first. */
export function frontierOf(entries: Placed[]): Placed[] {
  const frontier: Placed[] = [];
  for (const entry of [...entries].sort((a, b) => a.costPerWin - b.costPerWin)) {
    const best = frontier.at(-1)?.score.successRate ?? -1;
    if (entry.score.successRate > best) {
      frontier.push(entry);
    }
  }
  return frontier;
}
