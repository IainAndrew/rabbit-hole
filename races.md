# How races.json was made

`races.json` is the fixed set of 21 races the evals run on. It was made on 16 November
2026, before any model ran on it, so no result could shape the choice of races.

Each race has two kinds of field:

- **Written by hand:** `id`, `start`, `target` and `knownPath`.
- **Written by `npm run measure-races`:** `measured` and `difficulty`. Never edit these
  by hand; run the command again.

## Steps

1. **Candidates (by hand).** About 30 start → target pairs, picked to cover food, sport,
   science, history and animals: common topics for easier races, obscure ones for hard. Pairs where the start links
   the target directly were dropped, as was one with no 3-hop path found, and a few
   that repeated a start page.
2. **Known paths (by hand).** Each race has a path known to win. For hard races they
   came from a throwaway search (not in the repo) that tried up to 40 of the start's
   links.
3. **Measurement (`measure-races`).** On live Wikipedia, the command counts each race's
   **2-hop routes**: pages a move from the start lands on that link to the target.
   Redirects are followed on both sides and red links are left out. Counting stops
   once there are 10 routes; the count is then marked incomplete.
4. **Tiers (`measure-races`).** Distance alone doesn't separate races: almost any two
   common topics are 2 hops apart. The number of 2-hop routes does:
   - **easy**: 10 or more routes
   - **medium**: 1 to 9 routes, counted in full
   - **hard**: no 2-hop route, proven by checking every page that links to the target

## Checks

`npm run check-races` checks every race against the committed snapshot, using the race's
own rules: both titles exist and are canonical, the start doesn't link the target, the
difficulty matches the measurement, and the known path wins in the hops its tier says.

## Are the known paths the shortest?

Yes, as of the measurement date. No start links its target, so every race takes at
least 2 hops: the 2-hop known paths of easy and medium races are shortest. Hard races
have no 2-hop route, so their 3-hop known paths are shortest too. Phase 7's
shortest-path baseline will compute this independently.

## Limits

- The candidates are a hand-picked sample, not a random one.
- Measurements are of live Wikipedia on the day they were made, not of the snapshot,
  which has no backlinks. The snapshot's pages were fetched the same day.
