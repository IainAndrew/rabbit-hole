import type { EndReason } from "@harness/agent/agent.ts";
import type { Interval } from "@harness/evals/intervals.ts";
import type { Score } from "@harness/evals/score.ts";
import { percent } from "../../format.ts";
import styles from "./SuccessCell.module.scss";

/**
 * A success rate as a number and as a dot on a 0–100% track, with its 95%
 * range as a band behind the dot, so overlapping ranges show at a glance.
 */
export function SuccessCell({ score, interval }: { score: Score; interval: Interval | null }) {
  if (score.successRate === null) {
    return <>–</>;
  }
  const range = interval ? `${percent(interval.low)}–${percent(interval.high)}` : "no range";
  return (
    <div className={styles.success}>
      <span>{percent(score.successRate)}</span>
      <span className={styles.track} role="img" aria-label={`${percent(score.successRate)}, 95% range ${range}`}>
        {interval && (
          <span
            className={styles.band}
            style={{ left: `${interval.low * 100}%`, width: `${(interval.high - interval.low) * 100}%` }}
          />
        )}
        <span className={styles.dot} style={{ left: `${score.successRate * 100}%` }} />
      </span>
      <span className="hint">
        {score.won}/{score.decided} won
      </span>
    </div>
  );
}

// How a lost run ended, in words. Won runs and crashes aren't losses.
const LOSS_REASONS: Partial<Record<EndReason, string>> = {
  gave_up: "gave up",
  turn_limit: "turn limit",
  context_limit: "context limit",
  output_limit: "output limit",
  refused: "no tool call",
};

/** The losing end reasons with a count, largest first, e.g. "14 output limit, 4 context limit". */
export function Losses({ endReasons }: { endReasons: Record<EndReason, number> }) {
  const losses = Object.entries(LOSS_REASONS)
    .map(([reason, words]) => [endReasons[reason as EndReason], words] as const)
    .filter(([count]) => count > 0)
    .sort(([a], [b]) => b - a);
  if (losses.length === 0) {
    return <span className="hint">none</span>;
  }
  return <>{losses.map(([count, words]) => `${count} ${words}`).join(", ")}</>;
}
