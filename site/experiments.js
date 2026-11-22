// The strategy and prompt boards: one model at a time, each change beside
// that model's usual setup, with the gap between them and how sure we are.
// The gaps, ranges and p-values were all computed at build time.

import { escapeHtml } from "./format.js";
import { lossesText, successCell } from "./leaderboard.js";

// What each context strategy shows the model each turn.
const STRATEGIES = {
  full: "Everything: the whole conversation, every link list.",
  masked: "Link lists older than the last 2 turns cut to their first line.",
  state: "One fresh message of facts each turn, none of the model's own words.",
};

/** Render a board with a baseline as one table, grouped by model, into `container`. */
export function renderExperiment(board, container) {
  const groups = byModel(board.entries);
  container.innerHTML = `
    <div class="table-scroll">
      <table class="leaderboard experiment">
        <thead>
          <tr>
            <th scope="col">${board.baseline.varies === "context" ? "Context strategy" : "Prompt"}</th>
            <th scope="col">Success rate <span class="hint">with its 95% range</span></th>
            <th scope="col">Against the usual setup</th>
            <th scope="col">How the losses ended</th>
          </tr>
        </thead>
        ${groups.map((entries) => groupOf(entries, board.baseline)).join("")}
      </table>
    </div>`;
}

/** The entries grouped by model, in board order, each group's baseline first. */
function byModel(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const group = groups.get(entry.model.id) ?? [];
    group.push(entry);
    groups.set(entry.model.id, group);
  }
  return [...groups.values()].map((group) => [
    ...group.filter((entry) => entry.vsBaseline === null),
    ...group.filter((entry) => entry.vsBaseline !== null),
  ]);
}

/** One model's rows, under a heading row naming it. */
function groupOf(entries, baseline) {
  const rows = entries
    .map(
      (entry) => `
        <tr>
          <th scope="row" class="setting">${settingCell(entry, baseline)}</th>
          <td>${successCell(entry.score, entry.interval)}</td>
          <td class="gap">${gapCell(entry.vsBaseline)}</td>
          <td class="losses">${lossesText(entry.endReasons)}</td>
        </tr>`,
    )
    .join("");
  return `
    <tbody>
      <tr class="group"><th scope="rowgroup" colspan="4">${escapeHtml(entries[0].model.name)}</th></tr>
      ${rows}
    </tbody>`;
}

/** The setting's name and what it means: a strategy described, a prompt quoted. */
function settingCell(entry, baseline) {
  const name = baseline.varies === "context" ? entry.context : entry.prompt;
  const usual = name === baseline.value ? ` <span class="usual">usual</span>` : "";
  const meaning =
    baseline.varies === "context" ? (STRATEGIES[name] ?? "") : entry.systemPrompt ? `“${entry.systemPrompt}”` : "";
  return `<code>${escapeHtml(name)}</code>${usual}<span class="hint">${escapeHtml(meaning)}</span>`;
}

/**
 * The gap to the baseline in points, with its range and p, and what they add
 * up to. A range that excludes 0 holds on new races like these; a small p
 * alone holds on these races only.
 */
function gapCell(gap) {
  if (gap === null) {
    return `<span class="hint">the baseline</span>`;
  }
  const points = (rate) => {
    const rounded = Math.round(rate * 100);
    return rounded > 0 ? `+${rounded}` : String(rounded);
  };
  const p = gap.p === null ? "" : gap.p < 0.001 ? "p < 0.001" : `p = ${gap.p.toFixed(3)}`;
  const range = gap.interval ? `range ${points(gap.interval.low)} to ${points(gap.interval.high)}` : "";
  return `
    <span class="gap-points">${points(gap.gap)} points</span>
    <span class="hint">${[range, p].filter(Boolean).join(", ")}</span>
    <span class="verdict">${verdict(gap)}</span>`;
}

/** What a gap's range and p say, in words. */
function verdict(gap) {
  const excludesZero = gap.interval !== null && (gap.interval.low > 0 || gap.interval.high < 0);
  const direction = gap.gap > 0 ? "better" : "worse";
  if (excludesZero) {
    return `Clearly ${direction}`;
  }
  if (gap.p !== null && gap.p < 0.05) {
    return `${direction[0].toUpperCase()}${direction.slice(1)} on these races; may not hold on new ones`;
  }
  return "No difference we could detect";
}
