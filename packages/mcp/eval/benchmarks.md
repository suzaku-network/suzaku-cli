# Monitor-bot eval benchmarks

One row per model per run, appended by `pnpm eval -- --tier 2 --benchmark …`.
Raw per-question reports live in `eval/results/` (gitignored, local only).
Suite = which questions ran (`fast` skips slow/event-scan questions) `@` grading version.
**`@v1` rows used lax grading** (content facts unchecked, errored tool calls counted, whole-answer
number matching — see `docs/eval-plan.md` § Adversarial review) — do not compare them with `@v2`+ rows.
Codex engine latencies include OpenClaw session bootstrap; cost `sub` = flat subscription (no per-call price).

| date (UTC) | engine | model | suite | questions | PASS/PARTIAL/FAIL | facts | median wall | p95 wall | cost | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-09 | anthropic | claude-sonnet-4-6 | fast@v1 | 12 | 12/0/0 | 10/10 | 13.1s | 41.6s | $0.429 | rescored with fixed format checker |
| 2026-07-09 | codex | gpt-5.5-codex | fast@v1 | 12 | 12/0/0 | 10/10 | 59.6s | 100.6s | sub | |
| 2026-07-09 | anthropic | claude-sonnet-5 | fast@v1 | 12 | 12/0/0 | 10/10 | 13.6s | 46.9s | $0.611 | |
| 2026-07-09 | anthropic | claude-sonnet-4-6 | fast@v1 | 12 | 12/0/0 | 10/10 | 16.0s | 40.1s | $0.430 | |
| 2026-07-09 | anthropic | claude-haiku-4-5 | fast@v1 | 12 | 11/1/0 | 10/10 | 6.3s | 31.7s | $0.143 | |
| 2026-07-09 | codex | gpt-5.5-codex | full@v2 | 22 | 11/0/11 | 17/20 | 90.7s | 905.4s | sub | epoch 46 — DEGRADED RUN: 8/11 FAILs were infra (runaway jobs exhausted the container pid limit mid-run); genuine FAILs: set-amount-check-historical (fabricated count 2 vs true 3 from stale notes after its tools failed), min-uptime-history (job timeout), claimable (job errored; answer content was actually correct) |
