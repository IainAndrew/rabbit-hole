// The model leaderboard: one row per model, in the order the build ranked
// them. Every number shown was computed by the eval code at build time.

import type { RankRange } from "@harness/evals/compare.ts";
import type { Board } from "@harness/site-data/leaderboards.ts";
import { money } from "../../format.ts";
import styles from "./Leaderboard.module.scss";
import { RunEndings } from "../RunEndings/RunEndings.tsx";
import { SuccessCell } from "../SuccessCell/SuccessCell.tsx";
import table from "../../styles/table.module.scss";

export function Leaderboard({ board }: { board: Board }) {
  return (
    <div className={table.scroll}>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Model</th>
            <th scope="col">
              Success rate <span className="hint">with its 95% range</span>
            </th>
            <th scope="col" className={table.number}>
              Hops <span className="hint">on wins</span>
            </th>
            <th scope="col" className={table.number}>
              Cost <span className="hint">per win</span>
            </th>
            <th scope="col">How the runs ended</th>
          </tr>
        </thead>
        <tbody>
          {board.entries.map((entry) => (
            <tr key={entry.eval}>
              <td className={styles.rank}>
                <span className={styles.rankNumber}>{entry.rank}</span>
                <span className="hint">{rankRangeText(entry.rankRange)}</span>
              </td>
              <th scope="row" className={styles.model}>
                {entry.model.name}
                <span className="hint">{entry.model.lab}</span>
              </th>
              <td>
                <SuccessCell score={entry.score} interval={entry.interval} />
              </td>
              <td className={table.number}>
                {entry.score.meanHopsOnWins === null ? "–" : entry.score.meanHopsOnWins.toFixed(1)}
              </td>
              <td className={table.number}>{entry.costPerWin === null ? "–" : money(entry.costPerWin)}</td>
              <td className={table.losses}>
                <RunEndings endReasons={entry.endReasons} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "could be 2–7", or "clearly here" when the range is one rank. */
function rankRangeText({ best, worst }: RankRange): string {
  return best === worst ? "clearly here" : `could be ${best}–${worst}`;
}
