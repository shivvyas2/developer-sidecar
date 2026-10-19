# Explainer token bench

Measures how many tokens the explainer spends on three sample Claude Code sessions. It makes one AI
recap per turn, when Claude's turn ends. Users pay for every call, through their Claude subscription
(the `claude` command) or an API key, so any change to what is sent, or how often, should be measured
here. `baseline.json` keeps the per-step explainer's numbers from just before recaps replaced it
(`perStep`), and the report compares with those. The CI guard in
`packages/server/test/token-budget.test.ts` runs the same sessions with fixed ceilings.

The sessions in `sessions.ts` are raw hook payloads, shaped like what Claude Code really sends. They
play through the real pipeline and recapper with a fake clock, so the calls match a live server.

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
BENCH_UPDATE=1 pnpm bench:tokens     # also record this run's numbers in baseline.json (perTurn)
```

`BENCH_COUNT` and `BENCH_LIVE` need `ANTHROPIC_API_KEY`. With both set, only the live run happens: it
reports exact input tokens itself. A live run sends five small requests to
Haiku and costs a cent or two.

Each run writes to `out/` (ignored by git):

- `report.md`: the table, with percentages against the per-step explainer, and in live mode every recap, for reading by eye
- `<session>.requests.txt`: the exact text sent to the model, request by request

`pnpm test` never runs the bench; it has its own `vitest.config.ts`.
