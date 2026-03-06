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

## Commands Reference

### Global Options

| Flag | Default | Env | Description |
|------|---------|-----|-------------|
| `-n, --network <network>` | `mainnet` | `NETWORK` | Chain selector: `mainnet`, `fuji`, `anvil`, `kitetestnet`, `custom` |
| `-k, --private-key <pk>` | — | `PK` | EVM private key (hex) for the L1 where the StakingVault is deployed |
| `-w, --wait <n>` | `2` | — | Confirmations to wait after write tx |
| `--skip-abi-validation` | off | — | Skip contract ABI validation |

### `run <stakingVaultAddress>`

Single keeper pass. Runs the selected operations once and exits.

| Option | Default | Env | Description |
|--------|---------|-----|-------------|
| `--harvest` | off | — | Include harvest in this run |
| `--pchain-tx-private-key <pk>` | — | `PCHAIN_TX_PRIVATE_KEY` | P-Chain key for completing registrations/removals |
| `--core` | off | — | Core operations only |
| `--completions` | off | — | P-Chain completions only |
| `--rpc-url <url>` | auto | `RPC_URL` | RPC URL for uptime queries during delegator registration completion |
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
| `--rpc-url <url>` | auto | `RPC_URL` | RPC URL for uptime queries during delegator registration completion |
| `--uptime-blockchain-id <hex>` | auto | `UPTIME_BLOCKCHAIN_ID` | Blockchain ID for uptime proofs |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PK` | yes | Private key (hex) for signing transactions on the L1 where the StakingVault is deployed |
| `NETWORK` | no | Chain selector (default: `mainnet`) |
| `VAULT_ADDRESS` | yes | StakingVault contract address (passed as positional arg via docker-compose) |
| `PCHAIN_TX_PRIVATE_KEY` | no | P-Chain private key for two-phase completions. If omitted, the keeper skips completions |
| `PK_COMPLETIONS` | no | Separate L1 private key for the completions container (defaults to `PK`) |
| `RPC_URL` | no | RPC URL for uptime queries. Auto-derived from chain config if omitted |
| `UPTIME_BLOCKCHAIN_ID` | no | Blockchain ID (hex) for uptime proofs. Auto-read from staking manager storage if omitted |

## Build

```bash
# from repo root
pnpm build && cd packages/keeper && pnpm build
```
