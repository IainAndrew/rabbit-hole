# Workflow

Work in small, reviewable steps. Every change is reviewed before the next one starts.

## The step loop

1. **Before each phase**, propose its steps as a numbered list, one line each saying
   what it adds. Wait for an OK on the list.
2. **One step is one idea.** A diff readable in about five minutes (roughly under 150
   lines). If it's bigger, split it.
3. **Check it yourself first.** Run the typecheck, the tests and the step's own command.
   Fix what fails, or report it if you can't.
4. **Then stop and summarise**:
   - what changed and why it's done this way
   - which files to read, in which order
   - the command to run and what to expect
   - what you ran to check it, and the result
   - any concept a reviewer needs to follow the change
5. **Wait.** Don't start the next step until the user says so.
6. **When the user is happy and asks**, commit the step (see `git.md`).

## Scope discipline

- No batching steps and no "while I'm here" changes. If you notice something worth
  doing, add it to a "Later" note in your summary instead of doing it.
- Every decision must serve the race, the evals or the site. If it doesn't, leave it
  out.
- Keep the project small. Prefer fewer files, fewer dependencies, less configuration.
- Ask when a choice is genuinely the user's (scope, cost, model field). Otherwise pick a
  sensible default and say what you picked.
- Update the Status section of CLAUDE.md at the end of each step.
