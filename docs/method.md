# Method

How the evals were run, how they're scored, how sure the results are, and what isn't
controlled. Every number on the site is computed from the committed traces in
[`results/`](../results/) by the same code the command line uses; nothing is typed in by
hand.

## The game

A Wikipedia race: the agent starts on one page and must reach a target page by
following links. It has three tools:

| Tool | What it does |
|---|---|
| `get_links(page)` | Returns the article links on any page. Free: no hop. |
| `move_to(page)` | Follows a link from the current page. One hop. |
| `give_up(reason)` | Ends the run as a loss. |

The rules are enforced in code, not left to the model. A move to a page that isn't
linked from the current one is refused and costs nothing but the turn; so is a move to
a red link (a link whose article doesn't exist) or a call with bad arguments. A refused
move tells the model why and where it still is.

### One twist: free lookahead

In the human game you see only the page you're on. Here the agent can read any page's
links before it moves; only moves count as hops. This is deliberate. It's still a fair,
rules-enforced task that every model plays the same way, and it tests something agents
need in real work: knowing when they've looked enough and should act, much as a coding
agent decides when it has read enough files. It also changes the failures. Under human
rules, models mostly fail by going round in circles ([LLM-WikiRace](#related-work)).
Here they rarely do: DeepSeek V4.1 Flash moved back to a page it had already visited 0
times in 75 runs. They fail by looking too long, or by not looking at all.

### The goal, and the prompt

The aim is to reach the target in as few hops as possible. Both count, in order: a run
that reaches the target beats one that doesn't, however many hops it takes, and hops
only decide between runs that both get there. The original system prompt
(`fewest-hops`) states the goal without the order; a second variant (`scoring-rule`)
adds it. All model comparisons use the original, so every model saw the same prompt.
Why the second variant exists is the subject of
[Down the rabbit hole](down-the-rabbit-hole.md).

## Limits and how runs end

Every run has the same limits:

| Limit | Value | Why |
|---|---|---|
| Turns | 30 | A turn is one model call and the tool calls it makes. |
| Context | 330,000 characters | Counted by the harness on the text sent, about 100,000 tokens for most models. |
| Output | 2,000 tokens per reply | Reasoning included. |

The context limit is in characters, not tokens, because tokenizers differ: the same
link list is 4,327 tokens to Claude and 2,530 to 2,832 to most others. A token limit
would give some models less room for the same conversation.

A run ends in one of these ways:

- **won**: it reached the target.
- **gave up**: it called `give_up`.
- **turn limit**, **context limit**: it hit a limit above.
- **output limit**: a reply was cut off at 2,000 tokens.
- **refused**: a reply came back with no tool call. There's no second chance: a model
  that doesn't follow the protocol has failed the run.
- **crashed**: an API error, an outage, an exhausted retry. This says nothing about the
  agent, so a crash isn't a loss. Crashed runs are left out of the score, reported
  apart, and run again.

## The races

[`races.json`](../races.json) holds 25 races, hand-picked and then measured, not
guessed. Two measurements decide each race's tier:

- **Distance**: the fewest hops from start to target, found by searching from both ends
  at once, forward along links from the start and backward along backlinks from the
  target, up to 4 hops.
- **Findability**: how many articles link to the target. A target few pages link to is
  hard to steer toward even when it's close.

| Tier | Rule | Races |
|---|---|---|
| Easy | 2 hops | 6 |
| Medium | 3 hops, to a target 100 or more articles link to | 7 |
| Hard | 4 hops, or 3 hops to a target fewer than 100 articles link to | 12 |

Races at 4 hops are rare: of 30 hand-picked candidates, many chosen to be far apart, 4
came out at 4 hops, and all 4 had targets that 25 or fewer articles link to. The hardest in practice are two
of those: Jazz to Toynbee tiles and Cheese to Codex Seraphinianus.

This is the second race set. The first measured difficulty by counting 2-hop routes,
and it turned out too easy: five models won every run, so the top of the leaderboard
was ranked by hops alone. Its sweep is kept in [`results/`](../results/) but superseded.

### A frozen Wikipedia

Every page an agent reads is saved to [`snapshot/`](../snapshot/) the first time it's
fetched, and every later run reads the saved copy. A page edited in the middle of a
sweep can't change the task, and any run can be replayed against exactly the links it
saw. The snapshot dates from November 2026; results may differ on today's Wikipedia.

## The models

The field is one recent, cheap, tool-capable model from each of several labs, at
roughly the same price, so the comparison is about ability rather than budget. Beside
it are a floor, a tiny open model, to show how small an agent can go, and a ceiling, a
strong model, to show how far the field is from the best.

| Model | Lab | Role |
|---|---|---|
| Claude Haiku 5.5 | Anthropic | field |
| GPT-6 Luna | OpenAI | field |
| Gemini 3.1 Flash Lite | Google | field |
| DeepSeek V4.1 Flash | DeepSeek | field |
| Qwen3.8 Flash | Qwen | field |
| Mistral Small 4 | Mistral | field |
| GLM-5.3 Flash | Zhipu | field |
| MiniMax M3.1 Flash | MiniMax | field |
| LFM-3 1.7B | Liquid AI | floor |
| Claude Opus 5.5 | Anthropic | ceiling |

Every model runs the same number of times, the floor and ceiling included.

**Reasoning** is set to low wherever a model offers levels. Mistral Small offers only high
or none, so it runs with none, its default. Qwen3.8 Flash takes a token budget
instead of levels; at its default it spent its whole reply reasoning and never called a
tool, so it gets a 1,000-token budget. GLM, MiniMax, LFM and Opus always reason.

**Providers.** All models are called through OpenRouter, where one model can be served
by dozens of providers: one model here had 48, with input prices 30 times apart. Left to
route freely, calls moved between providers mid-run, which changed the price and threw
away the prompt cache. So each model is pinned to one exact provider endpoint, with no
fallback: the lab's own if the account's data policy allows it and its uptime is 99% or
more, otherwise the cheapest one at fp8 precision or better with 99% or more uptime. The price of a pin is that an outage
crashes the run instead of rerouting it; that happened once, and the affected eval was
run again.

**Caching.** Providers charge less for the part of a prompt they've seen before,
typically a tenth. Most cache automatically; the two Claude models need it switched on,
and are. Every cost on the site is what OpenRouter charged for each call, cache savings
included, not a list price.

## Runs and repeats

Every eval plays all 25 races 3 times: 75 runs. All evals in a comparison are run at the
same commit, with the same races, repeats and limits; the tools refuse to compare evals
that differ in any of these. Each comparison on the site is one sweep in
[`results/`](../results/):

| Sweep | What | Commit |
|---|---|---|
| `2026-11-20-sweep-v2` | 10 models | `f45aba7` |
| `2026-11-21-strategies` | DeepSeek and Mistral under three context strategies | `3e279f3` |
| `2026-11-22-prompts` | DeepSeek under two prompts | `d5a3ce7` |

## Scoring

Success rate decides the ranking. Between equal success rates, fewer hops on wins
decides. Cost, tokens and time are shown beside the ranking and never decide it.

**Cost per win** is everything a model spent, losses included, divided by its wins. It
answers "what does a win cost?", so a model that's cheap per run but loses most of its
races doesn't look cheap.

## How sure the results are

A success rate from 75 runs is an estimate, and runs aren't independent: repeats of one
race tend to go the same way. Three tools account for that.

- **Ranges.** Each success rate's 95% range comes from a two-stage bootstrap: resample
  the 25 races with replacement, then resample the runs within each, 10,000 times, and
  take the middle 95% of the rates. It answers: where could this rate land on another
  set of races like these?
- **Gaps.** A gap between two evals gets the same bootstrap, paired by race (each draw
  picks the same races for both sides), and a p-value from a paired permutation test:
  shuffle each race's runs between the two evals 20,000 times and count how often a gap
  this large appears. The test holds the races fixed, so it answers a narrower question,
  "on these races?". A gap can be clear by p and still have a range that touches 0;
  the site shows both.
- **Rank ranges.** Every pair of models is compared this way. A model's best possible
  rank is 1 plus the models clearly better than it; its worst is the count minus those
  clearly worse. Comparing every pair, not just neighbours, stops ties chaining.

Three cautions:

- At 25 races and 3 repeats, a gap needs to be about 15 points to tell reliably from
  chance. "No difference we could detect" means no effect larger than that, not no
  effect.
- With many comparisons on one board, a few will look clear by luck. The ranges and
  p-values aren't corrected for this.
- Runs of the same setup vary: DeepSeek with the original prompt and full history scored
  75%, 77% and 87% in three separate evals. Single evals mislead.

Both the bootstrap and the permutation test use fixed random seeds, so every report
gives the same numbers every time it's run.

## Context strategies

A context strategy decides what the model is shown each turn. Its tools and the rules
stay the same; only its view changes. The trace always keeps the full record, and each
turn's view can be rebuilt from it.

| Strategy | What the model sees |
|---|---|
| `full` | Everything: the whole conversation, every link list. The baseline. |
| `masked` | Link lists older than the last 2 turns cut to their first line, with a note that `get_links` will fetch them again. From SWE-agent's observation masking. |
| `state` | One fresh message each turn, written by the harness: the last turn's results, the current page's links, a one-line log of every past move and lookup, and the facts of the race. None of the model's own words. |

A strategy only reshapes what the run has already shown; it never adds information the
model didn't fetch. Masking has a hidden cost: a provider's cache reuses a prompt only
up to its first change, and a moving window changes the prompt every turn, so far less
of it is cached.

We deliberately didn't build summarization, where a model rewrites the history into a
summary. It needs extra model calls, published comparisons found it no better than
masking at about twice the cost, and it made runs longer
([The Complexity Trap](#related-work)).

## Receipts

Each run writes a trace, one line per event: the setup (model, provider, prompt and its
hash, context strategy, limits, code commit), every model call (tokens, cached tokens,
cost, duration, provider, reasoning text, tool calls) and every tool call (arguments,
result, page before and after), then how the run ended. Reports, the site's leaderboards
and its replays are all built from these files. An eval refuses to start with
uncommitted code, so every result names the exact code that produced it.

Replays on the site leave out one thing: the link lists themselves, cut to their first
line ("Links on Bird (1,375)") to keep each replay small. The full lists are in the
traces and the snapshot.

## Related work

- **LLM-WikiRace** ([arXiv 2602.16902](https://arxiv.org/abs/2602.16902)) runs the same
  task under human rules: the model sees only the current page's links. Its main
  failure is looping. A preprint.
- **SWE-agent** masks old tool outputs to keep context small
  ([history processors](https://swe-agent.com/latest/reference/history_processor_config/)),
  the idea behind `masked`. Its docs note that masking breaks prompt caching.
- **The Complexity Trap** (JetBrains, [arXiv 2508.21433](https://arxiv.org/abs/2508.21433))
  found observation masking matched LLM summarization for coding agents at about half
  the cost.
- **Anthropic**, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):
  compaction, tool-result clearing and structured notes.
- **Manus**, [Context engineering for AI agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus):
  cache hit rate as a key cost metric, and keeping context append-only.
- **Chroma**, [Context rot](https://www.trychroma.com/research/context-rot): reliability
  falls as input grows, even on simple tasks.
- **PokéBench** ([pokebench.tv](https://pokebench.tv)): the model for this site's
  static, trace-driven design and its replays.
