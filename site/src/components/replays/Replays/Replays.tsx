// Replays: pick an eval, see every race and repeat it ran as a grid of
// outcomes, and open one run in a modal to step through it on the stage. The
// open run is in the address (#run=sweep/eval/race-rN), so it can be shared,
// and a link to such an address anywhere on the page opens it. Each replay is
// loaded only when it's opened.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SiteData } from "@harness/site-data/leaderboards.ts";
import type { Replay, RunSummary } from "@harness/site-data/replays.ts";
import { loadJson } from "../../../data.ts";
import { cx } from "../../../format.ts";
import { ReplayModal } from "../ReplayModal/ReplayModal.tsx";
import { ReplayView } from "../ReplayView/ReplayView.tsx";
import { evalPathOf } from "../../../replayLinks.ts";
import { ReplayFilters } from "../ReplayFilters/ReplayFilters.tsx";
import styles from "./Replays.module.scss";

/** The eval picked, and the run open in it (race and repeat null: none open). */
type Choice = { evalPath: string; raceId: string | null; repeat: number | null };

export function Replays({ data }: { data: SiteData }) {
  const known = useMemo(
    () => new Set(data.boards.flatMap((board) => board.entries.map((entry) => evalPathOf(board, entry)))),
    [data],
  );
  const [choice, setChoice] = useState<Choice>(
    () =>
      choiceInAddress(known) ?? { evalPath: evalPathOf(data.boards[0]!, data.boards[0]!.entries[0]!), raceId: null, repeat: null },
  );
  const [runs, setRuns] = useState<{ evalPath: string; list: RunSummary[] } | null>(null);
  const [replay, setReplay] = useState<{ file: string; replay: Replay } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // A link to a run's address, from anywhere on the page, opens it over the
  // page; a link to an eval's runs shows them here.
  useEffect(() => {
    const open = () => {
      const wanted = choiceInAddress(known);
      if (wanted === null) {
        return;
      }
      setChoice(wanted);
      if (wanted.raceId === null) {
        showRunsHere();
      }
    };
    if (choiceInAddress(known)?.raceId === null) {
      showRunsHere();
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

  // Stable, so the modal doesn't reopen on every render.
  const close = useCallback(() => {
    setChoice((current) => ({ evalPath: current.evalPath, raceId: null, repeat: null }));
    history.replaceState(null, "", location.pathname + location.search);
  }, []);

  return (
    <section id="replays" aria-labelledby="replays-title">
      <h2 id="replays-title">Replays</h2>
      <p>
        Every run above, turn by turn: what the model thought, what it did, and how big its context grew. Choose a model,
        a context strategy and a prompt, then a run (green won, red lost, grey crashed and not counted) to open it, and step through it with Next or
        the arrow keys.
      </p>
      <ReplayFilters
        boards={data.boards}
        evalPath={choice.evalPath}
        onChange={(evalPath) => setChoice({ evalPath, raceId: null, repeat: null })}
      />

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
      {choice.raceId !== null && list !== null && (
        <ReplayModal onClose={close}>
          {run === null ? (
            <p className={styles.error}>This eval has no run of that race and repeat.</p>
          ) : replay !== null && replay.file === run.file ? (
            <ReplayView key={replay.file} replay={replay.replay} />
          ) : (
            <p className="hint">Loading the replay…</p>
          )}
        </ReplayModal>
      )}
    </section>
  );
}

/** The run the address names, if it names one of the known evals; else null. */
function choiceInAddress(known: Set<string>): Choice | null {
  const address = decodeURIComponent(location.hash);
  const runs = /^#runs=([^/]+\/[^/]+)$/.exec(address);
  if (runs !== null && known.has(runs[1]!)) {
    return { evalPath: runs[1]!, raceId: null, repeat: null };
  }
  const run = /^#run=([^/]+\/[^/]+)\/(.+)-r(\d+)$/.exec(address);
  if (run === null || !known.has(run[1]!)) {
    return null;
  }
  return { evalPath: run[1]!, raceId: run[2]!, repeat: Number(run[3]) };
}

/**
 * Bring the reader to the replays, and drop the #runs= address: the filters
 * now hold the choice, and the same link clicked again should work again.
 */
function showRunsHere() {
  document.getElementById("replays")?.scrollIntoView();
  history.replaceState(null, "", location.pathname + location.search);
}

/**
 * The run a choice names, if any. A run that crashed and was re-run is listed
 * twice: the later one is the counted run.
 */
function pick(list: RunSummary[], choice: Choice): RunSummary | null {
  const named = list.filter((summary) => summary.raceId === choice.raceId && summary.repeat === choice.repeat);
  return named.at(-1) ?? null;
}
