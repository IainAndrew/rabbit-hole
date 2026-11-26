<p align="center">
  <img src="site/public/logo.webp" alt="A rabbit peeking out of a puzzle-piece globe" width="220">
</p>

<h1 align="center">Rabbit Hole</h1>

<p align="center">AI agents play the Wikipedia game.</p>

<p align="center"><a href="https://iainandrew.com/rabbit-hole/">See the results and replays</a></p>

## What it is

A [wikirace](https://en.wikipedia.org/wiki/Wikiracing) for AI agents. The agent starts on
one Wikipedia page and has to reach another by following links, in as few hops as
possible. Penguin → Bird → Germany → Bauhaus is three hops.

The agent has three tools: look up a page's links, move to a link on the current page, or
give up. There's one twist on the human game: it can look up any page's links for free,
and only moves count. So it can plan ahead, and the hard part becomes knowing when to stop
looking and move. The rules are checked in code: a move to a page that isn't linked from
the current one is refused and doesn't count as a hop.

A page can have over a thousand links, so the conversation grows quickly. That makes it a
good place to measure how models plan, wander and run out of room.

## What I found

Ten models raced the same 25 races three times each.

- **Claude Opus 5.5 won all 75 runs, at $0.14 a win.** GLM-5.3 Flash won 95% of its runs
  at $0.006 a win, about 24 times cheaper. GPT-6 Luna had the cheapest wins
  ($0.003) but lost one race in five. LFM-3 1.7B, the tiny model at the bottom, won 12%.
- **Changing what the model sees each turn made no difference I could detect.** Hiding
  old link lists moved DeepSeek and Mistral by +4 and +3 points, well within noise.
  Rebuilding the prompt from bare facts each turn broke Mistral: 61% down to 7%. It only
  ever saw the latest link lists, so it kept looking up the same pages again.
- **What helped DeepSeek was the prompt.** The original asked it to reach the target in
  as few hops as possible, two goals with no order between them. DeepSeek put hops first:
  it often already had a route and spent its whole reply proving no shorter one existed,
  until it hit the output limit. Saying that reaching the target comes first took it from
  87% to 96%, and its losses to the output limit from 6 to 0. The full story is in
  [Down the rabbit hole](docs/down-the-rabbit-hole.md).

## How it's measured

- **Races.** 25 pairs picked by hand and measured on live Wikipedia: the shortest route
  between them, and how many pages link to the target. Easy races are 2 hops (6 races),
  medium are 3 hops to a well-linked target (7), hard are 4 hops or 3 hops to a target
  that few pages link to (12).
- **A frozen Wikipedia.** Races run against a committed snapshot of the pages, so an edit
  to Wikipedia mid-sweep can't change the task, and a second run is offline and identical.
- **Limits.** 30 turns, a conversation of at most 330,000 characters, and 2,000 output
  tokens per reply, reasoning included.
- **Scoring.** Success rate decides the rank, and fewer hops break ties. Cost, tokens and
  time are reported but not ranked on. A crash (an API error, say) isn't a loss: it's
  counted apart, and crashed runs were run again.
- **Uncertainty.** Each success rate comes with a 95% range from a bootstrap over races
  and runs. Gaps between setups get a range and a p-value from a paired permutation test.
  At this size, a gap needs to be about 15 points to tell from chance.
- **Same conditions.** Every model is pinned to one provider, and every run records the
  model, provider, prompt, context strategy, limits and code commit. Results from
  different setups are never mixed.

The [method](docs/method.md) has the details, the sources and related work.

## How it's built

TypeScript, with no agent framework. Models are called through
[OpenRouter](https://openrouter.ai)'s chat API with tool calling, and Wikipedia through
its Action API.

The agent loop sends the conversation, runs whatever tools the model calls, appends the
results and goes again, until the model wins, gives up or hits a limit. Every run writes
a trace: each model call with its reasoning, tokens and cost, and each tool call with its
result. Reports, rankings and the site are all built from traces, and nothing in the
results is edited by hand.

| Folder | What's in it |
|---|---|
| `src/race` | The game: race state, the three tools and their rules |
| `src/agent` | The agent loop, context strategies, prompts and traces |
| `src/models` | The model registry and the OpenRouter client |
| `src/wikipedia` | The Wikipedia client and the snapshot |
| `src/evals` | Running evals, scoring, intervals, comparisons, race measurement |
| `src/site-data` | Turning traces into the site's data |
| `src/commands` | The command-line scripts below |
| `site` | The site: React, built to static files |
| `results` | Every kept eval, with its traces ([index](results/README.md)) |
| `snapshot` | The frozen Wikipedia pages |

## Running it

Needs Node 24 or later.

```bash
npm install
```

These are free: they only touch the snapshot, Wikipedia or committed results.

```bash
npm run race-by-hand -- "Penguin" "Bauhaus"
```

```bash
npm run compare-evals -- results/2026-11-20-sweep-v2/*
```

```bash
npm run replay-trace -- results/2026-11-20-sweep-v2/<eval>/<trace>.jsonl
```

```bash
npm run build-site && npm run serve-site
```

Anything that calls a model is billed. Copy `.env.example` to `.env` and add an
OpenRouter key. Every billed command takes a `--max-cost` cap in dollars and stops
starting runs once it's reached.

```bash
npm run race-agent -- "Penguin" "Bauhaus" --max-cost 0.05
```

[CLAUDE.md](CLAUDE.md) lists every command and its options.

## Roadmap

- [x] Wikipedia client, tools and race rules
- [x] The agent loop, with traces and a command-line replay
- [x] The eval runner: a frozen Wikipedia snapshot, repeats, a spending cap
- [x] Model comparison: ten models from nine labs
- [x] Context strategies, and the prompt fix
- [x] The site, with leaderboards and replays of every run
- [ ] An MCP server for the same tools
