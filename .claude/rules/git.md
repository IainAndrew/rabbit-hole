# Git

- **Never commit or push unless the user asks in this conversation.** Finishing a step, a
  passing check or an earlier approval is not a request to commit. Ask, then wait.
- Never push, force-push, rewrite history, or change git config without being asked.
- One step, one commit. The history should read as the story of how the project was
  built.
- Commit messages say what the step does and why, in plain words. First line under
  about 70 characters, then a short body if the why isn't obvious.
- Never commit secrets: `.env`, API keys, or anything that looks like one.
- Traces and snapshots that are meant to be committed (eval results, the Wikipedia
  snapshot) are committed on purpose, not swept in by `git add -A`. Stage files by
  name.
