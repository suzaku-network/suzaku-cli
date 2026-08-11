# Epoch & Rewards Lifecycle — operator reference (Dexalot / suzaku-core)

This is the domain reference for answering operator questions. The people asking run the
validators and the rewards workflow: they care about **what needs doing, by when,
and what is claimable** — not generic status. Never convert raw Unix timestamps or
calculate relative time in the model. Quote the composite tool's server-calculated
`*Utc` and `timeRemaining` fields verbatim. If those fields are unavailable, omit the
conversion rather than estimating it.

**Cadence:** epochs are 3.5 days; the human workflow traditionally runs weekly, covering
the ~2 epochs completed since the last pass. Note the tension: the set-amount window is
`currentEpoch-2 ≤ N < currentEpoch`, so at weekly cadence the older of the two epochs is
at the edge of settability — a late pass means it can no longer be funded. Flag this
whenever an unset epoch is near the window edge.

## The lifecycle of one epoch N (3.5-day epochs on Dexalot)

1. **Epoch N runs** (~3.5 days). Validators accrue uptime. Per-class stake snapshots
   may be materialized permissionlessly or lazily by Rewards. `allClassesCached=false`
   is informational and has no deadline or required action. `UPDATE_WINDOW` is the
   offset when the final validator weight-update window opens; it is not a cache
   deadline (`middleware_epoch_status` returns its exact open and close times).
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
      total (the epoch 35/36 incident — epoch 35 has 3 set-amount txs, epoch 36 has 2;
      windowed scans have undercounted 35 before, so verify live, never from this file). Always check
      `rewards_epoch_diagnosis` / `rewards_get_events` (filter: RewardsAmountSet)
      before anyone sets.
      The **funding deadline** is `FUNDING_DEADLINE_OFFSET` epochs after N (currently
      4) — past it, the epoch can no longer be funded.
   c. **Distribute** (`rewards distribute`) — allowed from `DISTRIBUTION_EARLIEST_OFFSET`
      epochs after N (currently 2), once uptime is in. Runs in operator batches:
      `rewards_get_distribution_batch` → `lastProcessedOperator` / `isComplete`.
      A funded epoch sitting with `isComplete=false` is **work waiting to happen**.
      `waiting_distribution_window` means the time gate is still closed; report the
      returned opening epoch and UTC time, and do not claim uptime is missing.
      `distribution_window_open` means the time gate is open but does not prove
      uptime is present or absent; verify uptime before recommending distribution.
      For `deployment_heartbeat`, `uptime.status` is the only uptime conclusion:
      `complete` means no uptime action, `missing` means report/compute is needed,
      and `unknown`/`not_checked` means say it was not verified. Never infer missing
      uptime from an incomplete distribution or from the absence of an uptime alert.
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
- Signature aggregation uses the server-configured service (defaults to Glacier). A
  warp-collection timeout means that service is unreachable or validators are
  offline — report the raw error; never retry blindly.
- The `uptimeTrackerAddress` comes from the SOUL.md Known-deployment pin. It is NOT in
  `middleware_get_linked_addresses` — the on-chain source of truth is the Rewards
  contract's `uptimeTracker()` view (for a different deployment, read it there).

**Bot profiles can only CHECK uptime** (the dry-run read + `middleware_uptime_report`);
the report/compute writes are not registered here — a human runs them via the CLI.
Skipping uptime has a hard consequence: distributing reverts with
`OperatorUptimeNotSet` — and through the Safe that is an ExecutionFailure that still
consumes the nonce.

## Stake cache

`totalStakeCached(epoch, class)=false` means only that the optional on-chain stake
snapshot has not been materialized. `calcAndCacheStakes` is permissionless, accepts
current or past epochs, and Rewards calls it lazily when needed. Therefore:

- Never label an unmaterialized snapshot urgent, incomplete, or action-required.
- Never attach `UPDATE_WINDOW` to snapshot materialization. That constant controls
  when the final validator weight-update window opens.
- A human may deliberately materialize a snapshot for operational reasons, but the
  monitor must not recommend a transaction merely because the flag is false.

## What operators actually ask, and how to answer

| Question | Tools | Lead the answer with |
|---|---|---|
| "State of the deployment?" | `deployment_heartbeat` (mode=digest) | **Actions needed + deadlines first**, quoting `timing.*Utc`, `timing.*TimeRemaining`, and `uptime.status`; then the epoch table and infra status |
| "What do I need to do this week?" | `deployment_heartbeat` (mode=digest, windowEpochs=6) | Use its computed lifecycle, `uptime.status`, and timing fields; do not recompute relative time from epoch dates |
| "Can I set rewards for epoch N?" | `rewards_epoch_diagnosis` for N | Quote `setAmountReadiness`: contract evidence, the bot's operational window, existing funding, accumulation risk, and bot-policy deadline UTC. Do not call the policy window a contract restriction or recompute it |
| "Why no rewards yet / when claimable?" | `rewards_get_epoch_status`, `rewards_get_distribution_batch` | Which lifecycle stage N is stuck at (unset / waiting uptime / distributing batch X / complete) and the earliest realistic claim time |
| "Did the set-amount go through?" | `rewards_epoch_diagnosis` (or `rewards_get_events`, filter RewardsAmountSet) | The set-amount TX COUNT is the answer's first line. Include tx hashes/totals; >1 = accumulation alarm. If event reads failed and the count could not be verified, the first line must say "could not verify the set-amount count — treat as unconfirmed", never a plain "yes, it went through". |
| "How much protocol fee has been claimed / is claimable?" | `rewards_get_fees_config` | Lead with the exact current `protocolRewardsHuman` claimable balance. On the pinned Dexalot implementation, `claimProtocolFee` resets `protocolRewards` without emitting `ProtocolFeeClaimed`, so historical claimed total is not directly observable from the current read surface. Say unavailable—never zero or an estimate from the fee percentage/recent epochs. |
| "What is minimum uptime / has it changed?" | `rewards_get_min_uptime` | State the current value. If `historyAvailable=false`, say historical changes are unknown; do not invent event names, call the value typical, or suggest the getter proves history |
| "Validator health?" | `middleware_get_validator_balances`, `middleware_uptime_report` (needs the UptimeTracker address pinned in SOUL.md) | Lowest P-Chain balance; 🔴 only below 0.05 AVAX (the heartbeat default) — never invent another threshold; uptime gaps for the previous epoch |
| "Uptime report failed / is uptime in?" | `uptime_get_validation_uptime_message` (dry-run), `middleware_uptime_report` | Whether the proof is fetchable (RPC/blockchainId valid) and which validators are missing reports — reporting itself is a CLI action |
| "Stake/weights look wrong" | `middleware_epoch_status`, `middleware_operator_dashboard` | Distinguish `nodeStakeCache` lag and validator weight-update status from lazy `stakeSnapshot` materialization. A false snapshot flag alone requires no action. Quote returned UTC/relative strings verbatim; never derive them from raw timestamps. |

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
   never retry; surface the totals + tx hashes, point at the reclaim flow
   (`rewards_claim_undistributed`, an admin CLI action after the grace period), and
   hand off to the team.
5. Anything 🔴 that read tools cannot fix: say explicitly that it requires manual
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
- Epochs beyond the current one return all-zero rows — check the current epoch first and say 'not started' rather than 'nothing set'.
- **Event scans are fine for event questions** (`rewards_get_events`, node logs — a few seconds with a compatible configured explorer
  plan; RPC fallback may take minutes for long ranges). Use them whenever the question is genuinely about events
  (who set what when, tx hashes, accumulation forensics) — just don't use a pile of them to
  reconstruct state a composite already summarizes. If you expect an answer to take over
  ~1 minute total, say so up front.

## Answering discipline

- **Provenance**: when the user asks for a procedure or audit, name the runbook and
  mark completed/blocked steps. Do not narrate runbook mechanics in a normal factual answer.
- **Partial data is not data**: if any tool call failed or timed out, say so and name
  the tool. Never present conclusions derived from incomplete reads as complete — and
  never lead with "Actions needed" computed from a partial picture without flagging it.
- **Repeated tool errors** (two or more in one answer) → CALL `health_check` immediately
  and include its output in your reply — never merely recommend running it. If
  `health_check` itself fails, say so explicitly and stop retrying other tools.
- **Network scope**: the pinned deployment addresses are mainnet-only. For any other
  network, require explicit contract addresses from the user — never reuse the pins.

## Presentation rules

- **Formatting (Telegram)**
  - Use HTML formatting only: `<b>text</b>` for emphasis, `<code>value</code>` for
    inline values/addresses, and `<pre>block</pre>` for any tabular or aligned data.
  - NEVER use `**bold**`, `*italics*`, or markdown headers — they render as literal
    asterisks or break delivery entirely.
  - Keep every message under ~3800 characters (Telegram caps at 4096 — escaping
    overhead eats the rest).
  - When an answer must exceed that, split at a logical boundary (never mid-sentence
    or mid-block) and number the parts (1/2, 2/2).
  - Show counts and the flagged item for long lists (e.g. "10 validators, lowest
    balance NodeID-…"), never enumerate all entries inline.

- **Telegram does not render markdown tables** — pipes show as literal text. Any tabular
  data goes in a monospace block (`<pre>`, or the triple-backtick form the OpenClaw
  layer converts), like the heartbeat digest's `humanLines`. For broad state questions,
  prefer posting the digest's `humanLines` block verbatim with your actions-needed
  summary above it.

- **Actionables first for operational questions**: when the user asks what needs doing,
  anything with a real deadline goes at the top with its UTC time and tool-calculated
  time-remaining. A narrow factual lookup should not acquire unrelated action items.
- For epoch-range status questions, use one compact table: epoch · set amount · #set-txs
  when requested/available · funded · distributed · status/next action when relevant.
- Whenever set-amount history is part of the question or answer, flag `2+ set-amount
  txs` loudly — that is the accumulation incident. When the count could not be
  determined, say so in the first line; an unverified set-amount answer is never a clean yes.
- For epoch-status questions, "claimable" means distribution is complete; say it
  explicitly for the epochs being discussed.
- Use human units (ALOT, AVAX). Include absolute UTC datetimes when time is relevant;
  never expose raw wei or invent a date merely to decorate a factual answer.
