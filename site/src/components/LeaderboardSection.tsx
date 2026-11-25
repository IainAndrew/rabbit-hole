import { lazy, Suspense } from "react";
import type { Board } from "@harness/site-data/leaderboards.ts";
import type { Facts } from "../facts.ts";
import { BestBuys } from "./BestBuys/BestBuys.tsx";
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
        Cost per win is everything a model spent, losses included, divided by its wins, so a model that loses a lot pays
        for it here. These models are each the best buy at their price: no other model wins more often for the same
        money or less. Each step up wins more and costs more per win, and the step says by how much.
      </p>
      <BestBuys board={board} />
      <p>
        The chart puts every model on those two counts. The line joins the models above; any dot under it is beaten by a
        model on the line. The ranges overlap a lot, so a step of a few points may not hold on new races.
      </p>
      <Suspense fallback={<p className="hint">Loading the chart…</p>}>
        <CostChart board={board} />
      </Suspense>
    </section>
  );
}
