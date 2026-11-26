// The model leaderboard: one row per model, in the order the build ranked
// them. Every number shown was computed by the eval code at build time.

import type { RankRange } from "@harness/evals/compare.ts";
import type { Board, BoardEntry } from "@harness/site-data/leaderboards.ts";
import { money, percent } from "../../format.ts";
import styles from "./Leaderboard.module.scss";
import { RunEndings } from "../RunEndings/RunEndings.tsx";
import { InfoTip } from "../InfoTip/InfoTip.tsx";
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
              <span className={styles.withTip}>
                Hops wasted
                <InfoTip label="How hops wasted is worked out">
                  For each race a model won: the hops it took, minus the fewest hops that race can be done in. Then
                  the average over all its wins, so 0 would mean every win took a shortest route. Each race's fewest
                  hops were found by searching Wikipedia's links from both ends.
                </InfoTip>
              </span>
              <span className="hint">per win</span>
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
                <HopsWasted entry={entry} />
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

/**
 * Hops wasted per win: one number, lower is better. Hovering shows the
 * model's own arithmetic behind it.
 */
function HopsWasted({ entry }: { entry: BoardEntry }) {
  const { routes, score } = entry;
  if (routes === null || score.meanHopsOnWins === null) {
    return <>–</>;
  }
  const hops = score.meanHopsOnWins;
  const shortest = hops - routes.meanExtraHops;
  const working =
    `${hops.toFixed(1)} hops per win, where the shortest routes average ${shortest.toFixed(1)}. ` +
    `Took a shortest route in ${percent(routes.shortestShare)} of wins.`;
  return (
    <span className={styles.wasted} title={working}>
      {routes.meanExtraHops.toFixed(1)}
    </span>
  );
}

/** "could be 2–7", or "clearly here" when the range is one rank. */
function rankRangeText({ best, worst }: RankRange): string {
  return best === worst ? "clearly here" : `could be ${best}–${worst}`;
}
