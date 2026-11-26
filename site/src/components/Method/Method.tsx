import type { ReactNode } from "react";
import { BASE } from "../../data.ts";
import type { Facts } from "../../facts.ts";
import styles from "./Method.module.scss";

/** How the evals were run, as short cards; the full method is a doc page. */
export function Method({ facts }: { facts: Facts }) {
  const cards: [string, ReactNode][] = [
    [
      "The game, with one twist",
      <>
        The Wikipedia game, played through tools. Unlike the human game, the agent can read any page's links for free;
        only moves count. That's on purpose: it tests knowing when to stop looking and act, like an agent deciding when
        it has read enough files. It's also why models here rarely go round in circles.
      </>,
    ],
    [
      "The races",
      <>
        {facts.races} hand-picked races, measured rather than guessed. Each race's shortest route is found by searching
        from both ends, and its target's findability is how many articles link to it. Easy: 2 hops. Medium: 3 hops to a
        well-linked target. Hard: 4 hops, or 3 to a target fewer than 100 articles link to.
      </>,
    ],
    [
      "A frozen Wikipedia",
      <>
        Every page an agent reads is saved the first time it's fetched, and every later run reads the saved copy. A page
        edited mid-sweep can't change the task, and any run can be repeated exactly.
      </>,
    ],
    [
      "The same conditions for every model",
      <>
        Same races, prompt, tools and limits: {facts.maxTurns} turns, a context of {facts.maxContextChars} characters,
        and {facts.maxOutputTokens} output tokens per reply, reasoning included. The context limit is in characters
        because tokenizers differ: a token limit would give some models less room for the same text.
      </>,
    ],
    [
      "Scoring",
      <>
        Success rate decides; fewer hops on wins break ties. Cost, tokens and time are shown, never ranked on. A crash
        (an API error, a provider outage) says nothing about the agent, so it's left out of the score, shown apart, and
        the run is tried again.
      </>,
    ],
    [
      "Three runs of everything",
      <>
        Each model plays each race {facts.repeats} times. Ranges come from a bootstrap that resamples races and then
        runs, because repeats of one race tend to go the same way. p-values come from shuffling each race's runs between
        two setups. At this size, a gap needs to be about 15 points to tell from chance.
      </>,
    ],
    [
      "What we can't control",
      <>
        Models are served by third-party providers; each is pinned to one, but a provider can change what it serves.
        Some prices vary by time of day. Each model counts tokens its own way, so token counts aren't comparable across
        models. And runs vary: the same DeepSeek setup
        scored 75%, 77% and 87% on three days.
      </>,
    ],
    [
      "Traces",
      <>
        Every run writes a trace: each model call with its reasoning, tokens and cost, and each tool call with its
        result. Every trace records the model, provider, prompt, context strategy, limits and code commit, and results
        from different setups are never mixed.
      </>,
    ],
  ];
  return (
    <section id="method" aria-labelledby="method-title">
      <h2 id="method-title">Method</h2>
      <p className="lede">
        What was run, how it's scored, and what we can't control. Every number on this page is computed from the
        committed trace of a real run; nothing is typed in by hand.
      </p>
      <div className={styles.grid}>
        {cards.map(([title, body]) => (
          <article key={title} className={styles.card}>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <p>
        <a href={`${BASE}docs/method/`}>Read the full method, with sources and related work →</a>
      </p>
    </section>
  );
}
