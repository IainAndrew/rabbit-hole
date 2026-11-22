# Down the rabbit hole

DeepSeek V4.1 Flash found a route to the target, said so, and then never moved. This is
how we found out why, the fix that looked obvious and wasn't, and the one sentence that
did fix it.

Everything below comes from the traces in [`results/`](../results/): every model call,
tool call and reasoning text a run produced. The quotes are DeepSeek's own reasoning.

## The loss

Penguin to Bauhaus is a medium race: the shortest route is 3 hops, Penguin > Bird >
Germany > Bauhaus. In [sweep v2](../results/2026-11-20-sweep-v2/), repeat 1, DeepSeek
played it like this:

| Turn | What it did | Prompt size |
|---|---|---|
| 1 | Looked up Penguin's links (494) | 190 chars |
| 2 | Looked up Bird's links (1,375) | 7.6k chars |
| 3 | "Bird links Germany directly! So path Penguin -> Bird -> Germany -> Bauhaus? Need check Germany links Bauhaus." Looked up Germany's links | 27k chars |
| 4 | "Germany directly links Bauhaus. So 3 hops. Need see if 2 possible." | 53k chars |

It had the shortest route in hand. Turn 4 should have been a move. Instead it went
through Penguin's links one by one, asking of each whether it might link to Bauhaus,
and answered itself: "Puffin" no. "Auk" no. "Great auk" no. It dismissed 188 pages this
way, working down a list of bird families ("Lark" no. "Pipit" no. "Wagtail" no.), until
its reply reached the 2,000-token output limit and was cut off mid-list. The run ended
there: 0 hops, a loss. It was looking for a 2-hop route that doesn't exist.

## Not a one-off

DeepSeek lost 19 of its 75 runs in sweep v2. Reading every one:

- 16 never made a single move.
- 15 had a complete route to the target among the link lists they had already fetched.
- 14 ended at the output limit, 12 of those with a route in hand.

The failure is intermittent. The same model won Penguin to Bauhaus in its other
repeats. What it does is lose a share of runs, across many races, the same way: it
finds a route and keeps searching for a shorter one until it runs out of room.

## The obvious suspect: context

Every get_links result stays in the conversation, so the prompt grows with each
lookup, and DeepSeek's reasoning grew with it: 136 tokens a turn on average with under
25k characters of context, 497 with over 150k. Over 150k, 8.5% of its replies were cut
off; under 25k, none were. A model reasoning through more lists than it can finish looks
like a context problem.

So we tested it. Observation masking, a standard technique used by agents such as
SWE-agent, cuts every link list older than the last 2 turns down to one line. We ran DeepSeek on all 25 races
three times with full history and three times with masking
([strategies sweep](../results/2026-11-21-strategies/)):

| DeepSeek | Won | Output-limit losses | Context-limit losses | Prompt when cut off |
|---|---|---|---|---|
| Full history | 58/75 (77%) | 11 | 6 | 75k to 274k chars |
| Masked | 61/75 (81%) | 13 | 0 | 3k to 104k, median 33k |

Masking did what it promises: prompts shrank and the context-limit losses disappeared.
The output-limit losses didn't. They kept happening, now in prompts a fraction of the
size. Context size wasn't the cause. (The success gap, +4 points, is within noise: p =
0.62.) Rebuilding the prompt from facts each turn did worse, 68%, and broke the other
model we tried it on.

## The real cause

The system prompt said:

> You must reach the target page by following links, in as few hops as possible.

But that isn't how the race is scored. Success decides; fewer hops only break ties
between runs that both reach the target. The prompt told DeepSeek that hops mattered
more than they do, and it took the instruction seriously: rather than take a 3-hop route,
it spent its whole reply trying to prove no 2-hop route existed. With a 2,000-token
limit on each reply, that proof never finished.

## The fix

One sentence, stating the real scoring rule:

> Reaching the target is what counts: fewer hops only break ties between runs that
> reach it. Once you know a route, take it.

We wrote it, and a prediction for what it would change, before running it once. Then
DeepSeek played all 25 races three times under each prompt, at the same commit
([prompts sweep](../results/2026-11-22-prompts/)):

| DeepSeek, full history | Won | Output-limit losses | Never moved | Hops on wins | Cost per win |
|---|---|---|---|---|---|
| Original prompt | 65/75 (87%) | 6 | 8 | 3.2 | $0.0043 |
| Scoring-rule prompt | **72/75 (96%)** | **0** | 2 | 3.6 | **$0.0031** |

Its only losses under the new prompt were the three repeats of Jazz to Toynbee tiles,
the hardest race in the set.

The change shows in the reasoning. Haiku to Fermat's Last Theorem, repeat 2, turn 4,
under the original prompt, after three turns of lookups:

> "Jorge Luis Borges" is best. Maybe Haiku -> "Jorge Luis Borges" -> "Infinite monkey
> theorem" -> "Fermat's Last Theorem"? ... Let's check.

Cut off at 2,000 tokens; 0 hops. The same turn under the new prompt:

> Route Haiku -> Poetry -> Philosophy -> Mathematics -> Fermat's Last Theorem = 4 hops.
> Could we do 3? ... So 4 likely. Need execute moves.

164 reasoning tokens, then four moves and a win. It still asks whether a shorter route
exists. It just stops asking once it has a good enough answer.

## How sure we are

- **On these races, the gain is clear.** A permutation test that shuffles each race's
  runs between the two prompts finds a gap this large by chance 0.5% of the time (p =
  0.005).
- **On new races, it's probably real, but 25 races can't say firmly.** Our reports'
  bootstrap, which also resamples which races were run, puts the gain at somewhere
  between 0 and +21 points.
- **The cause is gone.** Across three evals with the original prompt, DeepSeek hit the
  output limit 31 times in 225 runs. With the new prompt: 0 in 75.
- **Single runs of an eval mislead.** The same setup, original prompt and full history,
  scored 75%, 77% and 87% on three different days.

What we predicted beforehand, against what happened:

| Prediction | Result |
|---|---|
| Output-limit losses fall to a few | 0 |
| Fewer runs that never move | 8 to 2 |
| The first move comes earlier | No: turn 4.5 to 4.6 |
| Success rises to about 90% | 96% |
| Hops on wins rise slightly, to about 3.4 | 3.6 |

The miss is telling. DeepSeek looks ahead just as long before moving as it did before.
What changed is that it no longer tries to prove its route is the shortest. It takes
slightly longer routes, 3.6 hops instead of 3.2, and that's the right trade under the
scoring rule. It's also cheaper: 28% less per win, because replies no longer burn 2,000
tokens on reasoning that gets cut off.

## What we took from it

1. **Read the traces before fixing anything.** The success rate said DeepSeek was
   weaker than its peers. The traces said it was finding routes and not taking them.
2. **The obvious fix can be the wrong one.** Context growth was real and correlated
   with the failure. Shrinking it fixed a different failure and left this one alone.
3. **Tell the model what you score.** The prompt asked for something slightly different
   from what the eval measured, and a capable model optimised for the prompt.
