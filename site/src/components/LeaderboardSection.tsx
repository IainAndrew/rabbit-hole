import { lazy, Suspense } from "react";
import type { Board } from "@harness/site-data/leaderboards.ts";
import type { Facts } from "../facts.ts";
import { Leaderboard } from "./Leaderboard/Leaderboard.tsx";
import { Source } from "./Source.tsx";

// The chart brings Observable Plot, most of the site's code: load it on its own,
// so the rest of the page doesn't wait for it.
const CostChart = lazy(() => import("./CostChart/CostChart.tsx").then((module) => ({ default: module.CostChart })));

/** The model leaderboard, and success against cost per win. */
export function LeaderboardSection({ board, facts }: { board: Board; facts: Facts }) {
  return (
    <section id="leaderboard" aria-labelledby="leaderboard-title">
      <h2 id="leaderboard-title">Leaderboard</h2>
      <p>
        {facts.models} models from {facts.labs} labs, all on the same races with the same prompt, tools and limits.
        Most are cheap models, at roughly the same price. LFM-3 1.7B is the floor, a tiny open model, and Claude Opus
        5.5 the ceiling.
      </p>
      <p>
        A success rate from {facts.runsPerModel} runs is an estimate. The range beside it is where the rate could land
        on another set of races like these. Where two ranges overlap, the order between those models could be chance, so
        each rank also says which ranks the model could really hold.
      </p>
      <Leaderboard board={board} />
      <Source board={board} />

      <h3>Best for the money</h3>
      <p>
        Each dot is a model: how often it won against what a win cost it. Cost per win is everything the model spent,
        losses included, divided by its wins, so a model that loses a lot pays for it here. The line joins the models no
        other model beats on both counts, cheaper and at least as successful. The ranges overlap a lot, so read the line
        as a rough frontier, not a verdict.
      </p>
      <Suspense fallback={<p className="hint">Loading the chart…</p>}>
        <CostChart board={board} />
      </Suspense>
    </section>
  );
}
