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

- `npm install`: install dev dependencies (TypeScript and Node types only)
- `npm run typecheck`: type-check everything in `src/`
- `npm test`: run tests with Node's built-in runner (`*.test.ts` files)
- `npm run wiki-links -- "Page title"`: print the links on one Wikipedia page (free)
- `npm run race-by-hand -- "Start" "Target"`: play a race yourself by typing tool calls
  (free)
- `npm run list-models`: list OpenRouter's tool-capable models by price and check the
  registry (free)
- `npm run model-endpoints -- <model id>`: list every provider endpoint for one model:
  tier, precision, prices (and when they vary), uptime, caching, tools; marks the
  registry's pin (free)
- `npm run race-agent -- "Start" "Target" [--model <id>] [--max-cost <dollars>]`: a
  model (the build model by default) plays one race, printed turn by turn, and writes a
  trace to `runs/` (billed, stops at 30 turns or the cap, $0.05 by default)
- `npm run eval-model -- --model <id> --max-cost <dollars> [--repeats 3]`: run every race
  in `races.json` against one model, writing traces and `eval.json` to `results/<eval>/`.
  Refuses uncommitted code; stops starting runs at the cap (billed). With
  `--resume results/<eval> --max-cost <dollars>`, re-runs crashed runs and starts unstarted
  ones, at the same commit (billed)
- `npm run eval-report -- results/<eval>`: score one eval from its `eval.json` and traces
  (success rate with its 95% interval, then hops on wins), by tier, repeat and race; refuses runs from another
  model, prompt or commit (free)
- `npm run compare-evals -- results/<eval> results/<eval> ...`: rank evals of different
  models by success rate, then hops on wins, with a 95% interval on each success rate and
  on each gap to the next model ("noise" if it could be chance), and cost per run and per
  win, tokens, turns, time and end reasons beside it; refuses evals with a different
  prompt, race set, repeats, limits or commit (free)
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
