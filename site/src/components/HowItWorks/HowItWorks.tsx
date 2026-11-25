import type { ReactNode } from "react";
import type { Facts } from "../../facts.ts";
import styles from "./HowItWorks.module.scss";

const TOOLS = [
  ["get_links(page)", "Read the links on any page. Free: as many as it likes, but every list fills its context."],
  ["move_to(page)", "Follow a link from the current page. One hop. Reaching the target wins."],
  ["give_up(reason)", "Stop. Counts as a loss."],
] as const;

/** The game in three parts: the rules, the tools the agent has, and how runs are scored. */
export function HowItWorks({ facts }: { facts: Facts | null }) {
  return (
    <section id="how" aria-labelledby="how-title">
      <h2 id="how-title">How a race works</h2>
      <p>
        The agent is a model in a loop. Each turn it sees the race so far and calls a tool; the harness runs the tool and
        hands back the result.
      </p>

      <Part title="The rules">
        <ul className={styles.rules}>
          <li>Start on the start page and reach the target by following links.</li>
          <li>
            A move has to follow a link on the current page. The harness checks it in code, and a move that doesn't is
            refused: the agent stays where it is.
          </li>
          <li>The agent can read any page's links, as often as it likes. Only moves count as hops.</li>
          <li>
            A run ends when the agent reaches the target, gives up, or hits a limit: {facts?.maxTurns ?? "–"} turns, a
            context of {facts?.maxContextChars ?? "–"} characters, or a reply of more than{" "}
            {facts?.maxOutputTokens ?? "–"} output tokens, reasoning included.
          </li>
        </ul>
      </Part>

      <Part title="The tools">
        <div className={styles.tools}>
          {TOOLS.map(([signature, description]) => (
            <article key={signature} className={styles.tool}>
              <h4>
                <code>{signature}</code>
              </h4>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </Part>

      <Part title="Scoring">
        <p className={styles.lead}>Success rate decides the ranking. Between equal success rates, fewer hops on wins decides.</p>
        <p>
          Cost, tokens and time are shown beside the ranking, never ranked on. A crash, such as an API error or a provider
          outage, says nothing about the agent, so it isn't counted either way.
        </p>
      </Part>
    </section>
  );
}

/** One part of the explanation: its label beside its content on a wide screen, above it on a phone. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.part}>
      <h3>{title}</h3>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
