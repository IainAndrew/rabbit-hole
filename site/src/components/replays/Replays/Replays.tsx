// Replays: pick an eval, see every race and repeat it ran as a grid of
// outcomes, and step through one run on the stage. The open run is in the
// address (#run=sweep/eval/race-rN), so it can be shared, and a link to such
// an address anywhere on the page opens it. Each replay is loaded only when
// it's opened.

import { useEffect, useMemo, useState } from "react";
import type { SiteData } from "@harness/site-data/leaderboards.ts";
import type { Replay, RunSummary } from "@harness/site-data/replays.ts";
import { loadJson } from "../../../data.ts";
import { cx } from "../../../format.ts";
import { ReplayView } from "../ReplayView/ReplayView.tsx";
import styles from "./Replays.module.scss";

/** Which run to show: an eval, and a race and repeat in it (null: its first run). */
type Choice = { evalPath: string; raceId: string | null; repeat: number | null };

export function Replays({ data }: { data: SiteData }) {
  const groups = useMemo(
    () =>
      data.boards.map((board) => ({
        title: board.title,
        options: board.entries.map((entry) => ({
          value: `${board.sweep}/${entry.eval}`,
          label: `${entry.model.name} / ${entry.context} / ${entry.prompt}`,
        })),
      })),
    [data],
  );
  const known = useMemo(() => new Set(groups.flatMap((group) => group.options.map((option) => option.value))), [groups]);
  const [choice, setChoice] = useState<Choice>(
    () => choiceInAddress(known) ?? { evalPath: groups[0]!.options[0]!.value, raceId: null, repeat: null },
  );
  const [runs, setRuns] = useState<{ evalPath: string; list: RunSummary[] } | null>(null);
  const [replay, setReplay] = useState<{ file: string; replay: Replay } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // A link to a run's address, from anywhere on the page, opens it here.
  useEffect(() => {
    const open = () => {
      const wanted = choiceInAddress(known);
      if (wanted !== null) {
        setChoice(wanted);
        document.getElementById("replays")?.scrollIntoView();
      }
    };
    if (choiceInAddress(known) !== null) {
      document.getElementById("replays")?.scrollIntoView();
    }
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [known]);

  useEffect(() => {
    let current = true;
    loadJson<RunSummary[]>(`data/runs/${choice.evalPath}/index.json`).then(
      (list) => current && setRuns({ evalPath: choice.evalPath, list }),
      setError,
    );
    return () => {
      current = false;
    };
  }, [choice.evalPath]);

  const list = runs?.evalPath === choice.evalPath ? runs.list : null;
  const run = list === null ? null : pick(list, choice);

  useEffect(() => {
    if (run === null) {
      return;
    }
    let current = true;
    loadJson<Replay>(`data/runs/${choice.evalPath}/${run.file}.json`).then(
      (loaded) => current && setReplay({ file: run.file, replay: loaded }),
      setError,
    );
    return () => {
      current = false;
    };
  }, [choice.evalPath, run]);

  const open = (summary: RunSummary) => {
    setChoice({ evalPath: choice.evalPath, raceId: summary.raceId, repeat: summary.repeat });
    // Put the run in the address, so it can be shared or linked to.
    history.replaceState(null, "", `#run=${choice.evalPath}/${summary.raceId}-r${summary.repeat}`);
  };

  return (
    <section id="replays" aria-labelledby="replays-title">
      <h2 id="replays-title">Replays</h2>
      <p>
        Every run above, turn by turn: what the model thought, what it did, and how big its context grew. Pick an eval,
        then a run (green won, red lost, grey crashed and not counted), and step through it with Next.
      </p>
      <label className={styles.picker}>
        Eval
        <select
          value={choice.evalPath}
          onChange={(event) => setChoice({ evalPath: event.target.value, raceId: null, repeat: null })}
        >
          {groups.map((group) => (
            <optgroup key={group.title} label={group.title}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {list !== null && (
        <div className={styles.grid}>
          {data.races.map((race) => (
            <div key={race.id} className={styles.row}>
              <span>
                {race.start} → {race.target}
                <span className="hint">
                  {race.difficulty}, {race.distance} hops at best
                </span>
              </span>
              <span className={styles.runs}>
                {list
                  .filter((summary) => summary.raceId === race.id)
                  .sort((a, b) => a.repeat - b.repeat)
                  .map((summary) => (
                    <button
                      key={summary.file}
                      type="button"
                      className={cx(styles.outcome, styles[summary.outcome])}
                      aria-current={summary.file === run?.file ? "true" : undefined}
                      aria-label={`${race.start} to ${race.target}, run ${summary.repeat}: ${summary.outcome}`}
                      onClick={() => open(summary)}
                    >
                      {summary.repeat}
                    </button>
                  ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {error !== null && <p className={styles.error}>This replay didn't load: {error.message}</p>}
      {replay !== null && replay.file === run?.file && <ReplayView key={replay.file} replay={replay.replay} />}
    </section>
  );
}

/** The run the address names, if it names one of the known evals; else null. */
function choiceInAddress(known: Set<string>): Choice | null {
  const match = /^#run=([^/]+\/[^/]+)\/(.+)-r(\d+)$/.exec(decodeURIComponent(location.hash));
  if (match === null || !known.has(match[1]!)) {
    return null;
  }
  return { evalPath: match[1]!, raceId: match[2]!, repeat: Number(match[3]) };
}

/**
 * The run a choice names, or the eval's first run. A run that crashed and was
 * re-run is listed twice: the later one is the counted run.
 */
function pick(list: RunSummary[], choice: Choice): RunSummary | null {
  const named = list.filter((summary) => summary.raceId === choice.raceId && summary.repeat === choice.repeat);
  return named.at(-1) ?? list[0] ?? null;
}
