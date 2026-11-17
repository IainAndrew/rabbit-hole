# Code

- TypeScript, strict mode. Readable over clever: a stranger should follow it.
- Few dependencies. Add one only when it clearly earns its place, and say why.
- Braces on every `if`, `else`, `for` and `while`, with the body on its own lines. No
  one-line `if (x) return y;`. A long run of checks goes in its own named function.
- Small files and functions with plain names. No abstractions until a second use needs
  them.
- Type the edges: data coming from outside (APIs, files, model output) is checked
  before the rest of the code trusts it.
- Handle errors on purpose. Don't swallow them; fail loudly or handle them with a
  reason.
- No dead code, commented-out code or unused options.
- Comments explain why, not what. Keep them short.
