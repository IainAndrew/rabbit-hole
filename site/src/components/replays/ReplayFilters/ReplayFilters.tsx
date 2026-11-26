// Which runs to show, as two plain choices: a model, then a setup it ran
// with. A setup is a context strategy and a prompt together, and the list
// only offers the ones that model actually ran: most ran only the default one.
//
// Some setups ran in more than one sweep (each experiment re-ran its own
// baseline). A choice opens the first board that has it: the leaderboard for
// the default setup, the experiment for a changed one.

import type { Board, BoardEntry } from "@harness/site-data/leaderboards.ts";
import { evalPathOf } from "../../../replayLinks.ts";
import { promptName, strategyName } from "../../../settings.ts";
import styles from "./ReplayFilters.module.scss";

const DEFAULT = { context: "full", prompt: "fewest-hops" };

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

  const models = unique(all.map(({ entry }) => entry.model.id)).map(
    (id) => all.find(({ entry }) => entry.model.id === id)!.entry.model,
  );
  // Each setup this model ran, once, at the first board that has it; the default setup first.
  const setups = new Map<string, { path: string; entry: BoardEntry }>();
  for (const candidate of all.filter(({ entry }) => entry.model.id === current.model.id)) {
    if (!setups.has(setupKey(candidate.entry))) {
      setups.set(setupKey(candidate.entry), candidate);
    }
  }
  const options = [...setups.entries()].sort(([, a], [, b]) => Number(!isDefault(a.entry)) - Number(!isDefault(b.entry)));

  // A new model opens its default setup, or failing that its first.
  const pickModel = (modelId: string) => {
    const ofModel = all.filter(({ entry }) => entry.model.id === modelId);
    onChange((ofModel.find(({ entry }) => isDefault(entry)) ?? ofModel[0]!).path);
  };

  return (
    <div className={styles.filters}>
      <label className={styles.field}>
        <span className={styles.label}>Model</span>
        <span className={styles.select}>
          <select value={current.model.id} onChange={(event) => pickModel(event.target.value)}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Setup</span>
        <span className={styles.select}>
          <select
            value={setupKey(current)}
            onChange={(event) => onChange(setups.get(event.target.value)!.path)}
            disabled={options.length < 2}
          >
            {options.map(([key, { entry }]) => (
              <option key={key} value={key}>
                {setupName(entry)}
              </option>
            ))}
          </select>
        </span>
      </label>
    </div>
  );
}

function setupKey(entry: BoardEntry): string {
  return `${entry.context}/${entry.prompt}`;
}

function isDefault(entry: BoardEntry): boolean {
  return entry.context === DEFAULT.context && entry.prompt === DEFAULT.prompt;
}

/** "Default", or what the setup changes: "Context: Masking", "Prompt: Target first, then hops". */
function setupName(entry: BoardEntry): string {
  const changes = [];
  if (entry.context !== DEFAULT.context) {
    changes.push(`Context: ${strategyName(entry.context)}`);
  }
  if (entry.prompt !== DEFAULT.prompt) {
    changes.push(`Prompt: ${promptName(entry.prompt)}`);
  }
  return changes.length === 0 ? "Default" : changes.join(", ");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
