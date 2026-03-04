# suzaku-keeper

Keeper bot for Suzaku StakingVault. Runs permissionless maintenance operations that keep the vault healthy.

## What it does

Each tick runs these steps in order:

1. **Process epoch** — calls `processEpoch()` in a loop until caught up
2. **Prepare withdrawals** — calls `prepareWithdrawals()` when pending withdrawals exist and liquid balance is insufficient
3. **Complete pending removals** — scans for initiated validator/delegator removals and completes them on P-Chain _(requires P-Chain key)_
4. **Harvest** — calls `harvest()` on a configurable interval to realize rewards
5. **Queue head cleanup** — claims fulfilled withdrawals blocking the queue head (`claimWithdrawalsFor`)
6. **Protocol fee warning** — logs a warning if escrowed protocol fees exist (claiming requires `VAULT_ADMIN_ROLE`)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PK` | **yes** | Private key (hex) for signing transactions on the L1 where the StakingVault is deployed (e.g. Kite L1). This is **not** a C-Chain key. |
| `NETWORK` | no | Chain selector: `fuji`, `mainnet`, `kitetestnet`, `anvil`, `custom` (default: `mainnet`) |
| `PCHAIN_TX_PRIVATE_KEY` | no | P-Chain private key for completing two-phase validator/delegator removals. If omitted, the keeper skips removal completions and logs a notice. Everything else runs normally. |
| `VAULT_ADDRESS` | **yes** | StakingVault contract address (passed as positional arg via docker-compose) |

## Usage

### Docker Compose (recommended)

```bash
# .env
PK=0x...
NETWORK=kitetestnet
VAULT_ADDRESS=0x...
# PCHAIN_TX_PRIVATE_KEY=0x...  # optional

docker compose up -d
```

### Direct

```bash
# Single run
node dist/index.js run 0xVAULT_ADDRESS

# Long-running daemon
node dist/index.js watch 0xVAULT_ADDRESS --poll-interval 1800 --harvest-interval 43200
```

### Commands

**`run <stakingVaultAddress>`** — single keeper pass

| Option | Default | Description |
|--------|---------|-------------|
| `--harvest` | off | Also run harvest this invocation |
| `--pchain-tx-private-key` | — | P-Chain key (env: `PCHAIN_TX_PRIVATE_KEY`) |
| `--skip-completions` | off | Skip P-Chain removal completions even if key is provided |

**`watch <stakingVaultAddress>`** — long-running daemon

| Option | Default | Description |
|--------|---------|-------------|
| `--poll-interval <seconds>` | 1800 | Seconds between ticks |
| `--harvest-interval <seconds>` | 43200 | Seconds between harvest calls |
| `--pchain-tx-private-key` | — | P-Chain key (env: `PCHAIN_TX_PRIVATE_KEY`) |

## Build

```bash
# from repo root
pnpm build && cd packages/keeper && pnpm build
```
