import type { Facts } from "../../facts.ts";
import styles from "./HowItWorks.module.scss";

const TOOLS = [
  ["get_links(page)", "Read the links on any page. Free: as many as it likes, but every list fills its context."],
  ["move_to(page)", "Follow a link from the current page. One hop. Reaching the target wins."],
  ["give_up(reason)", "Stop. Counts as a loss."],
] as const;

/** The three tools, the scoring rule, and the limits every run has. */
export function HowItWorks({ facts }: { facts: Facts | null }) {
  return (
    <section id="how" aria-labelledby="how-title">
      <h2 id="how-title">How a race works</h2>
      <p>
        The agent is a model in a loop with three tools. The rules are checked in code, not left to the model: a move to
        a page that isn't linked from the current one is refused.
      </p>
      <div className={styles.tools}>
        {TOOLS.map(([signature, description]) => (
          <article key={signature} className={styles.tool}>
            <h3>
              <code>{signature}</code>
            </h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
      <p className="rule">
        <strong>Scoring.</strong> Success rate decides the ranking. Fewer hops break ties. Cost, tokens and time are
        shown beside it, not ranked on.
      </p>
      <p className={styles.limits}>
        A run also ends at {facts?.maxTurns ?? "–"} turns, a context of {facts?.maxContextChars ?? "–"} characters, or a
        reply of more than {facts?.maxOutputTokens ?? "–"} output tokens, reasoning included.
      </p>
    </section>
  );
}
