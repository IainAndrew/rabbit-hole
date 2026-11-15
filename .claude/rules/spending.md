# Spending

- **Never start a billed run without a cost estimate the user has agreed to in this
  conversation.** That includes a single smoke-test race. State the models, number of
  runs, estimated tokens and estimated dollars, and how the estimate was made.
- Every eval command that calls a model takes a `--max-cost` cap. Don't remove or raise
  it without asking.
- Wikipedia calls are free; model calls are not. Scripts that only touch Wikipedia or
  the snapshot can be run freely.
