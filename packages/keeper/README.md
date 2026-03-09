# suzaku-keeper

Keeper bot for Suzaku StakingVault contracts. Runs permissionless maintenance operations — epoch processing, withdrawal preparation, harvest, and validator/delegator lifecycle completions — that keep a vault healthy and its withdrawal queue moving.

The keeper has two categories of work:

- **Core operations** (L1 key only) — epoch processing, withdrawal preparation, harvest, queue cleanup. These are pure L1 transactions.
- **P-Chain operations** (L1 key + P-Chain key) — completing two-phase validator/delegator registrations and removals. These require signing P-Chain transactions via warp messages.

## Requirements

- Node.js 18+
- pnpm
- Docker + Docker Compose (optional, for containerized deployment)
- A deployed StakingVault contract address
- An L1 private key (`PK`) for signing transactions on the chain where the StakingVault lives
- A P-Chain private key (`PCHAIN_TX_PRIVATE_KEY`) if you want to run completion operations

## Quick Start

```bash
# packages/keeper/.env
PK=0x...
NETWORK=kitetestnet
VAULT_ADDRESS=0x...
PCHAIN_TX_PRIVATE_KEY=0x...

cd packages/keeper
docker compose up -d
```

This starts two containers (`keeper-core` and `keeper-completions`) that together cover all maintenance operations. See [Architecture](#architecture) for why the split exists.

## Architecture

Docker Compose runs two containers to isolate the P-Chain key:

| Container | What it runs | Keys needed |
|-----------|-------------|-------------|
| `keeper-core` | Core operations (epochs, withdrawals, harvest, cleanup) | L1 key only (`PK`) |
| `keeper-completions` | P-Chain operations (registration + removal completions) | L1 key (`PK_COMPLETIONS` or `PK`) + P-Chain key |

Only the completions container ever sees the P-Chain key. If key isolation isn't a concern, you can run everything in a single process (omit both `--core` and `--completions`).

## Operations

### Epoch processing

Calls `processEpoch()` in a loop until the vault is caught up to the current epoch. This is the most frequent operation — epochs must be processed before other vault state transitions can proceed.

### Withdrawal preparation

When pending withdrawals exist, calls `prepareWithdrawals()` to earmark liquid balance for withdrawal claims. Gracefully handles `StakingVault__NoEligibleStake` (nothing eligible to unstake).

### P-Chain completions (registrations + removals)

Validator and delegator lifecycle operations are two-phase: first you *initiate* on the L1 (C-Chain tx), then you *complete* on the P-Chain (warp message + P-Chain tx). The keeper automates the second step.

It scans all operators' validators and delegators for pending operations:

- **Registration completions** — finds validators/delegators in `PendingAdded` status, locates the initiation tx via event logs, and calls `completeValidatorRegistration` / `completeDelegatorRegistration`.
- **Removal completions** — finds validators/delegators with pending removals and calls `completeValidatorRemoval` / `completeDelegatorRemoval`.

Requires `PCHAIN_TX_PRIVATE_KEY`. If omitted, the keeper skips these entirely.

### Harvest

Calls `harvestValidators` and `harvestDelegators` per operator in batches of 50 to stay within gas limits. In `watch` mode, harvest runs on a separate interval (default: 12 hours) rather than every tick.

### Queue cleanup

Scans the withdrawal queue head for claimable entries and calls `claimWithdrawalsFor` to unblock the queue. Scans up to 50 entries from the head.

### Protocol fee warning

Logs a warning if escrowed protocol fees exist. Claiming requires `VAULT_ADMIN_ROLE`, so the keeper just alerts — it doesn't claim.

## Usage

### Docker Compose

```bash
# packages/keeper/.env
PK=0x...
NETWORK=kitetestnet
VAULT_ADDRESS=0x...
PCHAIN_TX_PRIVATE_KEY=0x...
# PK_COMPLETIONS=0x...         # optional: separate L1 key for completions container
# RPC_URL=https://...           # optional: auto-derived from chain config
# UPTIME_BLOCKCHAIN_ID=0x...    # optional: auto-read from staking manager storage

docker compose up -d
```

### Direct

```bash
# Single run — everything (core + P-Chain operations)
node dist/index.js run 0xVAULT --harvest --pchain-tx-private-key 0x...

# Single run — core operations only (no P-Chain key needed)
node dist/index.js run 0xVAULT --harvest --core

# Single run — P-Chain operations only (registration/removal completions)
node dist/index.js run 0xVAULT --completions --pchain-tx-private-key 0x...

# Daemon — everything
node dist/index.js watch 0xVAULT --pchain-tx-private-key 0x...

# Daemon — core operations only
node dist/index.js watch 0xVAULT --core

# Daemon — P-Chain operations only
node dist/index.js watch 0xVAULT --completions --pchain-tx-private-key 0x...
```

## Monitoring & Observability

The keeper exposes Prometheus metrics, a health endpoint, structured JSON logs, and optional webhook alerts.

### Endpoints

| Endpoint | Port | Description |
|----------|------|-------------|
| `GET /metrics` | 9090 | Prometheus text format. All `suzaku_*` gauges/counters plus Node.js process metrics (heap, event loop lag) |
| `GET /health` | 9090 | JSON `{"healthy":true/false, "lastTickAge":..., "consecutiveFailures":...}`. Returns 200 when healthy, 503 when not |

### Metrics Reference

#### Vault Health

These are read from the StakingVault contract every tick via multicall.

| Metric | Type | What it means |
|--------|------|---------------|
| `suzaku_solvency_ratio` | gauge | `getTotalPooledStake() / totalSupply()`. Should be ~1.0. Measures whether the vault's token supply is fully backed by staked assets. Drift above 1 means extra rewards haven't been distributed; drift below 1 means the vault is undercollateralized. At 0, deposits are blocked entirely (insolvency gate) |
| `suzaku_exchange_rate` | gauge | Share-to-asset conversion rate from `getExchangeRate()`. Starts at 1.0 and grows as rewards accrue. A sudden drop indicates a loss event |
| `suzaku_tvl` | gauge | Total value locked in native token — `getTotalPooledStake()`. The sum of all staked assets including those delegated to validators |
| `suzaku_available_stake` | gauge | Liquid native token in the vault's buffer — `getAvailableStake()`. This is what's immediately available for withdrawals without needing to unstake from validators. When this drops low, `prepareWithdrawals` must initiate validator/delegator removals, adding 14+ day delays |
| `suzaku_pending_withdrawals` | gauge | Total native token requested for withdrawal but not yet claimable — `getPendingWithdrawals()`. High values mean users are waiting |
| `suzaku_queue_depth` | gauge | Number of withdrawal requests in the FIFO queue (`getWithdrawalQueueLength() - getQueueHead()`). The queue is head-of-line blocking — one large unfulfillable request blocks everything behind it |
| `suzaku_epoch_lag` | gauge | `getCurrentEpoch() - getLastEpochProcessed()`. How many epochs behind the vault is. The keeper calls `processEpoch()` to advance this. Each call processes up to 350 withdrawal entries, so large backlogs take multiple iterations. While epochs are behind, new withdrawal requests can't be fulfilled |
| `suzaku_pending_protocol_fees` | gauge | Unclaimed protocol fees in native token — `getPendingProtocolFees()`. Requires `VAULT_ADMIN_ROLE` to claim (the keeper can't claim these, it just tracks them) |
| `suzaku_vault_paused` | gauge | 0 = active, 1 = paused. When paused, deposits and withdrawal requests are blocked. Emergency state set by the vault admin |

#### Per-Operator (label: `operator`)

Each operator is a separate label value. Tracked per tick by querying `getOperatorInfo`, `getOperatorExitDebt`, `getOperatorValidators`, `getOperatorDelegators`.

| Metric | Type | What it means |
|--------|------|---------------|
| `suzaku_operator_active_stake` | gauge | native token actively staked through this operator's validators/delegators |
| `suzaku_operator_exit_debt` | gauge | native token owed by this operator due to slashing or early exits. At 50% of the operator's allocation, the operator is frozen on-chain. Alert fires well before that |
| `suzaku_operator_allocation_bips` | gauge | Operator's share of the vault's total stake in basis points (10000 = 100%). Set by the vault admin |
| `suzaku_operator_accrued_fees` | gauge | Unclaimed operator fees in native token |
| `suzaku_operator_validator_count` | gauge | Number of active validators for this operator |
| `suzaku_operator_delegator_count` | gauge | Number of active delegators for this operator |

#### Keeper Internals

| Metric | Type | What it means |
|--------|------|---------------|
| `suzaku_keeper_last_tick_timestamp` | gauge | Unix timestamp of the last completed tick |
| `suzaku_keeper_tick_duration_ms` | gauge | How long the last tick took in milliseconds |
| `suzaku_keeper_tick_errors_total` | counter | Total ticks that failed with an unhandled error |
| `suzaku_keeper_epochs_processed_total` | counter | Total successful `processEpoch` calls |
| `suzaku_keeper_withdrawals_prepared_total` | counter | Total `prepareWithdrawals` calls |
| `suzaku_keeper_harvests_total` | counter | Total harvest runs |
| `suzaku_keeper_queue_cleanups_total` | counter | Total withdrawal entries cleaned from the queue head |
| `suzaku_keeper_validator_regs_completed_total` | counter | Validator registrations completed (P-Chain) |
| `suzaku_keeper_delegator_regs_completed_total` | counter | Delegator registrations completed (P-Chain) |
| `suzaku_keeper_validator_removals_total` | counter | Validator removals completed (P-Chain) |
| `suzaku_keeper_delegator_removals_total` | counter | Delegator removals completed (P-Chain) |

#### On-Chain Events

Counters incremented by `watchContractEvent` listeners (watch mode only, polled every 2s).

| Metric | Type | What it means |
|--------|------|---------------|
| `suzaku_events_deposited_total` | counter | `StakingVault__Deposited` — someone deposited native token into the vault |
| `suzaku_events_withdrawal_requested_total` | counter | `StakingVault__WithdrawalRequested` — someone queued a withdrawal |
| `suzaku_events_withdrawal_claimed_total` | counter | `StakingVault__WithdrawalClaimed` — someone claimed a fulfilled withdrawal |
| `suzaku_events_epoch_processed_total` | counter | `StakingVault__EpochProcessed` — an epoch was processed (by this keeper or anyone) |
| `suzaku_events_harvested_total` | counter | `StakingVault__Harvested` — rewards were harvested |
| `suzaku_harvest_total_rewards` | gauge | native token from the last `Harvested` event's `totalRewards` field |

### Alerts

Alerts fire as webhook POSTs when a condition transitions from OK to alerting (or back). No duplicate alerts — only state changes. Set `ALERT_WEBHOOK_URL` to enable. The payload is JSON compatible with Slack incoming webhooks, Discord, and PagerDuty.

| Alert | Default Threshold | Why it matters |
|-------|-------------------|----------------|
| Solvency drift | `\|ratio - 1.0\| > 0.01` (1%) | The vault's token supply isn't fully backed. `getTotalPooledStake()` can temporarily overstate during keeper latency windows. At ratio 0, deposits are blocked entirely |
| Epoch lag | `> 2` epochs | `processEpoch` is capped at 350 entries per call — large queues need multiple iterations. Lag means stuck withdrawals and stale accounting |
| Queue depth | `> 100` requests | The withdrawal queue is FIFO with head-of-line blocking. One large unfulfillable request blocks everything behind it |
| Consecutive tick failures | `>= 3` | The keeper is down. All permissionless operations pile up — epochs fall behind, withdrawals stall, queue grows |
| Vault paused | immediate | Deposits and withdrawal requests are blocked. Emergency state |
| Operator exit debt | `> 500 bips` (5%) of allocation | At 50% the operator is frozen on-chain. Alert fires well before to give time to respond |

All thresholds are configurable via CLI flags or env vars (see below).

### Structured Logs

Every tick writes a JSON line to stderr:
```json
{"level":"info","ts":"2025-...","tick":{"epochProcessed":true,"epochIterations":1,...},"durationMs":2400}
```
`level` is `"info"` for clean ticks, `"warn"` when errors occurred. Log aggregators (CloudWatch, Loki, Datadog) pick up stderr JSON lines automatically.

### Grafana Dashboard

A pre-built dashboard is provisioned automatically when using the monitoring stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

- **Prometheus** — `http://localhost:9092`
- **Grafana** — `http://localhost:3000` (no login, anonymous admin)

The dashboard is at `http://localhost:3000/d/suzaku-keeper` and includes: TVL, solvency ratio, exchange rate, vault paused status, epoch lag, queue depth, available stake vs pending withdrawals, protocol fees, per-operator stake/debt/validators/delegators, keeper tick duration, error rate, and event rates.

## Commands Reference

### Global Options

| Flag | Default | Env | Description |
|------|---------|-----|-------------|
| `-n, --network <network>` | `mainnet` | `NETWORK` | Chain selector: `mainnet`, `fuji`, `anvil`, `kitetestnet`, `custom` |
| `-r, --rpc-url <url>` | — | `RPC_URL` | RPC URL — automatically sets `--network custom` and queries the node for chain ID |
| `-k, --private-key <pk>` | — | `PK` | EVM private key (hex). Any key with gas works — keeper calls are permissionless |
| `-w, --wait <n>` | `2` | — | Confirmations to wait after write tx |
| `--skip-abi-validation` | off | `SKIP_ABI_VALIDATION` | Skip contract ABI validation |
| `--metrics-port <port>` | `9090` | `METRICS_PORT` | Prometheus metrics port. Set to `0` to disable |
| `--alert-webhook <url>` | — | `ALERT_WEBHOOK_URL` | Webhook URL for alerts (Slack, Discord, PagerDuty) |
| `--alert-solvency-threshold <n>` | `0.01` | — | Solvency deviation threshold (0.01 = 1%) |
| `--alert-epoch-lag <n>` | `2` | — | Epoch lag threshold |
| `--alert-queue-depth <n>` | `100` | — | Queue depth threshold |
| `--alert-consecutive-failures <n>` | `3` | — | Consecutive tick failures threshold |
| `--alert-exit-debt-bips <n>` | `500` | — | Operator exit debt threshold in bips |

### `run <stakingVaultAddress>`

Single keeper pass. Runs the selected operations once and exits.

| Option | Default | Env | Description |
|--------|---------|-----|-------------|
| `--harvest` | off | — | Include harvest in this run |
| `--pchain-tx-private-key <pk>` | — | `PCHAIN_TX_PRIVATE_KEY` | P-Chain key for completing registrations/removals |
| `--core` | off | — | Core operations only |
| `--completions` | off | — | P-Chain completions only |
| `--uptime-blockchain-id <hex>` | auto | `UPTIME_BLOCKCHAIN_ID` | Blockchain ID for uptime proofs |

### `watch <stakingVaultAddress>`

Long-running daemon. Runs keeper passes on a polling interval with a separate harvest cadence.

| Option | Default | Env | Description |
|--------|---------|-----|-------------|
| `--poll-interval <seconds>` | `1800` | — | Seconds between ticks (30 min) |
| `--harvest-interval <seconds>` | `43200` | — | Seconds between harvests (12 hours) |
| `--pchain-tx-private-key <pk>` | — | `PCHAIN_TX_PRIVATE_KEY` | P-Chain key for completing registrations/removals |
| `--core` | off | — | Core operations only |
| `--completions` | off | — | P-Chain completions only |
| `--uptime-blockchain-id <hex>` | auto | `UPTIME_BLOCKCHAIN_ID` | Blockchain ID for uptime proofs |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PK` | yes | Private key (hex) for signing transactions. Any key with gas on the L1 — no special roles needed |
| `NETWORK` | no | Chain selector (default: `mainnet`). Not needed if `RPC_URL` is set |
| `RPC_URL` | no | RPC URL for the L1 where the StakingVault lives. Auto-detects chain ID and sets `--network custom` |
| `VAULT_ADDRESS` | yes | StakingVault contract address |
| `PCHAIN_TX_PRIVATE_KEY` | no | P-Chain private key for two-phase completions. If omitted, the keeper skips completions |
| `PK_COMPLETIONS` | no | Separate L1 private key for the completions container (defaults to `PK`) |
| `UPTIME_BLOCKCHAIN_ID` | no | Blockchain ID (hex) for uptime proofs. Auto-read from staking manager storage if omitted |
| `SKIP_ABI_VALIDATION` | no | Set to `true` to skip contract ABI validation |
| `METRICS_PORT` | no | Prometheus metrics port (default: `9090`, set `0` to disable) |
| `ALERT_WEBHOOK_URL` | no | Webhook URL for alerts. If unset, no alerts are sent |

## Build

```bash
# from repo root
pnpm build && cd packages/keeper && pnpm build
```
