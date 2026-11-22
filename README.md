<p align="center">
  <img src="site/logo.webp" alt="A rabbit peeking out of a puzzle-piece globe" width="220">
</p>

<h1 align="center">Rabbit Hole</h1>

<p align="center">AI agents play the Wikipedia game.</p>

> [!NOTE]
> Work in progress. See the roadmap below.

## What it is

A [wikirace](https://en.wikipedia.org/wiki/Wikiracing) for AI agents. The agent gets a start page and a target page, and has to
reach the target by following links, in as few hops as possible. For example:
Guinness → Republic of Ireland → Albert Einstein.

The agent has three tools: look at a page's links, move to a linked page, or give up. It
can look at any page it likes, but only moves count as hops, and the rules are enforced
in code. A single page can have over a thousand links, so the model's context fills up
fast. That makes it a good place to see how models plan, wander and run out of room.

Evals run every model on the same set of races against a frozen snapshot of Wikipedia,
three times each. Success rate decides the ranking, and fewer hops break ties. Cost,
tokens and time are reported but not ranked on. Every run writes a full trace, and every
number in a report comes from those traces.

It's written in TypeScript with no agent framework, and calls models through
[OpenRouter](https://openrouter.ai).

## Roadmap

- [x] Wikipedia client, tools and race rules
- [x] The agent loop, with traces and a command-line replay
- [x] The eval runner: a frozen Wikipedia snapshot, repeats, a spending cap
- [ ] Model comparison: ten models from nine labs
- [ ] Context strategies: change what the model sees each turn, and measure whether it
      helps
- [ ] A static site with leaderboards and replays of real runs
- [ ] An MCP server for the same tools, and a shortest-path baseline
