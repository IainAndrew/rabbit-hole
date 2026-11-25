// Addresses into the replays. #run=<sweep>/<eval>/<race>-r<N> opens one run;
// #runs=<sweep>/<eval> sets the replay filters to that eval's runs.

import type { Board, BoardEntry } from "@harness/site-data/leaderboards.ts";

/** An eval's address in the site data: "<sweep>/<eval folder>". */
export function evalPathOf(board: Board, entry: BoardEntry): string {
  return `${board.sweep}/${entry.eval}`;
}

/** A link that shows an eval's runs in the replays. */
export function runsHref(board: Board, entry: BoardEntry): string {
  return `#runs=${evalPathOf(board, entry)}`;
}
