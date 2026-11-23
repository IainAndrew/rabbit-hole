// Replays: pick an eval, see every race and repeat it ran as a grid of
// outcomes, and open one run turn by turn. Each run's replay is loaded only
// when it's opened; build-site wrote it from the run's trace.

import { escapeHtml, formatNumber } from "./format.js";
import { attachPlayback } from "./playback.js";

const ENDINGS = {
  won: "Won",
  gave_up: "Gave up",
  turn_limit: "Hit the turn limit",
  context_limit: "Hit the context limit",
  output_limit: "Hit the output limit",
  refused: "Replied without a tool call",
};

/**
 * Set up the picker in `container` and open a run: the one the address names
 * (#run=sweep/eval/race-rN), or else the first eval's first run. A link to
 * such an address anywhere on the page opens that run.
 */
export function renderReplays(data, container) {
  container.innerHTML = `
    <label class="picker">Eval
      <select id="replay-eval">${data.boards.map(optionGroup).join("")}</select>
    </label>
    <div id="replay-grid" class="replay-grid"></div>
    <div id="replay-view" class="replay-view" aria-live="polite"></div>`;
  const select = container.querySelector("#replay-eval");
  const open = (wanted) => {
    if (wanted !== null) {
      select.value = wanted.evalPath;
    }
    showGrid(data, select.value, wanted).catch(showError);
  };
  select.addEventListener("change", () => open(null));
  const openFromAddress = () => {
    const wanted = runInAddress(select);
    if (wanted !== null) {
      open(wanted);
      document.getElementById("replays").scrollIntoView();
    }
    return wanted;
  };
  window.addEventListener("hashchange", openFromAddress);
  if (openFromAddress() === null) {
    open(null);
  }
}

/** The run the address names, if it names one of the picker's evals; else null. */
function runInAddress(select) {
  const match = /^#run=([^/]+\/[^/]+)\/(.+)-r(\d+)$/.exec(decodeURIComponent(location.hash));
  if (match === null || ![...select.options].some((option) => option.value === match[1])) {
    return null;
  }
  return { evalPath: match[1], raceId: match[2], repeat: Number(match[3]) };
}

/** One board's evals as a group of options; each value is "sweep/eval". */
function optionGroup(board) {
  const options = board.entries.map(
    (entry) =>
      `<option value="${escapeHtml(`${board.sweep}/${entry.eval}`)}">${escapeHtml(
        `${entry.model.name} / ${entry.context} / ${entry.prompt}`,
      )}</option>`,
  );
  return `<optgroup label="${escapeHtml(board.title)}">${options.join("")}</optgroup>`;
}

/** Fetch a JSON file from the site's data, failing loudly on a bad response. */
async function load(path) {
  const response = await fetch(`data/runs/${path}`);
  if (!response.ok) {
    throw new Error(`data/runs/${path}: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Every race the eval ran, one row each, with a button per repeat; then open
 * the wanted run, or the first.
 */
async function showGrid(data, evalPath, wanted) {
  const runs = await load(`${evalPath}/index.json`);
  const grid = document.getElementById("replay-grid");
  grid.innerHTML = data.races
    .map((race) => {
      const repeats = runs
        .filter((run) => run.raceId === race.id)
        .sort((a, b) => a.repeat - b.repeat)
        .map(
          (run) =>
            `<button class="outcome ${run.outcome}" data-file="${escapeHtml(run.file)}"
              data-race="${escapeHtml(run.raceId)}" data-repeat="${run.repeat}"
              aria-label="${escapeHtml(`${race.start} to ${race.target}, run ${run.repeat}: ${run.outcome}`)}">${run.repeat}</button>`,
        )
        .join("");
      return `
        <div class="grid-row">
          <span class="grid-race">${escapeHtml(race.start)} → ${escapeHtml(race.target)}
            <span class="hint">${race.difficulty}, ${race.distance} hops at best</span></span>
          <span class="grid-runs">${repeats}</span>
        </div>`;
    })
    .join("");
  const buttons = [...grid.querySelectorAll("button")];
  for (const button of buttons) {
    button.addEventListener("click", () => {
      // Put the run in the address, so it can be shared or linked to.
      history.replaceState(null, "", `#run=${evalPath}/${button.dataset.race}-r${button.dataset.repeat}`);
      showRun(evalPath, button).catch(showError);
    });
  }
  // A run that crashed and was re-run has two buttons: the later one is the counted run.
  const named = buttons.filter(
    (button) => wanted !== null && button.dataset.race === wanted.raceId && Number(button.dataset.repeat) === wanted.repeat,
  );
  await showRun(evalPath, named.at(-1) ?? buttons[0]);
}

/** Load one run's replay and show it, marking its button as the open one. */
async function showRun(evalPath, button) {
  for (const other of document.querySelectorAll("#replay-grid button")) {
    other.removeAttribute("aria-current");
  }
  button.setAttribute("aria-current", "true");
  const replay = await load(`${evalPath}/${button.dataset.file}.json`);
  const view = document.getElementById("replay-view");
  view.innerHTML = replayHtml(replay);
  attachPlayback(view, replay);
}

/** A whole replay: what was run and how it ended, then the stage that steps through it. */
function replayHtml(replay) {
  const { start, end } = replay;
  return `
    <header class="replay-head">
      <h3>${escapeHtml(start.model.name)}: ${escapeHtml(start.start)} → ${escapeHtml(start.target)}</h3>
      <p class="replay-ending ${end?.end.kind === "finished" && end.end.reason === "won" ? "won" : "lost"}">${endingText(end)}</p>
      <p class="hint">context <code>${escapeHtml(start.contextStrategy)}</code>, prompt <code>${escapeHtml(start.promptVariant)}</code>,
        commit <code>${escapeHtml(start.gitCommit.slice(0, 7))}</code></p>
    </header>
    <div class="stage-card">
      <div class="playback"></div>
      <div class="stage"></div>
    </div>`;
}

/** How the run ended, with its totals. */
function endingText(end) {
  if (end === null) {
    return "Killed before it finished: no totals.";
  }
  const totals = `${end.turns} turns, ${formatNumber(end.totals.promptTokens)} prompt tokens, ` +
    `${end.totals.cost === null ? "cost unknown" : money(end.totals.cost)}, ${(end.totals.durationMs / 1000).toFixed(1)} s`;
  if (end.end.kind === "crashed") {
    return `Crashed (${escapeHtml(end.end.cause)}): not counted. ${totals}`;
  }
  const hops = end.end.reason === "won" ? ` in ${end.hops} ${end.hops === 1 ? "hop" : "hops"}` : ` after ${end.hops} hops`;
  return `${ENDINGS[end.end.reason]}${hops}. ${totals}`;
}

/** Dollars to four places. */
function money(dollars) {
  return `$${dollars.toFixed(4)}`;
}

/** Show a failure in the replay area rather than failing silently. */
function showError(error) {
  console.error(error);
  document.getElementById("replay-view").textContent = `This replay didn't load: ${error.message}`;
}
