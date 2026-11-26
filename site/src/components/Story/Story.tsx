// "Down the rabbit hole": one real loss, the cause, the fix that looked
// obvious and wasn't, and the one that worked. The before-and-after figures
// come from the prompt board; the quotes are DeepSeek's own reasoning.

import type { ReactNode } from "react";
import { BASE } from "../../data.ts";
import type { Facts } from "../../facts.ts";
import styles from "./Story.module.scss";

// The runs the story links into the replays.
const PENGUIN_RUN = "2026-11-20-sweep-v2/2026-11-20T14-19-10.118Z_deepseek-deepseek-v4.1-flash-1017/penguin-bauhaus-r1";
const PROMPTS = "2026-11-22-prompts/2026-11-22T10-19-05.890Z_deepseek-deepseek-v4.1-flash-1017_full";
const HAIKU_BEFORE = `${PROMPTS}_fewest-hops/haiku-fermats-last-theorem-r2`;
const HAIKU_AFTER = `${PROMPTS}_scoring-rule/haiku-fermats-last-theorem-r2`;

export function Story({ facts }: { facts: Facts }) {
  const { fix } = facts;
  return (
    <section id="story" aria-labelledby="story-title">
      <h2 id="story-title">Down the rabbit hole</h2>
      <p className="lede">
        DeepSeek V4.1 Flash found a route to the target, said so, and then never moved. This is one real loss, how we
        found the cause, a fix we tried that didn't work, and the change to the prompt that did.
      </p>

      <Chapter number={1} title="The loss">
        <p>
          Penguin to Bauhaus: the shortest route is 3 hops, through Bird and Germany. DeepSeek looked up Penguin, then
          Bird, then Germany, its context growing each turn. On turn 4 it wrote:
        </p>
        <blockquote>“Germany directly links Bauhaus. So 3 hops. Need see if 2 possible.”</blockquote>
        <p>
          It had found the shortest route. Instead of moving, it went through Penguin's links one by one, asking of each
          whether it might lead to Bauhaus: “Puffin” no, “Auk” no, “Great auk” no. After 188 pages its reply hit the
          2,000-token output limit and was cut off. The run ended at 0 hops: a loss.
        </p>
        <p>
          <a className="run-link" href={`#run=${PENGUIN_RUN}`}>
            Replay this run →
          </a>
        </p>
      </Chapter>

      <Chapter number={2} title="Not a one-off">
        <p>
          DeepSeek lost 19 of its 75 runs on the model leaderboard. Reading every trace: 16 never made a move, 15 already
          had a complete route among the lists they'd fetched, and 14 ended at the output limit. It wins most races, but
          it loses a share of them the same way: it keeps searching for a shorter route until it hits a limit.
        </p>
      </Chapter>

      <Chapter number={3} title="The obvious suspect: context">
        <p>
          Every list it looks up stays in the conversation, and DeepSeek's reasoning grew with it. So we tested the
          standard fix, masking old link lists, on all 25 races. The prompts shrank and the context-limit losses
          disappeared, but the output-limit losses didn't: they kept happening in prompts a fraction of the size. So
          context size wasn't the cause (see <a href="#experiments">the experiments</a>).
        </p>
      </Chapter>

      <Chapter number={4} title="The real cause: two goals, no order">
        <p>The prompt named both goals of the game:</p>
        <blockquote>“You must reach the target page by following links, in as few hops as possible.”</blockquote>
        <p>
          Both count, but in order: a run that reaches the target beats one that doesn't, however many hops it takes, and
          hops only decide between runs that both get there. The prompt didn't say which comes first, and DeepSeek put
          hops first. With a 3-hop route in hand, it spent its whole reply trying to prove no 2-hop route existed, and the
          2,000-token limit cut the proof off.
        </p>
      </Chapter>

      <Chapter number={5} title="The fix">
        <p>We added the order, and wrote down what we expected it to change before running it once:</p>
        <blockquote>
          “Reaching the target is what counts: fewer hops only break ties between runs that reach it. Once you know a
          route, take it.”
        </blockquote>
        <dl className={styles.beforeAfter}>
          <Figure label="Won" before={fix.rateBefore} after={fix.rateAfter} />
          <Figure label="Output-limit losses" before={fix.outputBefore} after={fix.outputAfter} />
          <Figure label="Cost per win" before={fix.costBefore} after={fix.costAfter} />
        </dl>
        <p>
          On these 25 races the gain is clear: if the new prompt made no difference, a gap this large would turn up by
          chance with probability {fix.p}. On new races it's probably real, but 25 races can only place it between{" "}
          {fix.range} points. DeepSeek still looks ahead before
          moving; it just stops once it has a good enough route. Compare the same turn of Haiku to Fermat's Last Theorem{" "}
          <a className="run-link" href={`#run=${HAIKU_BEFORE}`}>
            before
          </a>{" "}
          and{" "}
          <a className="run-link" href={`#run=${HAIKU_AFTER}`}>
            after
          </a>
          .
        </p>
      </Chapter>

      <div className={`rule ${styles.lessons}`}>
        <strong>What we took from it</strong>
        <ol>
          <li>
            Read the traces before fixing anything. The score said DeepSeek was weaker; the traces said it found routes and
            didn't take them.
          </li>
          <li>
            The obvious fix can be the wrong one. Context growth was real and correlated with the failure, but shrinking it
            fixed a different failure.
          </li>
          <li>
            Say which goal comes first. Given two goals and no order, DeepSeek picked its own order, and it wasn't the one
            the races are scored by.
          </li>
        </ol>
      </div>
      <p>
        <a href={`${BASE}docs/down-the-rabbit-hole/`}>Read the full write-up, with every number →</a>
      </p>
    </section>
  );
}

function Chapter({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <article className={styles.chapter}>
      <h3>
        <span className={styles.number}>{number}</span> {title}
      </h3>
      {children}
    </article>
  );
}

function Figure({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {before} → <strong>{after}</strong>
      </dd>
    </div>
  );
}
