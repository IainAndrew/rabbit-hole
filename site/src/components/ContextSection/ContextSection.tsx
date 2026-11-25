import type { Board } from "@harness/site-data/leaderboards.ts";
import type { Facts } from "../../facts.ts";
import { strategyName } from "../../settings.ts";
import { ExperimentBoard } from "../ExperimentBoard/ExperimentBoard.tsx";
import { Source } from "../Source.tsx";
import { StrategyTable } from "../StrategyTable/StrategyTable.tsx";
import styles from "./ContextSection.module.scss";

/** The context strategies, each explained with its own table, then the prompt. */
export function ContextSection({ strategies, prompts, facts }: { strategies: Board; prompts: Board; facts: Facts }) {
  return (
    <section id="context" aria-labelledby="context-title">
      <h2 id="context-title">Changing what the model sees</h2>
      <p>
        A page can have over a thousand links, so the conversation grows fast. Two models that lost often, DeepSeek V4.1
        Flash and Mistral Small 4, ran the same races again with each change below. Every other setting stayed the same,
        so each gap is the effect of that one change.
      </p>

      <h3>Context strategies</h3>
      <p>
        A context strategy decides what the model is shown each turn. Its tools and rules stay the same, and the trace
        keeps the whole run either way; only the model's view changes. We tried two strategies against the usual one.
      </p>

      <div className={styles.strategy}>
        <h4>
          {strategyName("full")} <code>full</code> <span className={styles.usual}>usual</span>
        </h4>
        <p>
          Every turn, the model gets the whole conversation so far: the instructions, every tool call it made, every
          link list it fetched and everything it wrote. Nothing is lost, but nothing is let go either. One link list can
          run to tens of thousands of characters, and a run ends once the conversation passes {facts.maxContextChars}{" "}
          characters.
        </p>
        <p>
          It costs less than it sounds. The conversation only ever grows at the end, so the provider has seen most of
          each prompt before and serves it from its cache, at a fraction of the price.
        </p>
        <StrategyTable board={strategies} strategy="full" />
      </div>

      <div className={styles.strategy}>
        <h4>
          {strategyName("masked")} <code>masked</code>
        </h4>
        <p>
          Link lists older than the last 2 turns are cut down to their first line, which names the page and how many
          links it has, with a note to look the page up again if needed. Everything else stays: the model's reasoning and
          replies, its moves and any errors.
        </p>
        <p>
          The idea comes from coding agents (SWE-agent, and JetBrains' study "The Complexity Trap"), where old tool
          output fills most of the context and is rarely needed again. The price: the cut moves forward every turn, so
          the prompt changes near its start and the cache serves much less of it, and a model that needs an old list has to fetch
          it again.
        </p>
        <StrategyTable board={strategies} strategy="masked" />
      </div>

      <div className={styles.strategy}>
        <h4>
          {strategyName("state")} <code>state</code>
        </h4>
        <p>
          Each turn the conversation is set aside and the harness writes one fresh message from facts: what last
          turn's tool calls returned, the current page's links if the model has looked them up, one line for every move
          and lookup so far, and where things stand (the current page, the target, the path, and any moves already
          refused on this page). None of the model's own words carry over.
        </p>
        <p>
          The idea is to hand the model facts rather than its own story about them, so it can't talk itself into a
          mistake, and to keep the prompt small. The price: any link list older than the last turn is gone, so the model
          can't plan across pages it looked at earlier without fetching them again.
        </p>
        <StrategyTable board={strategies} strategy="state" />
      </div>
      <Source board={strategies} />

      <h3>The prompt</h3>
      <p>
        The instructions, rewritten to say which goal comes first: reaching the target, then fewer hops. Everything else
        in the prompt stayed the same.
      </p>
      <ExperimentBoard board={prompts} />
      <Source board={prompts} />

      <p className="rule">
        <strong>Reading the gaps.</strong> The range is where the gap could land on another set of races like these; if
        it includes 0, the change may do nothing. The p-value asks a narrower question: on these same races, how likely
        is a gap this big if the change did nothing? A small p with a range touching 0 means the change helped here, but
        25 races can't say it would elsewhere.
      </p>
    </section>
  );
}
