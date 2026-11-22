// Rabbit Hole site. Reads data/leaderboards.json, which npm run build-site
// writes from the committed traces, and fills the page from it. Nothing here
// computes a score: the build did that with the eval code.

import { escapeHtml, formatNumber } from "./format.js";
import { renderLeaderboard } from "./leaderboard.js";

const REPO = "https://github.com/IainAndrew/rabbit-hole";

/** Fill every [data-fact] element with its fact, as text. */
function showFacts(facts) {
  for (const element of document.querySelectorAll("[data-fact]")) {
    const value = facts[element.dataset.fact];
    if (value !== undefined) {
      element.textContent = typeof value === "number" ? formatNumber(value) : value;
    }
  }
}

/** The headline facts: the model board's size and the limits every run had. */
function factsOf(data) {
  const models = data.boards.find((board) => board.id === "models");
  const runs = data.boards.reduce(
    (sum, board) =>
      sum + board.entries.reduce((n, entry) => n + entry.score.decided + entry.score.crashed + entry.score.killed, 0),
    0,
  );
  return {
    models: models.entries.length,
    labs: new Set(models.entries.map((entry) => entry.model.lab)).size,
    runsPerModel: models.races.length * models.repeats,
    races: data.races.length,
    repeats: models.repeats,
    runs,
    maxTurns: models.limits.maxTurns,
    maxContextChars: models.limits.maxContextChars,
    maxOutputTokens: models.limits.maxOutputTokens,
  };
}

async function main() {
  const response = await fetch("data/leaderboards.json");
  if (!response.ok) {
    throw new Error(`data/leaderboards.json: HTTP ${response.status}. Run npm run build-site first.`);
  }
  const data = await response.json();
  showFacts(factsOf(data));
  const models = data.boards.find((board) => board.id === "models");
  renderLeaderboard(models, document.getElementById("model-board"));
  document.getElementById("model-board-source").innerHTML = sourceOf(models);
}

/** Where a board's numbers come from: its sweep folder and the commit it ran at. */
function sourceOf(board) {
  const commit = board.commit.slice(0, 7);
  return (
    `${board.races.length} races × ${board.repeats} runs each. ` +
    `From <a href="${REPO}/tree/main/results/${escapeHtml(board.sweep)}">results/${escapeHtml(board.sweep)}</a>, ` +
    `run at commit <a href="${REPO}/commit/${escapeHtml(board.commit)}"><code>${commit}</code></a>.`
  );
}

main().catch((error) => {
  console.error(error);
  const notice = document.createElement("p");
  notice.className = "load-error";
  notice.textContent = `The results didn't load: ${error.message}`;
  document.body.prepend(notice);
});
