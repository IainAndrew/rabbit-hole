import type { Board } from "@harness/site-data/leaderboards.ts";
import { ExperimentBoard } from "./ExperimentBoard/ExperimentBoard.tsx";
import { Source } from "./Source.tsx";

/** The context strategies and the prompt, each change against the same model's usual setup. */
export function ContextSection({ strategies, prompts }: { strategies: Board; prompts: Board }) {
  return (
    <section id="context" aria-labelledby="context-title">
      <h2 id="context-title">Changing what the model sees</h2>
      <p>
        A page can have over a thousand links, so the conversation grows fast. Two models that lost often, DeepSeek V4.1
        Flash and Mistral Small 4, ran the same races again with each change below. Every other setting stayed the same,
        so each gap is the effect of that one change.
      </p>

      <h3>Context strategies</h3>
      <p>What the model is shown each turn. Its tools and rules are the same either way; only its view changes.</p>
      <ExperimentBoard board={strategies} />
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
