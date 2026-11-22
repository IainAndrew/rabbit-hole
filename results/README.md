# Results

Every eval that's kept lives here, one folder per sweep. A sweep is a set of evals run
at the same commit on the same races, so they can be compared. Inside a sweep, each
eval has its own folder: `eval.json` (what was run, and how it stopped) and one trace
per run. Nothing here is edited by hand; reports are derived from the traces.

| Sweep | What | Commit | Races | Status |
|---|---|---|---|---|
| [2026-11-22-prompts](2026-11-22-prompts/) | DeepSeek V4.1 Flash under prompt variants fewest-hops and scoring-rule, full history; 3 repeats | `d5a3ce7` | v2 | **Current** for prompt variants |
| [2026-11-21-strategies](2026-11-21-strategies/) | DeepSeek V4.1 Flash and Mistral Small 4, each with context strategies full, masked and state; 3 repeats | `3e279f3` | v2 | **Current** for context strategies |
| [2026-11-20-sweep-v2](2026-11-20-sweep-v2/) | 10 models, 3 repeats | `f45aba7` | v2: 25 races, tiers from distance and target backlinks | **Current** for models |
| [2026-11-19-sweep-v1](2026-11-19-sweep-v1/) | 10 models, 3 repeats | `965433c` | v1: 21 races, tiers from 2-hop routes | Superseded: too easy to separate the top models |
| [2026-11-17-first-eval](2026-11-17-first-eval/) | the build model, 3 repeats | `4ef3089` | v1 | Old trace format: read it at its commit |

To see a sweep's leaderboard:

```bash
npm run compare-evals -- results/2026-11-20-sweep-v2/*
```

To see one model's eval by tier and race:

```bash
npm run eval-report -- results/2026-11-20-sweep-v2/<eval>
```

New evals go into a sweep folder with `npm run eval-model -- --sweep <name> ...`. When a
sweep is kept, add a row above.
