// A board of changes: one model at a time, each change beside that model's
// usual setup, with the gap between them and how sure we are. The gaps,
// ranges and p-values were all computed at build time.

import type { BaselineGap } from "@harness/evals/compare.ts";
import type { Baseline, Board, BoardEntry } from "@harness/site-data/leaderboards.ts";
import { points } from "../../format.ts";
import { runsHref } from "../../replayLinks.ts";
import { promptName, strategyName } from "../../settings.ts";
import styles from "./ExperimentBoard.module.scss";
import { RunEndings } from "../RunEndings/RunEndings.tsx";
import { SuccessCell } from "../SuccessCell/SuccessCell.tsx";
import table from "../../styles/table.module.scss";

/**
 * One table, grouped by model.
 *
 * @throws If the board has no baseline: there's nothing to measure against.
 */
export function ExperimentBoard({ board }: { board: Board }) {
  const { baseline } = board;
  if (baseline === undefined) {
    throw new Error(`The ${board.id} board has no baseline`);
  }
  return (
    <div className={table.scroll}>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col">{baseline.varies === "context" ? "Context strategy" : "Prompt"}</th>
            <th scope="col">
              Success rate <span className="hint">with its 95% range</span>
            </th>
            <th scope="col">Against the usual setup</th>
            <th scope="col">How the runs ended</th>
          </tr>
        </thead>
        {byModel(board.entries).map((entries) => (
          <tbody key={entries[0]!.model.id}>
            <tr className={styles.group}>
              <th scope="rowgroup" colSpan={4}>
                {entries[0]!.model.name}
              </th>
            </tr>
            {entries.map((entry) => (
              <tr key={entry.eval}>
                <th scope="row" className={styles.setting}>
                  <Setting board={board} entry={entry} baseline={baseline} />
                </th>
                <td>
                  <SuccessCell score={entry.score} interval={entry.interval} />
                </td>
                <td className={styles.gap}>
                  <Gap gap={entry.vsBaseline} />
                </td>
                <td className={table.losses}>
                  <RunEndings endReasons={entry.endReasons} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** The entries grouped by model, in board order, each group's baseline first. */
function byModel(entries: BoardEntry[]): BoardEntry[][] {
  const groups = new Map<string, BoardEntry[]>();
  for (const entry of entries) {
    groups.set(entry.model.id, [...(groups.get(entry.model.id) ?? []), entry]);
  }
  return [...groups.values()].map((group) => [
    ...group.filter((entry) => entry.vsBaseline === null),
    ...group.filter((entry) => entry.vsBaseline !== null),
  ]);
}

/**
 * The setting's plain name with its code name beside it, and a prompt's text
 * quoted, and a link to its runs. Strategies are described in the copy around
 * their tables.
 */
function Setting({ board, entry, baseline }: { board: Board; entry: BoardEntry; baseline: Baseline }) {
  const name = baseline.varies === "context" ? entry.context : entry.prompt;
  const meaning = baseline.varies === "prompt" && entry.systemPrompt !== null ? `“${entry.systemPrompt}”` : "";
  return (
    <>
      <strong>{baseline.varies === "context" ? strategyName(name) : promptName(name)}</strong> <code>{name}</code>
      {name === baseline.value && <span className={styles.usual}>usual</span>}
      <span className="hint">{meaning}</span>
      <a className={table.runsLink} href={runsHref(board, entry)}>
        Watch these runs
      </a>
    </>
  );
}

/** The gap to the baseline in points, with its range and p, and what they add up to. */
export function Gap({ gap }: { gap: BaselineGap | null }) {
  if (gap === null) {
    return <span className="hint">the baseline</span>;
  }
  const range = gap.interval === null ? null : `range ${points(gap.interval.low)} to ${points(gap.interval.high)}`;
  const p = gap.p === null ? null : gap.p < 0.001 ? "p < 0.001" : `p = ${gap.p.toFixed(3)}`;
  return (
    <>
      <span className={styles.points}>{points(gap.gap)} points</span>
      <span className="hint">{[range, p].filter(Boolean).join(", ")}</span>
      <span className={styles.verdict}>{verdict(gap)}</span>
    </>
  );
}

/**
 * What a gap's range and p say, in words. A range that excludes 0 holds on
 * new races like these; a small p alone holds on these races only.
 */
function verdict(gap: BaselineGap): string {
  const excludesZero = gap.interval !== null && (gap.interval.low > 0 || gap.interval.high < 0);
  const direction = gap.gap > 0 ? "better" : "worse";
  if (excludesZero) {
    return `Clearly ${direction}`;
  }
  if (gap.p !== null && gap.p < 0.05) {
    return `${direction[0]!.toUpperCase()}${direction.slice(1)} on these races; may not hold on new ones`;
  }
  return "No difference we could detect";
}
