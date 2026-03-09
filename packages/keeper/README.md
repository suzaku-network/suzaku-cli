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
cd packages/keeper

# Set chain and vault address
echo "NETWORK=kitetestnet" > .env
echo "VAULT_ADDRESS=0x..." >> .env

# Write private keys as Docker secrets (not env vars)
mkdir -p secrets
echo -n "0x..." > secrets/pk.txt
echo -n "0x..." > secrets/pchain_tx_private_key.txt

docker compose up -d
```

This starts two containers (`keeper-core` and `keeper-completions`) that together cover all maintenance operations. See [Architecture](#architecture) for why the split exists.

## Architecture

Docker Compose runs two containers to isolate the P-Chain key:

| Container | What it runs | Keys needed |
|-----------|-------------|-------------|
| `keeper-core` | Core operations (epochs, withdrawals, harvest, cleanup) | L1 key only (`PK`) |
| `keeper-completions` | P-Chain operations (registration + removal completions) | L1 key (`PK`) + P-Chain key |

Only the completions container ever sees the P-Chain key. If key isolation isn't a concern, you can run everything in a single process (omit both `--core` and `--completions`).

### What happens if the keeper goes down?

Everything the keeper does is permissionless — if it stops, no on-chain state is corrupted. Epochs fall behind, withdrawals stall, and the queue grows, but nothing is lost. Restart it and it catches up automatically.

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
NETWORK=kitetestnet
VAULT_ADDRESS=0x...
# RPC_URL=https://...           # optional: auto-derived from chain config
# UPTIME_BLOCKCHAIN_ID=0x...    # optional: auto-read from staking manager storage

# Private keys go in secrets/ (mounted as Docker secrets, not env vars)
# secrets/pk.txt                — L1 private key (required)
# secrets/pchain_tx_private_key.txt — P-Chain key (required for completions)
# secrets/pk_completions.txt    — optional: separate L1 key for completions container

docker compose up -d
```

### Direct

> **Note:** The CLI defaults to `--network mainnet`. Use `-n fuji` or `-n kitetestnet` for testnets. Docker Compose defaults to `fuji`.

```bash
# Single run — everything (core + P-Chain operations)
node dist/index.js run 0x1234...abcd -n kitetestnet --harvest --pchain-tx-private-key 0x...

# Single run — core operations only (no P-Chain key needed)
node dist/index.js run 0x1234...abcd -n kitetestnet --harvest --core

# Single run — P-Chain operations only (registration/removal completions)
node dist/index.js run 0x1234...abcd -n kitetestnet --completions --pchain-tx-private-key 0x...

# Daemon — everything
node dist/index.js watch 0x1234...abcd -n kitetestnet --pchain-tx-private-key 0x...

# Daemon — core operations only
node dist/index.js watch 0x1234...abcd -n kitetestnet --core

# Daemon — P-Chain operations only
node dist/index.js watch 0x1234...abcd -n kitetestnet --completions --pchain-tx-private-key 0x...
```

## Monitoring & Observability

The keeper exposes Prometheus metrics, a health endpoint, structured JSON logs, and optional webhook alerts.

### Endpoints

| Endpoint | Port | Description |
|----------|------|-------------|
| `GET /metrics` | 9090 | Prometheus text format. All `suzaku_*` gauges/counters plus Node.js process metrics (heap, event loop lag) |
| `GET /health` | 9090 | JSON `{"healthy":true/false, "lastTickAge":..., "consecutiveFailures":...}`. Returns 200 when healthy, 503 when not |

### Metrics Reference

See [METRICS.md](METRICS.md) for the full list of all Prometheus metrics with descriptions.

### Alerts

Alerts fire as webhook POSTs when a condition transitions from OK to alerting (or back). No duplicate alerts — only state changes. Set `ALERT_WEBHOOK_URL` to enable. The payload is JSON compatible with Slack incoming webhooks, Discord, and PagerDuty.

| Alert | Default Threshold | Why it matters |
|-------|-------------------|----------------|
| Solvency drift | `\|ratio - 1.0\| > 0.01` (1%) | The vault's token supply isn't fully backed. `getTotalPooledStake()` can temporarily overstate during keeper latency windows. At ratio 0, deposits are blocked entirely |
| Epoch lag | `> 2` epochs | `processEpoch` is capped at 350 entries per call — large queues need multiple iterations. Lag means stuck withdrawals and stale accounting |
| Queue depth | `> 100` requests | The withdrawal queue is FIFO with head-of-line blocking. One large unfulfillable request blocks everything behind it |
| Consecutive tick failures | `>= 3` | The keeper is down. All permissionless operations pile up — epochs fall behind, withdrawals stall, queue grows |
| Vault paused | immediate | Deposits and withdrawal requests are blocked. Emergency state |
| Operator exit debt | `> 500 bips` (5%) of allocation | **Not yet implemented** — threshold is accepted but the alert does not fire. Tracked for a future release |

All thresholds are configurable via CLI flags (see below). Only `--alert-webhook` has an env var (`ALERT_WEBHOOK_URL`).

### Structured Logs

Every tick writes a JSON line to stderr:
```json
{"level":"info","ts":"2025-...","tick":{"epochProcessed":true,"epochIterations":1,...},"durationMs":2400}
```
`level` is `"info"` for clean ticks, `"warn"` when errors occurred. Log aggregators (CloudWatch, Loki, Datadog) pick up stderr JSON lines automatically.

### Grafana Dashboard

A pre-built dashboard JSON is included at `grafana-dashboard.json`. To use it, start the monitoring stack and import it manually into Grafana:

```bash
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

- **Prometheus** — `http://localhost:9092`
- **Grafana** — `http://localhost:3000` (no login, anonymous viewer)

Import `grafana-dashboard.json` via the Grafana UI (Dashboards → Import). The dashboard includes: TVL, solvency ratio, exchange rate, vault paused status, epoch lag, queue depth, available stake vs pending withdrawals, protocol fees, per-operator stake/debt/validators/delegators, keeper tick duration, error rate, and event rates.

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
| `PK` | yes | Private key (hex) for signing transactions. Any key with gas on the L1 — no special roles needed. In Docker, provided via file-based secret (`secrets/pk.txt`) |
| `NETWORK` | no | Chain selector (default: `mainnet` for CLI, `fuji` in docker-compose). Not needed if `RPC_URL` is set |
| `RPC_URL` | no | RPC URL for the L1 where the StakingVault lives. Auto-detects chain ID and sets `--network custom` |
| `VAULT_ADDRESS` | yes | StakingVault contract address (used by docker-compose to pass the CLI argument) |
| `PCHAIN_TX_PRIVATE_KEY` | no | P-Chain private key for two-phase completions. If omitted, the keeper skips completions. In Docker, provided via file-based secret (`secrets/pchain_tx_private_key.txt`) |
| `UPTIME_BLOCKCHAIN_ID` | no | Blockchain ID (hex) for uptime proofs. Auto-read from staking manager storage if omitted |
| `SKIP_ABI_VALIDATION` | no | Set to any non-empty value to skip contract ABI validation |
| `METRICS_PORT` | no | Prometheus metrics port (default: `9090`, set `0` to disable) |
| `ALERT_WEBHOOK_URL` | no | Webhook URL for alerts. If unset, no alerts are sent |

## Build

```bash
# from repo root
pnpm build && cd packages/keeper && pnpm build
```
