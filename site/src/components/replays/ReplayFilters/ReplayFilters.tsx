// Which runs to show, as three plain choices: a model, a context strategy and
// a prompt. Not every combination was run, so options a model never ran with
// are greyed out, and picking one that doesn't fit the other choice resets
// that choice to the usual setting.
//
// Some setups ran in more than one sweep (each experiment re-ran its own
// baseline). A choice opens the first board that has it: the leaderboard for
// the usual setup, the experiment for a changed one.

import type { Board } from "@harness/site-data/leaderboards.ts";
import { evalPathOf } from "../../../replayLinks.ts";
import { promptName, strategyName } from "../../../settings.ts";
import styles from "./ReplayFilters.module.scss";

const USUAL = { context: "full", prompt: "fewest-hops" };

type Setup = { model: string; context: string; prompt: string };

export function ReplayFilters({
  boards,
  evalPath,
  onChange,
}: {
  boards: Board[];
  evalPath: string;
  onChange: (evalPath: string) => void;
}) {
  const all = boards.flatMap((board) => board.entries.map((entry) => ({ path: evalPathOf(board, entry), entry })));
  const current = all.find((candidate) => candidate.path === evalPath)?.entry ?? all[0]!.entry;
  const setup: Setup = { model: current.model.id, context: current.context, prompt: current.prompt };
  const ofModel = all.filter((candidate) => candidate.entry.model.id === setup.model);

  const pathOf = (wanted: Setup) =>
    all.find(
      ({ entry }) => entry.model.id === wanted.model && entry.context === wanted.context && entry.prompt === wanted.prompt,
    )?.path;
  // Change one choice; if that combination wasn't run, the others go back to usual.
  const pick = (change: Partial<Setup>) => {
    const wanted = { ...setup, ...change };
    const path =
      pathOf(wanted) ?? pathOf({ ...USUAL, ...change, model: wanted.model }) ?? pathOf({ ...USUAL, model: wanted.model });
    if (path !== undefined) {
      onChange(path);
    }
  };

  const models = unique(all.map(({ entry }) => entry.model.id)).map(
    (id) => all.find(({ entry }) => entry.model.id === id)!.entry.model,
  );
  const contexts = unique(all.map(({ entry }) => entry.context));
  const prompts = unique(all.map(({ entry }) => entry.prompt));
  const ran = (key: "context" | "prompt", value: string) => ofModel.some(({ entry }) => entry[key] === value);

  return (
    <div className={styles.filters}>
      <label className={styles.field}>
        <span className={styles.label}>Model</span>
        <select value={setup.model} onChange={(event) => pick({ model: event.target.value })}>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Context strategy</span>
        <select value={setup.context} onChange={(event) => pick({ context: event.target.value })}>
          {contexts.map((context) => (
            <option key={context} value={context} disabled={!ran("context", context)}>
              {optionText(strategyName(context), context === USUAL.context, ran("context", context))}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Prompt</span>
        <select value={setup.prompt} onChange={(event) => pick({ prompt: event.target.value })}>
          {prompts.map((prompt) => (
            <option key={prompt} value={prompt} disabled={!ran("prompt", prompt)}>
              {optionText(promptName(prompt), prompt === USUAL.prompt, ran("prompt", prompt))}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function optionText(name: string, usual: boolean, ran: boolean): string {
  if (!ran) {
    return `${name} (not run for this model)`;
  }
  return usual ? `${name} (usual)` : name;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
