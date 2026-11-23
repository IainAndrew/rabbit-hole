// The replay stage: one turn of a run drawn as a picture rather than text.
// The path from start toward the target flag, every page the agent has looked
// at (sized by its link count, this turn's lit), moves the rules refused, its
// reasoning, and gauges for context, output and turns. A turn can be shown
// done, or mid-thought: the world as the turn began, its reasoning so far.

import { escapeHtml, formatNumber } from "./format.js";

/**
 * Draw the stage for `replay` into `container`.
 *
 * @returns show(count) draws the stage after `count` turns; think(count, chars)
 *   draws turn `count` before it acts, with `chars` of its reasoning written.
 */
export function renderStage(container, replay) {
  const steps = stepsOf(replay);
  const { start, end } = replay;
  container.innerHTML = `
    <div class="stage-top">
      <span class="stage-turn"></span>
      <span class="pips" aria-hidden="true">${"<i></i>".repeat(start.limits.maxTurns)}</span>
    </div>
    <ol class="lane" aria-label="Path so far"></ol>
    <div class="cloud-head hint">Pages it has looked at <span class="cloud-count"></span></div>
    <div class="cloud"></div>
    <div class="thought">
      <p class="thought-text"></p>
      <div class="thought-after"></div>
    </div>
    <div class="gauges">
      ${gauge("context", "Context sent")}
      ${gauge("output", "This reply")}
    </div>
    <div class="stamp" hidden></div>`;
  const part = (name) => container.querySelector(`.${name}`);
  const parts = Object.fromEntries(
    ["stage-turn", "pips", "lane", "cloud", "cloud-count", "thought-text", "thought-after", "stamp"].map((name) => [name, part(name)]),
  );

  // Pages already on the lane, so only new ones animate in.
  let onLane = Infinity;
  // The turn being thought through, so each new character only updates the text.
  let thinking = null;

  /** The turn counter, path and bubbles as they stood after `done` turns, with turn `count` under way. */
  const drawWorld = (count, done) => {
    const step = done === 0 ? null : steps[done - 1];
    const path = step?.path ?? [steps[0]?.path[0] ?? start.start];
    parts["stage-turn"].textContent = count === 0 ? "No turns" : `Turn ${count}`;
    [...parts.pips.children].forEach((pip, index) => {
      pip.className = index < count ? "done" : "";
    });
    parts.lane.innerHTML = laneHtml(path, start.target, end, done === steps.length, onLane);
    onLane = path.length;
    parts.cloud.innerHTML = step === null ? "" : cloudHtml(step, done === count ? done - 1 : -1);
    parts["cloud-count"].textContent = step === null ? "" : `(${step.looked.length})`;
    setGauge(container, "context", count === 0 ? 0 : steps[count - 1].turn.contextChars, start.limits.maxContextChars, "chars");
    parts.stamp.hidden = true;
  };

  const show = (count) => {
    thinking = null;
    drawWorld(count, count);
    const turn = count === 0 ? null : steps[count - 1].turn;
    parts["thought-text"].textContent = turn === null ? "It ended before the model's first reply." : wordsOf(turn);
    parts["thought-text"].scrollTop = 0;
    parts["thought-after"].innerHTML = turn === null ? "" : afterHtml(turn);
    setGauge(container, "output", turn?.usage.completionTokens ?? 0, start.limits.maxOutputTokens, "tokens");
    if (count === steps.length && end !== null) {
      const won = end.end.kind === "finished" && end.end.reason === "won";
      parts.stamp.hidden = false;
      parts.stamp.className = `stamp ${won ? "won" : "lost"}`;
      parts.stamp.textContent = won ? `Won in ${end.hops} ${end.hops === 1 ? "hop" : "hops"}` : stampText(end);
    }
  };

  const think = (count, chars) => {
    const turn = steps[count - 1].turn;
    if (thinking !== count) {
      thinking = count;
      drawWorld(count, count - 1);
      parts["thought-after"].innerHTML = "";
    }
    const words = wordsOf(turn);
    parts["thought-text"].textContent = words.slice(0, chars);
    parts["thought-text"].scrollTop = parts["thought-text"].scrollHeight;
    // The reply's tokens, shown filling as its text is written.
    const written = words.length === 0 ? 0 : Math.min(1, chars / words.length);
    setGauge(container, "output", Math.round(turn.usage.completionTokens * written), start.limits.maxOutputTokens, "tokens");
  };

  return { show, think, wordsOf };
}

/** A turn's reasoning, or what it said if it gave none, or a note that it gave neither. */
function wordsOf(turn) {
  return turn.reasoning ?? turn.content ?? "No reasoning this turn.";
}

/** What the run had done after each turn: its path, the pages it had looked at, the moves refused. */
function stepsOf(replay) {
  const path = [replay.end?.path[0] ?? replay.start.start];
  const looked = new Map();
  const refused = new Map();
  return replay.turns.map((turn, index) => {
    for (const call of turn.calls) {
      const listed = /^Links on "(.*)" \((\d+)\):/.exec(call.result);
      if (call.name === "get_links" && call.status === "ok" && listed !== null) {
        const seen = looked.get(listed[1]);
        looked.set(listed[1], { page: listed[1], links: Number(listed[2]), times: (seen?.times ?? 0) + 1, turn: index });
      } else if (call.name === "move_to" && call.status === "ok") {
        path.push(call.pageAfter);
      } else if (call.name === "move_to" && call.status === "error") {
        const page = pageOf(call.arguments);
        refused.set(page, { page, times: (refused.get(page)?.times ?? 0) + 1, turn: index });
      }
    }
    return { turn, path: [...path], looked: [...looked.values()], refused: [...refused.values()] };
  });
}

/** The page a tool call named, or its raw arguments if they don't parse. */
function pageOf(args) {
  try {
    return String(JSON.parse(args).page ?? args);
  } catch {
    return args;
  }
}

/**
 * The path as nodes, the current page lit, then a gap and the target flag
 * until it's reached. Nodes from index `fresh` on are new this turn.
 */
function laneHtml(path, target, end, finished, fresh) {
  const won = finished && end?.end.kind === "finished" && end.end.reason === "won";
  const nodes = path.map((page, index) => {
    const role = index === 0 ? "start" : won && index === path.length - 1 ? "target" : "";
    const here = index === path.length - 1 ? " here" : "";
    const isNew = index >= fresh ? " new" : "";
    return `<li class="node ${role}${here}${isNew}"><span>${escapeHtml(page)}</span></li>`;
  });
  if (!won) {
    nodes.push(`<li class="lane-gap" aria-hidden="true">?</li>`);
    nodes.push(`<li class="node target flag"><span>${escapeHtml(target)}</span></li>`);
  }
  return nodes.join("");
}

/** Every page looked at so far, sized by its link count, this turn's lit; then refused moves. */
function cloudHtml(step, turnIndex) {
  const pages = step.looked.map((seen) => {
    const size = Math.min(1.1, 0.72 + Math.log10(seen.links + 1) * 0.12);
    const again = seen.times > 1 ? ` ×${seen.times}` : "";
    return `<span class="bubble${seen.turn === turnIndex ? " now" : ""}" style="font-size: ${size.toFixed(2)}rem"
      title="${formatNumber(seen.links)} links">${escapeHtml(seen.page)}<small>${formatNumber(seen.links)}${again}</small></span>`;
  });
  const refused = step.refused.map(
    (move) =>
      `<span class="bubble refused${move.turn === turnIndex ? " now" : ""}" title="Move refused: not a link from where it stood">✕ ${escapeHtml(move.page)}${move.times > 1 ? `<small>×${move.times}</small>` : ""}</span>`,
  );
  return [...pages, ...refused].join("") || `<span class="hint">Nothing yet.</span>`;
}

/** What follows a turn's thinking: the cut-off tag if the reply hit the limit, then its actions. */
function afterHtml(turn) {
  const cut = turn.finishReason === "length" ? `<span class="cut">Cut off at the output limit: no tool call</span>` : "";
  return `${cut}<div class="actions">${turn.calls.map(actionHtml).join("")}</div>`;
}

/** One tool call as a short action: what the agent did this turn. */
function actionHtml(call) {
  const page = escapeHtml(pageOf(call.arguments));
  if (call.name === "get_links") {
    return `<span class="action look">Looked up ${page}</span>`;
  }
  if (call.name === "move_to") {
    return call.status === "ok"
      ? `<span class="action move">Moved to ${escapeHtml(call.pageAfter)}</span>`
      : `<span class="action refused">Tried ${page}: refused</span>`;
  }
  if (call.name === "give_up") {
    return `<span class="action refused">Gave up: ${escapeHtml(reasonOf(call.arguments))}</span>`;
  }
  return `<span class="action refused">${escapeHtml(call.name)}: not a tool</span>`;
}

/** The reason a give_up call gave, or its raw arguments if they don't parse. */
function reasonOf(args) {
  try {
    return String(JSON.parse(args).reason ?? args);
  } catch {
    return args;
  }
}

/** A labelled gauge; setGauge fills it. */
function gauge(name, label) {
  return `
    <div class="gauge" data-gauge="${name}">
      <span class="hint">${label}</span>
      <span class="gauge-track"><span class="gauge-fill"></span></span>
      <span class="gauge-value"></span>
    </div>`;
}

/** Fill a gauge to value / limit, red once it reaches the limit. */
function setGauge(container, name, value, limit, unit) {
  const element = container.querySelector(`[data-gauge="${name}"]`);
  const share = Math.min(1, value / limit);
  element.querySelector(".gauge-fill").style.width = `${share * 100}%`;
  element.classList.toggle("full", share >= 1);
  element.querySelector(".gauge-value").textContent = `${formatNumber(value)} / ${formatNumber(limit)} ${unit}`;
}

/** How a lost or crashed run ended, short enough for a stamp. */
function stampText(end) {
  if (end.end.kind === "crashed") {
    return "Crashed: not counted";
  }
  const words = {
    gave_up: "Gave up",
    turn_limit: "Out of turns",
    context_limit: "Out of context",
    output_limit: "Cut off",
    refused: "No tool call",
  };
  return `${words[end.end.reason]} after ${end.hops} ${end.hops === 1 ? "hop" : "hops"}`;
}
