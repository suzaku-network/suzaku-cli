# Deployment Heartbeat — design (implemented; see "Implementation status" below)

Proactive monitoring for the Dexalot Suzaku deployment, delivered through the OpenClaw Telegram bot. Two outputs from one composite `deployment_heartbeat` read tool (checks run deterministically in TypeScript; the LLM only formats the result):

1. **Epoch digest** — one formatted Telegram message per middleware epoch (every 3.5 days = half a week), answering the maintainer's two standing questions: *what changed* (nodes / stakes / operators / validators) and *what happened in rewards* (set / funded / distributed / claimed — for which epochs, and what is claimable now).
2. **Anomaly alerts** — a quiet 4-hourly cron that posts only `warn`/`alert` rows.

## Grounding

- Primary source: the **deployed contract ABIs in this repo + live mainnet reads** (the local suzaku-core checkout is March 2025 with near-empty docs; public docs don't cover rewards mechanics; the keeper's docs describe the StakingVault/Kite path which Dexalot does not run).
- Measured live constants (Dexalot, June 2026):

| Constant | Value | Meaning |
|---|---|---|
| middleware `EPOCH_DURATION` | 302,400 s | **3.5 days — one epoch = half a week** |
| middleware `UPDATE_WINDOW` | 259,200 s | 3-day window within each epoch for stake/weight updates |
| rewards `minRequiredUptime` | 241,200 s | ~80% of an epoch — below ⇒ operator ineligible that epoch |
| rewards `DISTRIBUTION_EARLIEST_OFFSET` | 2 | epoch N distributable only from epoch N+2 |
| rewards `FUNDING_DEADLINE_OFFSET` | 4 | funding for epoch N closes when N+4 starts (`FundingWindowClosed`) |
| rewards `CLAIM_GRACE_PERIOD_EPOCHS` | 1 | grace before undistributed rewards are reclaimable |
| fees | 5% protocol / 0 / 0 | live `getFeesConfiguration` |

- Contract preconditions (from ABI errors): distribution requires operator uptime set (`OperatorUptimeNotSet`) and funding (`EpochNotFunded`); `setRewardsAmountForEpochs` **accumulates** and is blocked once distribution starts (`DistributionAlreadyStarted`); `epochStatus(epoch) → (funded, distributionComplete)` exists on-chain but is **not CLI-exposed yet** (gap #1).

## The "since last digest" reference point

No persisted state needed: **the epoch boundary is the reference.** A digest for the rollover N−1 → N reports everything that happened during epoch N−1 — i.e. log scans run `fromBlock = epoch(N−1) start block` (via `getEpochStartTs` + `blockAtTimestamp`) to `toBlock = latest`. This is the same block-range machinery already shipped in `rewards get-amount-set-events`, generalized to more event types. "Every half a week" and "one epoch" are the same cadence, so the window is unambiguous.

## The rolling epoch window (what is in flight)

When epoch N starts, four epochs are operationally live:

| Epoch | State | Required action | Deadline |
|---|---|---|---|
| N | running | stake cache set; weight updates inside update window | window close (start + 3 d) |
| N−1 | uptime phase | report validator uptimes → compute operator uptime (≥80%) | before distributing N−1 (earliest N+1) |
| N−2 | distributable | fund + set-amount (once!) → distribute in batches | funding closes at N+2 start |
| N−3 / N−4 | closing | distribution complete; undistributed reclaimable after grace | funding for N−4 closes now |

## Digest content — Side 1: what changed (nodes / stakes / operators / validators)

Sourced by scanning events over the elapsed epoch (the maintainer wants *what changed*, and events carry the tx for proof):

- **Middleware:** `NodeAdded`, `NodeRemoved`, `NodeStakeUpdated` (before → after weight), `AllNodeStakesUpdated`, `OperatorHasLeftoverStake`. The CLI already scans the first three (`middleware node-logs`, MCP `middleware_get_node_logs`); generalize to the full set.
- **Balancer:** `InitiatedValidatorRegistration` / `CompletedValidatorRegistration`, `Initiated`/`CompletedValidatorRemoval`, `Initiated`/`CompletedValidatorWeightUpdate`, `SecurityModuleWeightUpdated`, `RegisteredInitialValidator`. An *Initiated without a matching Completed* in the window is the stuck-two-phase signal to flag.
- **Quiet epoch** is itself information: "no node/stake/validator changes this epoch" is a valid, reassuring line — the maintainer explicitly wants to know whether anything moved.

Each change renders as one line: `+ node NodeID-7RW… (operator 0x8533…, weight 5.0M)` / `~ stake NodeID-Fsk… 4.8M → 5.0M` / `✓ validator NodeID-7RW… registration completed`, with a snowscan tx link.

## Digest content — Side 2: rewards activity + per-epoch claimability

**(a) Activity this epoch** — event scan of the Rewards contract over the elapsed epoch:
- `RewardsAmountSet` (epoch, amount, tx — **flag >1 tx for the same epoch**, the epoch-35 failure mode)
- `RewardsDistributed` (epoch), `RewardsClaimed` (count + total claimed by stakers)
- `OperatorFeeClaimed` / `CuratorFeeClaimed` / `ProtocolFeeClaimed`, `UndistributedRewardsClaimed` (epoch, recipient, amount)
- `ZeroRewardsClaim` — someone claimed and got zero; a direct confusion signal worth surfacing ("2 zero-claims this epoch — someone expects rewards that aren't there").

**(b) Claimability table** — the table the maintainer asked for, state reads per epoch across the window (N−6 … N). Columns:

| epoch | set (ALOT) | set-txs | funded | distributed | **status** |
|---|---|---|---|---|---|

where **status** is the derived, plain-language column:
- `claimable now` — distribution complete, within the claim window
- `distributing (k/n ops)` — distribution started, not complete (`rewards_get_distribution_batch`)
- `waiting uptime` — uptime not yet computed for the epoch
- `not set · funding closes <date>` — no amount set, with the `FUNDING_DEADLINE_OFFSET` countdown
- `reclaim after <date>` — undistributed, past grace
- `⚠ N set-amount txs (accumulated)` — `eventCount > 1`

Reads used: `rewards_get_epoch_rewards`, `rewards_get_distribution_batch`, `rewards_epoch_diagnosis`, and `epochStatus` once exposed (gap #1). Per-claimer "claimed up to epoch K" comes from `rewards_get_last_claimed` (now returns data after this PR's fix).

## Telegram format (visualization is the deliverable)

Telegram is the only channel that exists here; the visualization is a tight monospace block (renders as ``` ``` `pre` in Telegram) plus emoji status lines. OpenClaw renders the bot's markdown. Target message (≤ ~22 lines, amounts pre-humanized in TypeScript so the LLM never does decimal math):

```
🟢 Suzaku · Dexalot — epoch 39 started (Jun 13 14:00 UTC)
   update window closes Jun 16 14:00 · cache ✅ ready (class 1)

CHANGED this epoch
  ~ stake NodeID-Fsk…Bt  4.80M → 5.00M ALOT  (0x9de4…)
  ✓ validator NodeID-7RW…q8  registration completed
  operators 1 · validators 7/7 Active · TVL 11.32M sALOT (▲0.4%)
  wsALOT 1.0231 ALOT/share (▲0.0012)

REWARDS
  ┌ epoch  set ALOT  txs  fund  dist  status
  │  38       —       0    —     —    waiting uptime
  │  37     9,540     1    ✅    ▰▰▰   distributing 1/2 ops
  │  36     9,586     1    ✅    ✅    claimable now
  │  35    27,915    ⚠3    ✅    ✅    ⚠ 3 set-amount txs (accumulated)
  └  34     9,536     1    ✅    ✅    reclaim after Jun 20
  activity: distributed e36 · 4 staker claims (8,910 ALOT) · 1 zero-claim ⚠

🔴 epoch 35 had 3 set-amount txs — totals accumulated (ask: "diagnose epoch 35")
— alerts only between digests · ask "what's claimable for 0x…?"
```

Markers: 🟢/✅ ok · ⚠️ action-needed/anomaly · 🔴 deadline-at-risk or confirmed problem. The claimability table is the centerpiece; the CHANGED block is omitted entirely (replaced by "no changes this epoch") when the scans come back empty.

## Alert-only checks between digests (4-hourly, post only non-OK)

| Check | Condition | Source |
|---|---|---|
| Stake cache late | `!allClassesCached` and update window < 1 day to close | `middleware_epoch_status` |
| Uptime missing late | `isUptimeSet=false` for N−1 past 50% of epoch N | `middleware_uptime_report` |
| Funding deadline at risk | epoch unset and < 1 epoch to `FundingWindowClosed` | `rewards_get_epoch_rewards` (+ `epochStatus`) |
| Set-amount accumulation | `eventCount > 1` for any epoch in window | `rewards_epoch_diagnosis` |
| Distribution stalled | started but `isComplete=false` two runs running | `rewards_get_distribution_batch` |
| Validator not Active / stuck-pending | status ∉ {Active}, or Initiated w/o Completed | `balancer_get_validator_status` |
| LST deposits paused | `paused=true` | `lst_wrapper_paused` |
| P-Chain fee balance low | balance < threshold | ❌ no read tool yet (gap #2) |

**Kite profile (separate, not Dexalot):** vault epoch lag / pause, keeper `/health` — only where a StakingVault + keeper run.

## Why Telegram message, not HTML/PDF

- The channel that exists is the OpenClaw bot in the Dexalot group; Telegram's bold/monospace/emoji/links cover a 22-line digest, and OpenClaw renders it.
- No HTML/PDF: there is no hosting or rendering infra here, and a static artifact is stale within hours. Charts/dashboards = Prometheus + Grafana (the keeper stack already ships a Grafana dashboard for the Kite path) — separate infra, separate decision.
- The composite tool returns structured JSON regardless, so a future Grafana/web consumer reuses it unchanged. Drill-down stays conversational (the digest ends with prompts the bot can already answer via `rewards_epoch_diagnosis`, dashboards, `rewards_get_last_claimed`).

## Tool spec

`deployment_heartbeat` — `{ readOnlyHint: true }`, `skipLimiter: true`, new `packages/mcp/src/tools/heartbeat.ts`.

- Params: `middlewareAddress`, `rewardsAddress`, `balancerAddress`, `lstWrapperAddress`, `vaultAddress`, `uptimeTrackerAddress`, `network`, `rpcUrl`; optional `mode: 'digest' | 'alerts'` (default `alerts`), `windowEpochs` (default 6 for the table), thresholds with defaults.
- Returns `{ epoch, windowStartBlock, changed: {nodes[], validators[], operators, tvl, rate}, rewards: { activity[], claimability[] }, checks: [{name, epoch?, status, detail, human}] }` — `human` fields pre-humanized.
- ~12–18 CLI sub-calls per digest (more event scans than the alert mode); at the digest cadence this is negligible on a dedicated RPC.

## Gaps to close (ordered)

1. **`rewards get-epoch-status`** — wrap `epochStatus(epoch) → (funded, distributionComplete)`; `funded` (actual token transfer) is the cleanest funding-deadline signal and is currently invisible. Tiny additive CLI read + MCP wrapper.
2. **Rewards lifecycle event-scan command** — generalize `get-amount-set-events` into `rewards get-events <addr> --from-epoch --to-epoch` covering `RewardsDistributed/Claimed/UndistributedRewardsClaimed/*FeeClaimed/ZeroRewardsClaim`, so the digest's "activity" line has one efficient source instead of N reads.
3. **Generalize `middleware node-logs`** to also surface `AllNodeStakesUpdated` / `OperatorHasLeftoverStake` and the balancer validator-lifecycle events for the CHANGED section.
4. **P-Chain continuous-fee balances** — no read command exists (`getCurrentValidators` has the data; only `top-up-*` writes use it). Needed for the validator-liveness alert.
5. **Kite-path addData fix** (`issue-stakingvault-kite-empty-json.md`) — unblocks the Kite profile only.

## Operational caveats

- Cron jobs are lost on container rebuild — keep the two `openclaw.mjs cron create` commands in a post-start script. One alerts cron every 4 h; the digest fires when that run detects `epoch != lastReportedEpoch` (the tool returns `epoch`, so the bot compares against its last message — no extra scheduler needed for the 3.5-day period a fixed cron can't express).
- Two runs inside the 60 s dedup window return cached data — harmless at these cadences.
- Use a dedicated RPC, not `api.avax.network`. Heartbeat-only crons can run on `claude-haiku-4-5` to cut cost; the formatting task is trivial.

## Implementation status (June 2026)

Implemented in `packages/mcp/src/tools/heartbeat.ts` as the `deployment_heartbeat` tool (read-only; registered in both normal and `--read-only` mode). CLI gaps 1–4 are closed:

1. `rewards get-epoch-status <addr> <epoch> [--to-epoch <n>]` — wraps `epochStatus` + `getEpochRewards` + scheduling constants; one call covers the whole claimability window. MCP: `rewards_get_epoch_status`.
2. `rewards get-events <addr> --middleware <mw> --from-epoch <n> [--to-epoch <n>]` — single-pass scan of all 8 lifecycle events with per-type counts. MCP: `rewards_get_events`.
3. `middleware node-logs` — extended with `--from-epoch/--from-block/--to-block` and the `AllNodeStakesUpdated`/`OperatorHasLeftoverStake` events. MCP: `middleware_get_node_logs` (new `fromEpoch`/`fromBlock`/`toBlock` params).
4. `middleware get-validator-balances <addr>` — P-Chain continuous-fee balances for all subnet validators, matched to operators. MCP: `middleware_get_validator_balances`.

Gap 5 (Kite-path `addData`) remains a separate issue and only blocks the Kite profile.

Behavior notes vs. the design above:

- The digest's set-amount accumulation flag counts `RewardsAmountSet` events **within the scanned window** (the elapsed epoch). It catches accumulation as it happens; historical incidents are drill-down via `rewards_epoch_diagnosis`. First live digest run (epoch 38) immediately flagged epochs 35 *and* 36 as accumulated this way.
- Validator health uses the P-Chain validator list + stuck two-phase event detection instead of per-node `balancer get-validator-status` calls (that command takes one nodeId per call).
- The undistributed-reclaim date is an approximation (`epoch start + (DISTRIBUTION_EARLIEST_OFFSET + CLAIM_GRACE_PERIOD_EPOCHS + 1) × epochDuration`) marked with `~` — the contract exposes no view for the `EpochStillClaimable` boundary.
- The tool emits `humanLines: string[]` assembled deterministically in TypeScript: alerts mode returns `[]` when every check is ok (= post nothing); digest mode returns the full monospace block ready for Telegram.
- Measured live (Dexalot mainnet, public RPC): alerts mode ~4 s, digest mode ~15–40 s.

## OpenClaw setup

Two crons, both every 4 h — add to the post-start script so they survive container rebuilds:

```bash
# 1. Alerts: post only when something needs attention
openclaw.mjs cron create \
  --schedule "10 */4 * * *" \
  --prompt "Call deployment_heartbeat with mode=alerts, middlewareAddress=0x9411307279456450ABF9B5181aA7a02271f0DC34, rewardsAddress=0x0f388C7c6201014Ad836400e9e2ebD211BDBcB00, lstWrapperAddress=0xDc1c4428F3145286f262980d36C640285c0DA403, network=mainnet. If humanLines is empty, do nothing. Otherwise post humanLines verbatim as a monospace block to the group."

# 2. Digest: post once per epoch rollover (the bot compares the returned epoch to the last digest it posted)
openclaw.mjs cron create \
  --schedule "25 */4 * * *" \
  --prompt "Call deployment_heartbeat with mode=digest (same addresses as the alerts cron). If the returned epoch equals the epoch of the last digest you posted, do nothing. Otherwise post humanLines verbatim as a monospace block to the group, then remember this epoch."
```

Use a dedicated `rpcUrl` in production; the digest's event scans are too slow for rate-limited public endpoints. `claude-haiku-4-5` is sufficient for both crons — the message is pre-formatted.
