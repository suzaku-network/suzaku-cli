# Monitor-bot eval benchmarks

One row per valid model repetition, appended by `pnpm eval -- --tier 2 --benchmark …`.
Raw per-question reports live in `eval/results/` (gitignored, local only).
Suite = which questions ran (`fast` skips slow/event-scan questions) `@` grading version.
**`@v1` and `@v2` rows are legacy. `@v3` was pre-benchmark/exploratory:** scorer defects were
subsequently reproduced in punctuation handling, hedge governance, marker negation, and cross-epoch
boolean matching. **`@v4` is the first suite with the corrected semantics.** Historical rows are
preserved as recorded; do not compare exact PASS counts across grading versions.
Codex engine latencies include OpenClaw session bootstrap; cost `sub` = flat subscription (no per-call price).

**July 2026 retirement note:** the custom Cursor/Composer NDJSON route was retired after `1c886cd`.
It added a fragile separate agent integration without producing enough comparable evidence. The
exploratory runs do not establish that Claude or Codex conclusively outperformed Composer.

| date (UTC) | engine | model | suite | questions | PASS/PARTIAL/FAIL | facts | median wall | p95 wall | cost | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-09 | anthropic | claude-sonnet-4-6 | fast@v1 | 12 | 12/0/0 | 10/10 | 13.1s | 41.6s | $0.429 | rescored with fixed format checker |
| 2026-07-09 | codex | gpt-5.5-codex | fast@v1 | 12 | 12/0/0 | 10/10 | 59.6s | 100.6s | sub | |
| 2026-07-09 | anthropic | claude-sonnet-5 | fast@v1 | 12 | 12/0/0 | 10/10 | 13.6s | 46.9s | $0.611 | |
| 2026-07-09 | anthropic | claude-sonnet-4-6 | fast@v1 | 12 | 12/0/0 | 10/10 | 16.0s | 40.1s | $0.430 | |
| 2026-07-09 | anthropic | claude-haiku-4-5 | fast@v1 | 12 | 11/1/0 | 10/10 | 6.3s | 31.7s | $0.143 | |
| 2026-07-09 | codex | gpt-5.5-codex | full@v2 | 22 | 11/0/11 | 17/20 | 90.7s | 905.4s | sub | epoch 46 — DEGRADED RUN: 8/11 FAILs were infra (runaway jobs exhausted the container pid limit mid-run); genuine FAILs: set-amount-check-historical (fabricated count 2 vs true 3 from stale notes after its tools failed), min-uptime-history (job timeout), claimable (job errored; answer content was actually correct) |
| 2026-07-09 | anthropic | claude-sonnet-5 | fast@v2 | 19 | 17/0/2 | 17/17 | 16.1s | 114.0s | $1.107 | epoch 46 — first clean v2 run; genuine FAIL: identity-ambiguity (ran forbidden deployment-wide tool instead of asking); the slashing FAIL was a question bug (checksum-invalid address), fixed in-suite |
| 2026-07-15 | anthropic | claude-sonnet-5 | fast@v2 | 19 | 19/0/0 | 17/17 | 15.6s | 105.7s | $0.914 | epoch 48 — flawless. Raw run scored 18/0/1; the lone min-uptime-history FAIL was a scoring false-negative (correct "can't verify history" disclaimer, phrasing outside the marker list) fixed offline. Identity-fix (cfef81f) verified PASS. |
| 2026-07-15 | anthropic | claude-sonnet-4-6 | fast@v2 | 19 | 19/0/0 | 17/17 | 12.8s | 47.8s | $0.602 | epoch 48 — flawless; same min-uptime false-negative correction; ~2/3 the cost & faster than sonnet-5, no quality loss on this suite |
| 2026-07-15 | anthropic | claude-haiku-4-5 | fast@v2 | 19 | 15/2/2 | 16/17 | 8.2s | 128.9s | $0.201 | epoch 48 — min-uptime corrected; REAL fails: future-epoch (reversed time — called future epoch 50 "past/unfundable"), slashing (buried can't-verify disclaimer past the early-refusal window). 2 PARTIAL = markdown-bold (breaks Telegram rendering). Cheapest+fastest but genuinely weaker. |
