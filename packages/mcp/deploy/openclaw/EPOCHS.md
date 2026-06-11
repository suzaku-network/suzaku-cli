# Epoch & Rewards Lifecycle — operator reference (Dexalot / suzaku-core)

This is the domain reference for answering operator questions. The people asking run the
validators and the weekly rewards workflow: they care about **what needs doing, by when,
and what is claimable** — not generic status. Always convert epochs to concrete UTC
times using the scheduling constants and epoch duration fetched live.

## The lifecycle of one epoch N (3.5-day epochs on Dexalot)

1. **Epoch N runs** (~3.5 days). Validators accrue uptime; stake snapshots are cached.
   The **stake-cache update window** for the running epoch must complete before it
   closes (`middleware_epoch_status` → `allClassesCached`, window close time).
2. **Epoch N ends.** Now its rewards workflow begins:
   a. **Uptime** — validator uptimes are reported, then operator uptime is computed
      (`uptime_report_validator` → `uptime_compute_operator_uptime`). Distribution
      cannot complete without it; rewards require the operator to meet the minimum
      uptime (`rewards_get_min_uptime`).
   b. **Set & fund** (`rewards set-amount`) — the settable window is
      `currentEpoch-2 ≤ N < currentEpoch` (only completed, recent epochs).
      **Tokens move at set time**: `setRewardsAmountForEpochs` pulls ALOT via
      `transferFrom` immediately — "funded" and "set" happen together
      (`rewards_get_epoch_status` → `funded`).
      ⚠️ **Amounts ACCUMULATE**: a second set-amount for the same epoch ADDS to the
      total (the epoch 35/36 incident — both show 2 set-amount txs). Always check
      `rewards_get_amount_set_events` / `rewards_epoch_diagnosis` before anyone sets.
      The **funding deadline** is `FUNDING_DEADLINE_OFFSET` epochs after N (currently
      4) — past it, the epoch can no longer be funded.
   c. **Distribute** (`rewards distribute`) — allowed from `DISTRIBUTION_EARLIEST_OFFSET`
      epochs after N (currently 2), once uptime is in. Runs in operator batches:
      `rewards_get_distribution_batch` → `lastProcessedOperator` / `isComplete`.
      A funded epoch sitting with `isComplete=false` is **work waiting to happen**.
   d. **Claim** — once `distributionComplete=true`, stakers/operators/curators claim
      (64-epoch batches; check progress via `rewards_get_last_claimed`).
   e. **Reclaim window** — undistributed remainders become admin-reclaimable after the
      claim grace period (`CLAIM_GRACE_PERIOD_EPOCHS`, currently 1); the boundary is
      approximately epoch start + (DISTRIBUTION_EARLIEST_OFFSET +
      CLAIM_GRACE_PERIOD_EPOCHS + 1) × epochDuration — mark it `~approximate`.

All three constants come back from one `rewards_get_epoch_status` call — never hardcode
them; fetch and compute.

## What operators actually ask, and how to answer

| Question | Tools | Lead the answer with |
|---|---|---|
| "State of the deployment?" | `deployment_heartbeat` (mode=digest) | **Actions needed + deadlines first**, then the epoch table, then infra status |
| "What do I need to do this week?" | `rewards_get_epoch_status` (range: currentEpoch-4 → current), `middleware_epoch_status` | Per epoch: needs uptime? needs set-amount (and the funding deadline UTC)? needs distribution? Then the stake-cache window |
| "Can I set rewards for epoch N?" | `rewards_epoch_diagnosis` for N | Settable-window check, **whether anything was already set (accumulation!)**, deadline UTC |
| "Why no rewards yet / when claimable?" | `rewards_get_epoch_status`, `rewards_get_distribution_batch` | Which lifecycle stage N is stuck at (unset / waiting uptime / distributing batch X / complete) and the earliest realistic claim time |
| "Did the set-amount go through?" | `rewards_get_amount_set_events` for N | Event count (>1 = accumulation alarm), tx hashes, totals |
| "Validator health?" | `middleware_get_validator_balances`, `middleware_uptime_report` | Lowest P-Chain balance + any validator below threshold; uptime gaps for the previous epoch |

## Tool cost — pick the cheap path

- **Event scans are the expensive tools** (`rewards_get_amount_set_events`, `rewards_get_events`,
  node logs): with the indexer key configured (this deployment) each takes a few seconds;
  without one it's a ~1-minute chunked log crawl. Either way use them ONLY for targeted
  forensics on specific epochs — never to assemble broad state — and keep the scan count
  minimal. If you expect the answer to take more than ~1 minute total, say so up front.
- **Broad state = ONE call**: `deployment_heartbeat` (mode=digest). Epoch ranges = ONE
  `rewards_get_epoch_status` with `toEpoch`. Never loop per-epoch single reads for data a
  composite returns, and never re-fetch constants (fees config, scheduling offsets) you
  already have in this conversation.

## Presentation rules

- **Telegram does not render markdown tables** — pipes show as literal text. Any tabular
  data goes in a pre-formatted monospace block (triple-backtick), like the heartbeat
  digest's `humanLines`. For broad state questions, prefer posting the digest's
  `humanLines` block verbatim with your actions-needed summary above it.

- **Actionables first**: anything with a deadline (stake cache close, funding deadline,
  distribution waiting on uptime) goes at the top with its UTC time and time-remaining.
- Epoch statuses in one compact table: epoch · set amount · #set-txs · funded ·
  distributed · status/next action.
- Flag `2+ set-amount txs` loudly every time — that is the accumulation incident.
- "claimable" means distribution is complete; say it explicitly per epoch.
- Use human units (ALOT, AVAX) and absolute UTC datetimes, never raw wei or bare
  epoch numbers without a date.
