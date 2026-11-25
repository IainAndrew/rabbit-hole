import type { Board } from "@harness/site-data/leaderboards.ts";
import { REPO } from "../data.ts";

/** Where a board's numbers come from: its races and repeats, its sweep folder, and the commit it ran at. */
export function Source({ board }: { board: Board }) {
  return (
    <p className="source">
      {board.races.length} races × {board.repeats} runs each. From{" "}
      <a href={`${REPO}/tree/main/results/${board.sweep}`}>results/{board.sweep}</a>, run at commit{" "}
      <a href={`${REPO}/commit/${board.commit}`}>
        <code>{board.commit.slice(0, 7)}</code>
      </a>
      .
    </p>
  );
}
