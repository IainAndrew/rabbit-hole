// One context strategy's results: a row per model, each against that model's
// usual setup (full history), plus what a run cost and how much of its
// prompt the provider's cache served, since strategies trade those off.

import type { Board } from "@harness/site-data/leaderboards.ts";
import { money, percent } from "../../format.ts";
import { runsHref } from "../../replayLinks.ts";
import table from "../../styles/table.module.scss";
import { Gap } from "../ExperimentBoard/ExperimentBoard.tsx";
import { RunEndings } from "../RunEndings/RunEndings.tsx";
import { SuccessCell } from "../SuccessCell/SuccessCell.tsx";

/**
 * The board's entries run with `strategy`, one row per model.
 *
 * @throws If no entry used that strategy: the copy would describe a table that isn't there.
 */
export function StrategyTable({ board, strategy }: { board: Board; strategy: string }) {
  const entries = board.entries.filter((entry) => entry.context === strategy);
  if (entries.length === 0) {
    throw new Error(`The ${board.id} board has no runs with the ${strategy} strategy`);
  }
  const isBaseline = board.baseline?.value === strategy;
  return (
    <div className={table.scroll}>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">
              Success rate <span className="hint">with its 95% range</span>
            </th>
            {!isBaseline && <th scope="col">Against full history</th>}
            <th scope="col" className={table.number}>
              Cost <span className="hint">per run, cache served</span>
            </th>
            <th scope="col">How the runs ended</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.eval}>
              <th scope="row">
                {entry.model.name}
                <span className="hint">{entry.model.lab}</span>
                <a className={table.runsLink} href={runsHref(board, entry)}>
                  Watch these runs
                </a>
              </th>
              <td>
                <SuccessCell score={entry.score} interval={entry.interval} />
              </td>
              {!isBaseline && (
                <td>
                  <Gap gap={entry.vsBaseline} />
                </td>
              )}
              <td className={table.number}>
                {entry.averages === null || entry.averages.cost === null ? "–" : money(entry.averages.cost)}
                <span className="hint">{entry.behaviour === null ? "" : `${percent(entry.behaviour.cachedShare)} cached`}</span>
              </td>
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
