// One run: what was run and how it ended, then the stage and its step
// controls. Remount it (a new key) for each run, so stepping starts over.
// It lives in a modal, so while it's open the arrow keys step through it
// wherever focus is.

import { useEffect, useMemo } from "react";
import type { Replay } from "@harness/site-data/replays.ts";
import { cx, formatNumber, money } from "../../../format.ts";
import { endingText, isWin, stepsOf } from "../model.ts";
import styles from "./ReplayView.module.scss";
import { Stage } from "../Stage/Stage.tsx";
import { useStepper } from "../useStepper.ts";

const KEYS: Record<string, "next" | "previous" | "restart" | "end"> = {
  ArrowRight: "next",
  ArrowLeft: "previous",
  Home: "restart",
  End: "end",
};

export function ReplayView({ replay }: { replay: Replay }) {
  const steps = useMemo(() => stepsOf(replay), [replay]);
  const stepper = useStepper(steps);
  const { start, end } = replay;
  const totals = stepper.shown === 0 ? null : steps[stepper.shown - 1]!.totals;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = KEYS[event.key];
      if (action !== undefined && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        stepper[action]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepper]);

  return (
    <>
      <header className={styles.head}>
        <h3>
          {start.model.name}: {start.start} → {start.target}
        </h3>
        <p className={cx(styles.ending, isWin(end) ? styles.won : styles.lost)}>{endingText(end)}</p>
        <p className="hint">
          context <code>{start.contextStrategy}</code>, prompt <code>{start.promptVariant}</code>, commit{" "}
          <code>{start.gitCommit.slice(0, 7)}</code>
        </p>
      </header>
      <div className={styles.card}>
        <div className={styles.controls}>
          <div className={styles.buttons} role="group" aria-label="Step through the run">
            <button type="button" onClick={stepper.previous} disabled={stepper.thinking === null && stepper.shown <= stepper.first}>
              ◀ Previous
            </button>
            <button type="button" className={styles.next} onClick={stepper.next} disabled={stepper.shown === stepper.last}>
              Next ▶
            </button>
            <button type="button" onClick={stepper.restart} disabled={stepper.thinking === null && stepper.shown <= stepper.first}>
              Restart
            </button>
          </div>
          <progress max={Math.max(1, stepper.last)} value={stepper.shown} aria-label="Turns shown" />
          <dl className={styles.totals}>
            <Total label="Hops" value={String(totals?.hops ?? 0)} />
            <Total label="Tokens sent" value={formatNumber(totals?.tokens ?? 0)} />
            <Total label="Cost" value={totals?.cost === null ? "unknown" : money(totals?.cost ?? 0)} />
            <Total label="Time" value={`${(totals?.seconds ?? 0).toFixed(1)} s`} />
          </dl>
        </div>
        <Stage replay={replay} steps={steps} shown={stepper.shown} thinking={stepper.thinking} />
      </div>
    </>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
