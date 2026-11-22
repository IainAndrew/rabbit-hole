// The model leaderboard: one row per model, in the order the build ranked
// them. Every number shown was computed by the eval code at build time.

import { escapeHtml, percent } from "./format.js";

// How a lost run ended, in words. Won runs and crashes aren't losses.
const LOSS_REASONS = {
  gave_up: "gave up",
  turn_limit: "turn limit",
  context_limit: "context limit",
  output_limit: "output limit",
  refused: "no tool call",
};

/** Render a board as a table into `container`. */
export function renderLeaderboard(board, container) {
  const rows = board.entries.map(rowOf).join("");
  container.innerHTML = `
    <div class="table-scroll">
      <table class="leaderboard">
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Model</th>
            <th scope="col">Success rate <span class="hint">with its 95% range</span></th>
            <th scope="col" class="number">Hops <span class="hint">on wins</span></th>
            <th scope="col" class="number">Cost <span class="hint">per win</span></th>
            <th scope="col">How the losses ended</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** One model's row. */
function rowOf(entry) {
  const { score, interval, rankRange } = entry;
  return `
    <tr>
      <td class="rank">
        <span class="rank-number">${entry.rank}</span>
        <span class="hint">${rankRangeText(rankRange)}</span>
      </td>
      <th scope="row" class="model">
        ${escapeHtml(entry.model.name)}
        <span class="hint">${escapeHtml(entry.model.lab)}</span>
      </th>
      <td>${successCell(score, interval)}</td>
      <td class="number">${score.meanHopsOnWins === null ? "–" : score.meanHopsOnWins.toFixed(1)}</td>
      <td class="number">${entry.costPerWin === null ? "–" : money(entry.costPerWin)}</td>
      <td class="losses">${lossesText(entry.endReasons)}</td>
    </tr>`;
}

/** "could be 2–7", or "clearly here" when the range is one rank. */
function rankRangeText({ best, worst }) {
  return best === worst ? "clearly here" : `could be ${best}–${worst}`;
}

/**
 * The rate as a number and as a dot on a 0–100% track, with its interval as
 * a band behind the dot, so overlapping ranges show at a glance.
 */
export function successCell(score, interval) {
  if (score.successRate === null) {
    return "–";
  }
  const band = interval
    ? `<span class="band" style="left: ${interval.low * 100}%; width: ${(interval.high - interval.low) * 100}%"></span>`
    : "";
  const range = interval ? `${percent(interval.low)}–${percent(interval.high)}` : "no range";
  return `
    <div class="success">
      <span class="success-rate">${percent(score.successRate)}</span>
      <span class="track" role="img" aria-label="${percent(score.successRate)}, 95% range ${range}">
        ${band}<span class="dot" style="left: ${score.successRate * 100}%"></span>
      </span>
      <span class="hint">${score.won}/${score.decided} won</span>
    </div>`;
}

/** The losing end reasons with a count, largest first, or "none". */
export function lossesText(endReasons) {
  const losses = Object.entries(LOSS_REASONS)
    .map(([reason, words]) => [endReasons[reason], words])
    .filter(([count]) => count > 0)
    .sort(([a], [b]) => b - a);
  if (losses.length === 0) {
    return `<span class="hint">none</span>`;
  }
  return losses.map(([count, words]) => `${count} ${words}`).join(", ");
}

/** Dollars to four places: most runs cost well under a cent. */
function money(dollars) {
  return `$${dollars.toFixed(4)}`;
}
