// The answer to "which model is best for the money?", before the chart that
// backs it: one card per model on the frontier, cheapest first, each saying
// what the step up from the one before buys and what it costs.

import type { Board } from "@harness/site-data/leaderboards.ts";
import { frontierOf, placedOf, type Placed } from "../../frontier.ts";
import { money, percent, points } from "../../format.ts";
import styles from "./BestBuys.module.scss";

export function BestBuys({ board }: { board: Board }) {
  const frontier = frontierOf(placedOf(board.entries));
  return (
    <ol className={styles.cards}>
      {frontier.map((entry, index) => (
        <li key={entry.eval} className={styles.card}>
          <span className={styles.role}>{roleOf(index, frontier.length)}</span>
          <span className={styles.model}>{entry.model.name}</span>
          <span className="hint">{entry.model.lab}</span>
          <span className={styles.figures}>
            <span>
              <b>{percent(entry.score.successRate)}</b> won
            </span>
            <span>
              <b>{money(entry.costPerWin)}</b> per win
            </span>
          </span>
          <span className={styles.step}>{index === 0 ? "No model wins for less." : stepText(frontier[index - 1]!, entry)}</span>
        </li>
      ))}
    </ol>
  );
}

function roleOf(index: number, count: number): string {
  if (index === 0) {
    return "Cheapest win";
  }
  if (index === count - 1) {
    return "Most wins";
  }
  return "Step up";
}

/** What moving up from `before` to `entry` buys, and for how much more per win. */
function stepText(before: Placed, entry: Placed): string {
  const ratio = entry.costPerWin / before.costPerWin;
  const times = ratio < 10 ? ratio.toFixed(1) : String(Math.round(ratio));
  return `${points(entry.score.successRate - before.score.successRate)} points over ${before.model.name}, for ${times}× the cost per win.`;
}
