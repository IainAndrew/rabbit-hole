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

## Status

Workspace setup. No code yet. Next: step 0 (the bare toolchain), then propose the steps
for phase 1.

Update this section at the end of each step: the current phase, the last step done, and
what's next.

## Working rules

The rules live in `.claude/rules/`, one topic per file. Each one below says when to read
it. When that moment comes, read the file first, even if you think you remember it.

### Git

For rules on git, see [.claude/rules/git.md](.claude/rules/git.md). Read it before
running any git command that changes the repo.

### Workflow

For how we work together, see [.claude/rules/workflow.md](.claude/rules/workflow.md).
Read it at the start of every session, and before proposing, starting or finishing a
step.

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

None yet. Add each command here when the step that introduces it lands (install,
typecheck, test, run a race, replay a trace, run evals, build the site).
