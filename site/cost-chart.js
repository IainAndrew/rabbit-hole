// Success rate against cost per win, one dot per model: which model is best
// for the money? Drawn with Observable Plot at the container's real width, so
// text stays readable on a phone, and redrawn when that width changes.

import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm";
import { percent } from "./format.js";

const COST_TICKS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
// A narrow chart has room for every other tick.
const NARROW_TICKS = [0.002, 0.01, 0.05, 0.2];

/** Draw the chart into `container` and keep it sized to it. */
export function renderCostChart(board, container) {
  const entries = board.entries.filter((entry) => entry.costPerWin !== null && entry.score.successRate !== null);
  new ResizeObserver(() => container.replaceChildren(chartOf(entries, container.clientWidth))).observe(container);
}

/**
 * The models nobody beats on both counts: no other model is cheaper per win
 * and at least as successful. Cheapest first.
 */
function frontierOf(entries) {
  const byCost = [...entries].sort((a, b) => a.costPerWin - b.costPerWin);
  const frontier = [];
  for (const entry of byCost) {
    const best = frontier.at(-1)?.score.successRate ?? -1;
    if (entry.score.successRate > best) {
      frontier.push(entry);
    }
  }
  return frontier;
}

/** The chart as an SVG element `width` pixels wide. */
function chartOf(entries, width) {
  const frontier = frontierOf(entries);
  const costs = entries.map((entry) => entry.costPerWin);
  // Room on the left and right for the outermost names.
  const domain = [Math.min(...costs) * 0.6, Math.max(...costs) * 1.6];
  const ticks = (width < 520 ? NARROW_TICKS : COST_TICKS).filter((tick) => tick >= domain[0] && tick <= domain[1]);
  // The priciest model is named on its left, so its name stays on the chart.
  const priciest = entries.find((entry) => entry.costPerWin === Math.max(...costs));
  // Names aren't kept apart, and on a phone the middle cluster's would pile up:
  // there, only the frontier is named, and the tip and table carry the rest.
  const named = width < 520 ? frontier : entries;
  const cost = (entry) => entry.costPerWin;
  const rate = (entry) => entry.score.successRate;

  return Plot.plot({
    width,
    height: width < 520 ? 340 : 440,
    marginTop: 24,
    marginBottom: 48,
    className: "cost-chart",
    style: { background: "none", color: "var(--ink-soft)", fontFamily: "var(--sans)", fontSize: "12px" },
    x: {
      type: "log",
      domain,
      ticks,
      tickFormat: (tick) => `$${tick}`,
      label: "Cost per win (log scale) →",
      labelOffset: 42,
      grid: true,
    },
    y: { domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], tickFormat: percent, label: "↑ Success rate", grid: true },
    marks: [
      // The 95% ranges, faint behind everything.
      Plot.ruleX(entries.filter((entry) => entry.interval), {
        x: cost,
        y1: (entry) => entry.interval.low,
        y2: (entry) => entry.interval.high,
        stroke: "var(--ink-soft)",
        strokeOpacity: 0.35,
        strokeWidth: 2,
      }),
      // A staircase: flat at each model's rate until the next model's cost. It
      // reads "the best rate money buys up to here".
      Plot.line(frontier, { x: cost, y: rate, curve: "step-after", stroke: "var(--accent)", strokeOpacity: 0.45, strokeWidth: 2 }),
      Plot.dot(entries, {
        x: cost,
        y: rate,
        r: 5,
        fill: (entry) => (frontier.includes(entry) ? "var(--accent)" : "var(--ink-soft)"),
        stroke: "var(--paper)",
        strokeWidth: 2,
      }),
      // Names beside their dots; frontier models in bold.
      names(named.filter((entry) => entry !== priciest && !frontier.includes(entry)), 400, "start"),
      names(frontier.filter((entry) => entry !== priciest), 600, "start"),
      names([priciest], frontier.includes(priciest) ? 600 : 400, "end"),
      Plot.tip(entries, Plot.pointer({ x: cost, y: rate, title: hoverText, fill: "var(--paper-raised)", stroke: "var(--rule)" })),
    ],
  });
}

/**
 * A text mark naming each model beside its dot, to the right ("start") or
 * left ("end"), on a halo in the paper colour that hides any line it crosses.
 */
function names(entries, fontWeight, textAnchor) {
  return Plot.text(entries, {
    x: (entry) => entry.costPerWin,
    y: (entry) => entry.score.successRate,
    text: (entry) => entry.model.name,
    textAnchor,
    dx: textAnchor === "start" ? 9 : -9,
    fontWeight,
    fill: "var(--ink)",
    stroke: "var(--paper)",
    strokeWidth: 4,
  });
}

/** What a model's tip says: every number its dot stands for. */
function hoverText(entry) {
  const { score, interval, costPerWin } = entry;
  const range = interval ? `95% range ${percent(interval.low)}–${percent(interval.high)}` : "no range";
  return `${entry.model.name}\n${percent(score.successRate)} won (${range})\n$${costPerWin.toFixed(4)} per win`;
}
