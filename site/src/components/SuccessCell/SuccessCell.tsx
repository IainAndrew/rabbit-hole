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
