# Rabbit Hole

> Can a model get out of a Wikipedia rabbit hole faster than you?

An agent races from one Wikipedia page to another by following links, in as few hops as
possible. Evals compare how different models and context strategies do on a fixed set
of races, and a static site shows the results and replays of real runs.

## Phases

1. Wikipedia client, tools and race rules, with a script to try them without a model.
2. The agent loop with traces, and a command-line replay of a trace.
3. The eval runner: snapshot, repeats, cost cap, report with provenance.
4. Model comparison across a field of models.
5. Context strategies, and a failure story from a real trace.
6. The static site: leaderboards, replays, method. Then the README.
7. An MCP server for the same tools, and a shortest-path baseline.

## Working rules

The rules live in `.claude/rules/`, one topic per file. Each one below says when to read
it. When that moment comes, read the file first, even if you think you remember it.

### Git

For rules on git, see [.claude/rules/git.md](.claude/rules/git.md). Read it before
running any git command that changes the repo.

### Workflow

For how we work together, see [.claude/rules/workflow.md](.claude/rules/workflow.md).

### Spending

For rules on money, see [.claude/rules/spending.md](.claude/rules/spending.md). Read it
before running anything that calls a model.

### Secrets

For rules on secrets, see [.claude/rules/secrets.md](.claude/rules/secrets.md). Read it
before touching API keys or `.env`.

### Code

For how the code is written, see [.claude/rules/code.md](.claude/rules/code.md). Read it
before writing or changing code.

## Commands

Needs Node 24 or later. Copy `.env.example` to `.env` before anything that calls a model.

- `npm install`: install dev dependencies: TypeScript and Node types for the harness;
  `marked` for the docs; React, Vite, Sass and Observable Plot for the site
- `npm run typecheck`: type-check the harness in `src/` and the site in `site/`
- `npm test`: run tests with Node's built-in runner (`*.test.ts` files)
- `npm run race-by-hand -- "Start" "Target"`: play a race yourself by typing tool calls
  (free)
- `npm run list-models`: list OpenRouter's tool-capable models by price and check the
  registry (free)
- `npm run model-endpoints -- <model id>`: list every provider endpoint for one model:
  tier, precision, prices (and when they vary), uptime, caching, tools; marks the
  registry's pin (free)
- `npm run race-agent -- "Start" "Target" [--model <id>] [--max-cost <dollars>] [--context full] [--prompt fewest-hops]`:
  a model (the build model by default) plays one race, printed turn by turn, and writes a
  trace to `runs/` (billed, stops at 30 turns or the cap, $0.05 by default). `--context`
  picks what the model is shown each turn: `full` (everything), `masked` (link lists
  older than the last 2 turns cut to their header) or `state` (one fresh message of
  facts each turn, none of the model's own words). `--prompt` picks the system prompt:
  `fewest-hops` (the original) or `scoring-rule` (reaching the target counts, hops only
  break ties, take a route once you know one)
- `npm run eval-model -- --model <id> --sweep <name> --max-cost <dollars> [--repeats 3] [--context full] [--prompt fewest-hops]`:
  run every race in `races.json` against one model, context strategy and prompt, writing traces and `eval.json` to
  `results/<sweep>/<eval>/`. Refuses uncommitted code; stops starting runs at the cap
  (billed). With `--resume results/<sweep>/<eval> --max-cost <dollars>`, re-runs crashed
  runs and starts unstarted ones, at the same commit (billed). `results/README.md` lists
  the sweeps
- `npm run eval-report -- results/<sweep>/<eval>`: score one eval from its `eval.json` and traces
  (success rate with its 95% interval, then hops on wins), how runs moved (refused moves,
  turn of the first move) and the cache's share, by tier, repeat and race; refuses runs
  from another model, context strategy, prompt or commit (free)
- `npm run compare-evals -- results/<sweep>/*`: rank evals of different
  models or context strategies by success rate, then hops on wins, with a 95% interval on
  each success rate and on each gap to the next ("noise" if it could be chance), and cost
  per run and per win, tokens, turns, time, end reasons and how runs played beside it;
  refuses evals with a different prompt, race set, repeats, limits or commit (free)
- `npm run build-site`: write the site's data into `site/public/` (leaderboards ranked by
  the same code as `compare-evals`, a replay of every run, and each `docs/*.md` rendered),
  then build the React site into `site/dist/rabbit-hole/`; all gitignored (free)
- `npm run serve-site`: run the site with Vite's dev server at
  http://localhost:8765/rabbit-hole/, reloading on save (run `build-site` once first for
  the data; free)
- `npm run replay-trace -- <trace>.jsonl`: replay a run from its trace, turn by turn
  (free)
- `npm run measure-races`: measure each race's distance and its target's backlinks on
  live Wikipedia and write them and the difficulty into `races.json` (free, about 30
  minutes)
- `npm run race-distance -- "Start" "Target"`: the fewest hops between two pages (up to
  4) and one path that takes them, by searching live Wikipedia from both ends (free,
  seconds to a few minutes)
- `npm run check-races`: check every race in `races.json` against the snapshot, recording
  pages it doesn't have yet (free)

Add each new command here when the step that introduces it lands.
