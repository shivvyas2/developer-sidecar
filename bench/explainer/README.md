# Explainer token bench

Measures how many tokens the explainer spends on three sample Claude Code sessions, so a change to
what gets explained, or how, can be compared with the numbers in `baseline.json`.

The sessions in `sessions.ts` are raw hook payloads, shaped like what Claude Code really sends. They
play through the real pipeline and explainer with a fake clock, so batching matches a live server.

| session | what it covers |
|---|---|
| `build-stripe-app` | a feature from scratch: reads, installs, new files, repeated edits to one file, a failing then passing test, a commit, a second request |
| `fix-failing-test` | a repair loop: the same two files edited again and again, a failed Edit, long failing test output twice |
| `explore-codebase` | mostly reading and searching, then one small change |

## Run it

```sh
pnpm bench:tokens                    # offline and free: estimates at ~4 characters per token
BENCH_COUNT=1 pnpm bench:tokens      # exact input tokens from the count_tokens endpoint; generates nothing
BENCH_LIVE=1 pnpm bench:tokens       # real Claude Haiku calls: real input and output usage, plus every explanation
BENCH_UPDATE=1 pnpm bench:tokens     # also rewrite baseline.json with this run's numbers
```

`BENCH_COUNT` and `BENCH_LIVE` need `ANTHROPIC_API_KEY`. A live run sends about a dozen small
requests to Haiku and costs a few cents.

Each run writes to `out/` (ignored by git):

- `report.md`: the table, with percentages against `baseline.json`, and in live mode every explanation, for reading by eye
- `<session>.requests.txt`: the exact text sent to the model, request by request

`pnpm test` never runs the bench; it has its own `vitest.config.ts`.
