// Stepping through a replay, one turn at a time, at the reader's pace. Next
// plays a turn the way the model worked: its reasoning streams in, then it
// acts and the stage shows what changed, then it waits. Previous steps back.
// Running totals of hops, tokens, cost and time sit beside the controls.

import { formatNumber } from "./format.js";
import { renderStage } from "./stage.js";

const TICK_MS = 40;
// About 250 characters a second, roughly 60 tokens: a little slower than a
// fast model, so it can be read as it arrives.
const CHARS_PER_TICK = 10;
// No turn's thinking takes longer than this to stream: long ones speed up.
const MAX_THINKING_MS = 10_000;
// Between the thinking and the turn acting.
const BEAT_MS = 300;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// The thought streaming now, if any, so a new run or a step can stop it.
let streaming = null;

/** Add the stage and its step controls to a rendered replay in `view`, open on its first turn. */
export function attachPlayback(view, replay) {
  cancelStream();
  const turns = replay.turns;
  const totals = runningTotals(turns);
  const stage = renderStage(view.querySelector(".stage"), replay);
  const card = view.querySelector(".stage-card");
  const bar = view.querySelector(".playback");
  bar.innerHTML = `
    <div class="playback-controls" role="group" aria-label="Step through the run">
      <button type="button" data-action="previous">◀ Previous</button>
      <button type="button" data-action="next">Next ▶</button>
      <button type="button" data-action="start">Restart</button>
    </div>
    <progress max="${turns.length}" value="0" aria-label="Turns shown"></progress>
    <dl class="playback-totals"></dl>`;
  const buttons = Object.fromEntries([...bar.querySelectorAll("button")].map((button) => [button.dataset.action, button]));
  // A run opens on its first turn; only a run that crashed before any reply has none.
  const first = Math.min(1, turns.length);
  let shown = first;

  const show = (count) => {
    cancelStream();
    shown = count;
    const sofar = count === 0 ? { tokens: 0, cost: 0, hops: 0, seconds: 0 } : totals[count - 1];
    bar.querySelector("progress").value = count;
    bar.querySelector(".playback-totals").innerHTML = totalsHtml(sofar);
    buttons.start.disabled = buttons.previous.disabled = count <= first;
    buttons.next.disabled = count === turns.length;
    stage.show(count);
  };

  /** Stream turn `count`'s reasoning, then show the turn done, unless stopped first. */
  const playTurn = async (count) => {
    const stream = { cancelled: false, count };
    streaming = stream;
    const words = stage.wordsOf(turns[count - 1]);
    const perTick = Math.max(CHARS_PER_TICK, Math.ceil(words.length / (MAX_THINKING_MS / TICK_MS)));
    let chars = reducedMotion.matches ? words.length : 0;
    while (chars < words.length) {
      stage.think(count, chars);
      await sleep(TICK_MS);
      if (stream.cancelled) {
        return;
      }
      chars = nextWordEnd(words, chars + perTick);
    }
    stage.think(count, words.length);
    await sleep(BEAT_MS);
    if (!stream.cancelled) {
      show(count);
    }
  };

  const next = () => {
    if (streaming !== null) {
      // Pressing Next mid-thought finishes the turn now.
      show(streaming.count);
    } else if (shown < turns.length) {
      buttons.start.disabled = buttons.previous.disabled = false;
      playTurn(shown + 1);
    }
  };

  const actions = {
    start: () => show(first),
    // Mid-thought, the turn on screen is the one before the thought: stay there.
    previous: () => show(streaming === null ? Math.max(first, shown - 1) : streaming.count - 1),
    next,
    end: () => show(turns.length),
  };

  bar.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (action !== undefined) {
      actions[action]();
    }
  });
  card.tabIndex = 0;
  card.addEventListener("keydown", (event) => {
    const action = { ArrowRight: "next", ArrowLeft: "previous", Home: "start", End: "end" }[event.key];
    if (action !== undefined) {
      event.preventDefault();
      actions[action]();
    }
  });
  show(first);
}

/** Stop the thought streaming now, if any. */
function cancelStream() {
  if (streaming !== null) {
    streaming.cancelled = true;
    streaming = null;
  }
}

/** Wait `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The end of the word at or after `index`, so text streams a word at a time. */
function nextWordEnd(words, index) {
  if (index >= words.length) {
    return words.length;
  }
  const space = words.indexOf(" ", index);
  return space === -1 ? words.length : space;
}

/**
 * After each turn: tokens sent and cost so far, hops taken, and seconds since
 * the run started. Cost is null from the first turn whose cost is unknown.
 */
function runningTotals(turns) {
  let tokens = 0;
  let cost = 0;
  let hops = 0;
  return turns.map((turn) => {
    tokens += turn.usage.promptTokens;
    cost = cost === null || turn.usage.cost === null ? null : cost + turn.usage.cost;
    hops += turn.calls.filter((call) => call.name === "move_to" && call.status === "ok").length;
    return { tokens, cost, hops, seconds: turn.t / 1000 };
  });
}

/** The running totals as a row of figures. */
function totalsHtml(sofar) {
  const figures = [
    ["Hops", String(sofar.hops)],
    ["Tokens sent", formatNumber(sofar.tokens)],
    ["Cost", sofar.cost === null ? "unknown" : `$${sofar.cost.toFixed(4)}`],
    ["Time", `${sofar.seconds.toFixed(1)} s`],
  ];
  return figures.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
}
