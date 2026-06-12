# Epoch & Rewards Lifecycle — operator reference (Dexalot / suzaku-core)

This is the domain reference for answering operator questions. The people asking run the
validators and the rewards workflow: they care about **what needs doing, by when,
and what is claimable** — not generic status. Always convert epochs to concrete UTC
times using the scheduling constants and epoch duration fetched live.

**Cadence:** epochs are 3.5 days; the human workflow traditionally runs weekly, covering
the ~2 epochs completed since the last pass. Note the tension: the set-amount window is
`currentEpoch-2 ≤ N < currentEpoch`, so at weekly cadence the older of the two epochs is
at the edge of settability — a late pass means it can no longer be funded. Flag this
whenever an unset epoch is near the window edge.

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

## Uptime reporting

The most error-prone weekly step (lifecycle 2a). The full sequence:

1. Node IDs of the active set: `middleware_get_active_nodes`.
2. Dry-run first: `uptime_get_validation_uptime_message` (a read) validates the
   `l1RpcUrl`/`blockchainId` pair and shows the uptime a validator would report —
   always run it before anyone commits to the 5-minute write.
3. `uptime_report_validator` once per node (write, up to ~5 min each — warp signature
   collection), then `uptime_compute_operator_uptime` once per operator.

Inputs that trip people up:

- `l1RpcUrl` is the **Dexalot L1's own RPC**, NOT the C-Chain RPC.
- `blockchainId` is the L1's blockchain ID (CB58). No tool returns it — ask the
  operator once, then reuse it for the whole conversation.
- Signature aggregation uses the `SIG_AGG_URL` endpoint (defaults to Glacier). A
  warp-collection timeout means that endpoint is unreachable or validators are
  offline — report the raw error; never retry blindly.

**Bot profiles can only CHECK uptime** (the dry-run read + `middleware_uptime_report`);
the report/compute writes are not registered here — a human runs them via the CLI.
Skipping uptime has a hard consequence: distributing reverts with
`OperatorUptimeNotSet` — and through the Safe that is an ExecutionFailure that still
consumes the nonce.

## Stake cache

Per-epoch stake snapshots must be cached per collateral class while the epoch runs:
`middleware_epoch_status` → `allClassesCached` + the window close time.

- The cache update is a **write** (`middleware_init_stake_update`) and is not in the
  bot profiles — a human triggers it via the CLI.
- `allClassesCached=false` with the window close near is **urgent**: lead with the
  close time (UTC + time remaining) and say explicitly that a CLI action is needed.
- If the window closes without the cache complete, escalate to the team — the
  heartbeat fires a 🔴 `stake_cache` alert for this; do not improvise an impact
  assessment.

## What operators actually ask, and how to answer

| Question | Tools | Lead the answer with |
|---|---|---|
| "State of the deployment?" | `deployment_heartbeat` (mode=digest) | **Actions needed + deadlines first**, then the epoch table, then infra status |
| "What do I need to do this week?" | `rewards_get_epoch_status` (range: currentEpoch-4 → current), `middleware_epoch_status` | Per epoch: needs uptime? needs set-amount (and the funding deadline UTC)? needs distribution? Then the stake-cache window |
| "Can I set rewards for epoch N?" | `rewards_epoch_diagnosis` for N | Settable-window check, **whether anything was already set (accumulation!)**, deadline UTC |
| "Why no rewards yet / when claimable?" | `rewards_get_epoch_status`, `rewards_get_distribution_batch` | Which lifecycle stage N is stuck at (unset / waiting uptime / distributing batch X / complete) and the earliest realistic claim time |
| "Did the set-amount go through?" | `rewards_get_amount_set_events` for N | Event count (>1 = accumulation alarm), tx hashes, totals |
| "Validator health?" | `middleware_get_validator_balances`, `middleware_uptime_report` | Lowest P-Chain balance + any validator below threshold; uptime gaps for the previous epoch |
| "Uptime report failed / is uptime in?" | `uptime_get_validation_uptime_message` (dry-run), `middleware_uptime_report` | Whether the proof is fetchable (RPC/blockchainId valid) and which validators are missing reports — reporting itself is a CLI action |
| "Stake/weights look wrong" | `middleware_epoch_status`, `middleware_operator_dashboard` | `allClassesCached` + window close UTC; if false near close, escalate — the cache update is a CLI action |

## Urgent triage

For an alarmed or ambiguous "something is wrong" message:

1. **First call: `deployment_heartbeat` (mode=alerts)** — one call; empty `humanLines`
   means nothing is burning and you can say so.
2. 🔴 **validator P-Chain balance low** — the continuous fee drains it; at zero the
   validator deactivates. State the balance, tell the operator to top up via the CLI
   now. The bot cannot do this.
3. **Stuck two-phase operation** (`stuck_two_phase`) — completing validator lifecycle
   ops needs the CLI with a signing key; those tools are not in the bot profiles. Say
   "requires manual intervention" and name the operation.
4. **Accumulation detected** (2+ set-amount txs) — never attempt corrective writes and
   never re-propose; surface the totals + tx hashes, point at the reclaim flow
   (`rewards_claim_undistributed`, an admin CLI action after the grace period), and
   hand off to the team.
5. **A propose pre-check refused** — do not retry with altered parameters. Run
   `rewards_epoch_diagnosis`, share the findings, wait for a human decision.
6. Anything 🔴 that read tools cannot fix: say explicitly that it requires manual
   intervention and which action — do not look for workarounds.

## Tool economy — answer in the fewest round-trips

- **Every tool call costs a full model round-trip** on top of the tool's own runtime — 15
  sequential calls is a multi-minute answer even when each tool is fast. Pick the tool that
  answers in one or two calls.
- **Broad state = ONE call**: `deployment_heartbeat` (mode=digest) — not because scans are
  slow, but because it returns the whole picture with the claimability/deadline math already
  computed deterministically (do not recompute amounts/dates yourself from raw reads).
  Epoch ranges = ONE `rewards_get_epoch_status` with `toEpoch`. Never loop per-epoch single
  reads for data a composite returns, and never re-fetch constants (fees config, scheduling
  offsets) you already have in this conversation.
- **Event scans are fine for event questions** (`rewards_get_amount_set_events`,
  `rewards_get_events`, node logs — a few seconds each with the indexer key this deployment
  has; ~1 min each without one). Use them whenever the question is genuinely about events
  (who set what when, tx hashes, accumulation forensics) — just don't use a pile of them to
  reconstruct state a composite already summarizes. If you expect an answer to take over
  ~1 minute total, say so up front.

## Answering discipline

- **Provenance**: when you follow a procedure from this file (or a server runbook
  prompt), say which one, and list the steps with ✅ for completed and ❌ for steps you
  could not complete — naming the tool or error that blocked each ❌.
- **Partial data is not data**: if any tool call failed or timed out, say so and name
  the tool. Never present conclusions derived from incomplete reads as complete — and
  never lead with "Actions needed" computed from a partial picture without flagging it.
- **Repeated tool errors** → run `health_check` first (verifies CLI path, signer
  config, connectivity) before retrying anything else.
- **Network scope**: the pinned deployment addresses are mainnet-only. For any other
  network, require explicit contract addresses from the user — never reuse the pins.

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
