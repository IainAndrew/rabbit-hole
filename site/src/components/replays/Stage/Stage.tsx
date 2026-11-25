// The replay stage: one turn of a run drawn as a picture rather than text.
// The path from start toward the target flag, every page the agent has looked
// at (sized by its link count, this turn's lit), moves the rules refused, its
// reasoning, and gauges for context, output and turns. Mid-thought, it shows
// the world as the turn began and the reasoning written so far.

import { useEffect, useRef } from "react";
import type { Replay } from "@harness/site-data/replays.ts";
import { cx, formatNumber } from "../../../format.ts";
import { actionOf, isWin, stampText, wordsOf, type Step } from "../model.ts";
import styles from "./Stage.module.scss";
import type { Thinking } from "../useStepper.ts";

type Props = { replay: Replay; steps: Step[]; shown: number; thinking: Thinking | null };

export function Stage({ replay, steps, shown, thinking }: Props) {
  const { start, end } = replay;
  const count = thinking?.count ?? shown;
  // Mid-thought, the turn hasn't acted yet: the world is as the turn before left it.
  const done = thinking === null ? shown : thinking.count - 1;
  const world = done === 0 ? null : steps[done - 1]!;
  const turn = count === 0 ? null : steps[count - 1]!.turn;
  const finished = thinking === null && shown === steps.length && end !== null;

  const words = turn === null ? "It ended before the model's first reply." : wordsOf(turn);
  const written = thinking === null ? words.length : thinking.chars;
  const output = turn === null ? 0 : Math.round(turn.usage.completionTokens * Math.min(1, written / Math.max(1, words.length)));

  // Keep the newest words in view while they stream; start at the top otherwise.
  const thoughtBox = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const box = thoughtBox.current;
    if (box !== null) {
      box.scrollTop = thinking === null ? 0 : box.scrollHeight;
    }
  }, [written, thinking]);

  return (
    <div className={styles.stage}>
      <div className={styles.top}>
        <span className={styles.turn}>{count === 0 ? "No turns" : `Turn ${count}`}</span>
        <span className={styles.pips} aria-hidden="true">
          {Array.from({ length: start.limits.maxTurns }, (_, index) => (
            <i key={index} className={cx(index < count && styles.done)} />
          ))}
        </span>
      </div>

      <Lane path={world?.path ?? [steps[0]?.path[0] ?? start.start]} target={start.target} won={finished && isWin(end)} />

      <span className="hint">Pages it has looked at {world !== null && `(${world.looked.length})`}</span>
      <div className={styles.cloud}>
        {world === null || world.looked.length + world.refused.length === 0 ? (
          <span className="hint">Nothing yet.</span>
        ) : (
          <Bubbles step={world} lit={thinking === null ? done - 1 : -1} />
        )}
      </div>

      <div className={styles.thought}>
        <p ref={thoughtBox} className={styles.thoughtText}>
          {words.slice(0, written)}
        </p>
        {thinking === null && turn !== null && (
          <>
            {turn.finishReason === "length" && <span className={styles.cut}>Cut off at the output limit: no tool call</span>}
            <div className={styles.actions}>
              {turn.calls.map((call, index) => {
                const action = actionOf(call);
                return (
                  <span key={index} className={cx(styles.action, styles[action.kind])}>
                    {action.text}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className={styles.gauges}>
        <Gauge label="Context sent" value={turn?.contextChars ?? 0} limit={start.limits.maxContextChars} unit="chars" />
        <Gauge label="This reply" value={output} limit={start.limits.maxOutputTokens} unit="tokens" />
      </div>

      {finished && end !== null && (
        <div className={cx(styles.stamp, isWin(end) ? styles.won : styles.lost)}>{stampText(end.end, end.hops)}</div>
      )}
    </div>
  );
}

/**
 * The path as nodes, the current page lit, then a gap and the target flag
 * until it's reached. Each node is keyed by its place, so only a page new
 * this turn mounts, and only it plays the arrival animation.
 */
function Lane({ path, target, won }: { path: string[]; target: string; won: boolean }) {
  return (
    <ol className={styles.lane} aria-label="Path so far">
      {path.map((page, index) => (
        <li
          key={`${index}-${page}`}
          className={cx(
            styles.node,
            index === 0 && styles.start,
            index === path.length - 1 && styles.here,
            won && index === path.length - 1 && styles.reached,
          )}
        >
          <span>{page}</span>
        </li>
      ))}
      {!won && (
        <>
          <li className={styles.gap} aria-hidden="true">
            ?
          </li>
          <li className={cx(styles.node, styles.flag)}>
            <span>{target}</span>
          </li>
        </>
      )}
    </ol>
  );
}

/** Every page looked at, sized by its link count, `lit` turn's in the accent; then moves refused. */
function Bubbles({ step, lit }: { step: Step; lit: number }) {
  return (
    <>
      {step.looked.map((seen) => (
        <span
          key={seen.page}
          className={cx(styles.bubble, seen.turn === lit && styles.now)}
          style={{ fontSize: `${Math.min(1.1, 0.72 + Math.log10(seen.links + 1) * 0.12).toFixed(2)}rem` }}
          title={`${formatNumber(seen.links)} links`}
        >
          {seen.page}
          <small>
            {formatNumber(seen.links)}
            {seen.times > 1 && ` ×${seen.times}`}
          </small>
        </span>
      ))}
      {step.refused.map((move) => (
        <span
          key={`refused-${move.page}`}
          className={cx(styles.bubble, styles.refused, move.turn === lit && styles.now)}
          title="Move refused: not a link from where it stood"
        >
          ✕ {move.page}
          {move.times > 1 && <small>×{move.times}</small>}
        </span>
      ))}
    </>
  );
}

/** A labelled gauge filled to value / limit, red once it reaches the limit. */
function Gauge({ label, value, limit, unit }: { label: string; value: number; limit: number; unit: string }) {
  const share = Math.min(1, value / limit);
  return (
    <div className={cx(styles.gauge, share >= 1 && styles.full)}>
      <span className="hint">{label}</span>
      <span className={styles.track}>
        <span className={styles.fill} style={{ width: `${share * 100}%` }} />
      </span>
      <span className={styles.value}>
        {formatNumber(value)} / {formatNumber(limit)} {unit}
      </span>
    </div>
  );
}
