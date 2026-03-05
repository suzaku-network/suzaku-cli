# suzaku-keeper

Keeper bot for Suzaku StakingVault. Runs permissionless maintenance operations that keep the vault healthy.

## What it does

Each tick runs these steps in order:

1. **Process epoch** — calls `processEpoch()` in a loop until caught up
2. **Prepare withdrawals** — calls `prepareWithdrawals()` when pending withdrawals exist and liquid balance is insufficient
3. **Complete pending registrations** — scans for PendingAdded validators/delegators and completes them on L1 _(requires P-Chain key)_
4. **Complete pending removals** — scans for initiated validator/delegator removals and completes them on P-Chain _(requires P-Chain key)_
5. **Batched harvest** — calls `harvestValidators`/`harvestDelegators` per operator in batches of 50 to stay within gas limits
6. **Queue head cleanup** — claims fulfilled withdrawals blocking the queue head (`claimWithdrawalsFor`)
7. **Protocol fee warning** — logs a warning if escrowed protocol fees exist (claiming requires `VAULT_ADMIN_ROLE`)

## Two-container architecture

The keeper is designed to run as two separate containers for security isolation:

- **keeper-core** (lower privilege) — runs steps 1, 2, 5, 6, 7. Only needs the L1 key (`PK`). Uses `--skip-completions`.
- **keeper-completions** (higher privilege) — runs steps 3, 4. Needs L1 key + P-Chain key. Uses `--completions-only`. Can use a separate `PK_COMPLETIONS` for the L1 key.

This split minimizes the blast radius of the P-Chain key — only the completions container has access to it.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PK` | **yes** | Private key (hex) for signing transactions on the L1 where the StakingVault is deployed (e.g. Kite L1). This is **not** a C-Chain key. |
| `NETWORK` | no | Chain selector: `fuji`, `mainnet`, `kitetestnet`, `anvil`, `custom` (default: `mainnet`) |
| `PCHAIN_TX_PRIVATE_KEY` | no | P-Chain private key for completing two-phase validator/delegator registrations and removals. If omitted, the keeper skips completions and logs a notice. |
| `VAULT_ADDRESS` | **yes** | StakingVault contract address (passed as positional arg via docker-compose) |
| `PK_COMPLETIONS` | no | Separate L1 private key for the completions container (defaults to `PK`) |
| `RPC_URL` | no | RPC URL for uptime queries during delegator registration completion. Auto-derived from chain config if omitted. |
| `UPTIME_BLOCKCHAIN_ID` | no | Blockchain ID (hex) for uptime proofs. Auto-read from staking manager storage if omitted. |

## Usage

### Docker Compose (recommended)

```bash
# .env
PK=0x...
NETWORK=kitetestnet
VAULT_ADDRESS=0x...
PCHAIN_TX_PRIVATE_KEY=0x...
# PK_COMPLETIONS=0x...  # optional: separate key for completions container
# RPC_URL=https://...    # optional: auto-derived from chain config
# UPTIME_BLOCKCHAIN_ID=0x...  # optional: auto-read from storage

docker compose up -d
```

This starts two containers:
- `keeper-core` — epoch processing, withdrawals, harvest, cleanup
- `keeper-completions` — registration and removal completions

### Direct

```bash
# Single run (all steps)
node dist/index.js run 0xVAULT_ADDRESS --harvest --pchain-tx-private-key 0x...

# Single run (core only, no completions)
node dist/index.js run 0xVAULT_ADDRESS --harvest --skip-completions

# Single run (completions only)
node dist/index.js run 0xVAULT_ADDRESS --completions-only --pchain-tx-private-key 0x...

# Long-running daemon (all steps)
node dist/index.js watch 0xVAULT_ADDRESS --pchain-tx-private-key 0x...

# Long-running daemon (core only)
node dist/index.js watch 0xVAULT_ADDRESS --skip-completions

# Long-running daemon (completions only)
node dist/index.js watch 0xVAULT_ADDRESS --completions-only --pchain-tx-private-key 0x...
```

### Commands

**`run <stakingVaultAddress>`** — single keeper pass

| Option | Default | Description |
|--------|---------|-------------|
| `--harvest` | off | Also run harvest this invocation |
| `--pchain-tx-private-key` | — | P-Chain key (env: `PCHAIN_TX_PRIVATE_KEY`) |
| `--skip-completions` | off | Skip P-Chain registration/removal completions |
| `--completions-only` | off | Only run completions (skip epoch, harvest, withdrawals, cleanup) |
| `--rpc-url` | auto | RPC URL for uptime queries (env: `RPC_URL`) |
| `--uptime-blockchain-id` | auto | Blockchain ID for uptime proofs (env: `UPTIME_BLOCKCHAIN_ID`) |

**`watch <stakingVaultAddress>`** — long-running daemon

| Option | Default | Description |
|--------|---------|-------------|
| `--poll-interval <seconds>` | 1800 | Seconds between ticks |
| `--harvest-interval <seconds>` | 43200 | Seconds between harvest calls |
| `--pchain-tx-private-key` | — | P-Chain key (env: `PCHAIN_TX_PRIVATE_KEY`) |
| `--skip-completions` | off | Skip P-Chain registration/removal completions |
| `--completions-only` | off | Only run completions (skip epoch, harvest, withdrawals, cleanup) |
| `--rpc-url` | auto | RPC URL for uptime queries (env: `RPC_URL`) |
| `--uptime-blockchain-id` | auto | Blockchain ID for uptime proofs (env: `UPTIME_BLOCKCHAIN_ID`) |

## Build

```bash
# from repo root
pnpm build && cd packages/keeper && pnpm build
```
