# @suzaku-network/mcp

MCP server for the Suzaku restaking protocol on Avalanche — 127 full-profile tools wrapping `suzaku-cli`, plus one profile-only public cache tool.

Mainnet operator writes never auto-execute by default. Testnet writes run immediately (unless `SUZAKU_MCP_SUGGEST=true` or `SUZAKU_MCP_REQUIRE_CONFIRM=true`). The two Safe propose tools (`rewards_set_amount_propose`, `rewards_distribute_propose`) always queue an off-chain Safe proposal regardless of network — they never execute a transaction. The `--public-write` profile is the only intentional mainnet execution path: it exposes exactly `middleware_cache_stakes`, which broadcasts the permissionless `calcAndCacheStakes` cache transaction for one pinned middleware.

**Scope note:** tool coverage spans every CLI domain, including KiteStakingManager (`kite_*`) and StakingVault (`staking_vault_*`). The composite layer — `deployment_heartbeat`, the `epoch-rewards-runbook` playbook, the Safe propose tools, and the OpenClaw bot deploys — is built for suzaku-core restaking deployments (e.g. Dexalot) and watches the suzaku-core contracts (L1Middleware, Rewards, LSTWrapper, UptimeTracker). The Kite/StakingVault domains expose raw per-contract tools only — no heartbeat checks or rewards playbooks for them (the `validator-lifecycle` prompt is the one exception: it guides both `manager=kite|vault`).

## Setup

**From source** (the package is not yet published to npm):

```bash
git clone https://github.com/suzaku-network/suzaku-cli
cd suzaku-cli
pnpm install          # builds the CLI and this package (prepare script)
```

Add to your MCP client config (e.g. `claude_desktop_config.json`) with the **absolute** path to the built server:

```json
{
  "mcpServers": {
    "suzaku": {
      "command": "node",
      "args": ["/absolute/path/to/suzaku-cli/packages/mcp/dist/server.js"]
    }
  }
}
```

Once published, `npm install -g @suzaku-network/mcp` will provide a `suzaku-mcp` binary usable directly as the `command`.

This gives you all 69 read tools immediately. Add a signing method (see [Example configs](#example-configs)) when you need writes.

To run the server by hand (it speaks MCP over stdio — it will sit silently waiting for a client):

```bash
node packages/mcp/dist/server.js [--read-only | --propose-only | --public-write]
```

## Server profiles

Start flags select which tools are registered:

| Flag | Tools | Use case |
|---|---|---|
| _(none)_ | 127 (69 read + 58 write) | Full-access operator |
| `--read-only` | 69 read only | Public/group bot — no write surface |
| `--propose-only` | 71 (69 read + the 2 Safe propose tools) | DM-only propose bot — queues rewards proposals, no direct writes |
| `--public-write` | 70 (69 read + `middleware_cache_stakes`) | Group cache bot — executes one permissionless stake-cache write for a pinned middleware |

The three profile flags are mutually exclusive. `--propose-only` requires `SUZAKU_MAX_REWARDS_AMOUNT` to be set at startup (the server exits if it is unset or ≤ 0). `--public-write` requires a signer and `SUZAKU_MIDDLEWARE_ADDRESS`; `SUZAKU_MIDDLEWARE_NETWORK` defaults to `mainnet` and cannot be `custom`.

## Playbooks

- **Discover network**: `discover_network` — returns all L1s, middlewares, operators, and linked addresses for a network (no address input needed).
- **Check operator health**: `check-operator-health` prompt — runs 5 read tools and summarizes operator status.
- **Register a new operator**: `register-new-operator` prompt — guides through registry, opt-ins, middleware registration, and node addition.
- **Register / remove a validator**: `validator-lifecycle` prompt — two-phase C-Chain + P-Chain lifecycle (needs `SUZAKU_PCHAIN_PK`); covers both `manager=kite|vault`.
- **Weekly epoch rewards (Dexalot)**: `epoch-rewards-runbook` prompt — 6-step workflow: report validator uptimes → compute operator uptime → diagnose rewards state (warns on set-amount accumulation) → set rewards → distribute → harvest the LST wrapper.
- **Monitor a deployment**: `deployment_heartbeat` — `mode=digest` (per-epoch changes, rewards activity, claimability table) or `mode=alerts` (4-hourly checks, quiet unless something trips).
- **Monitor network state**: `middleware_network_overview` — operators, nodes, stakes, epoch config, and vault listing in one call.
- **Deposit into a vault**: `vault_deposit` — on mainnet returns the CLI command to run manually (suggest mode).
- **Propose weekly rewards (mainnet, Safe)**: `rewards_set_amount_propose` / `rewards_distribute_propose` — queue an off-chain Safe proposal for owners to review and sign. Requires `SUZAKU_SAFE_ADDRESS` and a Safe **delegate** key.
- **Cache missing stake class (mainnet, public cache bot)**: `middleware_cache_stakes` — reads `cacheByClass[class]`, skips if already cached, and otherwise broadcasts `middleware calc-operator-cache <middleware> <epoch> <class> --public-call` for the pinned middleware/network.

## Security

| Layer | What it does |
|---|---|
| Signer required | Blocks writes if no `SUZAKU_PK`, `SUZAKU_PK_FILE`, `SUZAKU_SECRET_NAME`, or `SUZAKU_MCP_LEDGER` set |
| Tool access control | `SUZAKU_MCP_DENY_TOOLS` / `SUZAKU_MCP_ALLOW_TOOLS` (deny wins) |
| Value limit | `SUZAKU_MCP_MAX_AVAX_PER_TX` caps per-transaction AVAX |
| Mainnet suggest mode | Writes return the CLI command instead of executing (default) |
| Public-cache execution path | `--public-write` suppresses the normal write surface and exposes only `middleware_cache_stakes`; the tool rejects unpinned middleware/network/rpcUrl and calls a CLI exact-args wrapper |
| PK never on CLI args | Keys pass via child process env only; 64-char hex strings redacted from all output |
| Restricted child env | Subprocess inherits only `PATH`, `HOME`, `NODE_ENV`, `PASSWORD_STORE_DIR`, `GNUPGHOME`, `SIG_AGG_URL`, `LogLevel`, `SNOWSCAN_API_KEY`. `PK` is injected for write operations; `SAFE_API_KEY` only for Safe-wired writes (when `SUZAKU_SAFE_ADDRESS` is set) — both read from the direct env or the `_FILE` form at spawn time |
| Audit log | Every call logged to `~/.suzaku-cli/mcp-audit.log` |

### Mainnet vs testnet behavior

| Network | Default | `SUZAKU_MCP_SUGGEST=true` | `SUZAKU_MCP_SUGGEST=false` |
|---|---|---|---|
| mainnet | Suggest | Suggest | Confirm (elicitation) |
| testnet | Execute | Suggest | Execute |

The Safe propose tools bypass this matrix entirely — they always queue an off-chain proposal (the human signature in the Safe UI is the execution gate). The public cache tool also bypasses suggest mode, but only in `--public-write`: it broadcasts a real transaction through an exact command wrapper and the CLI `--public-call` guard.

### Safe propose tools

`rewards_set_amount_propose` and `rewards_distribute_propose` never execute; they queue a Safe proposal. They require `SUZAKU_SAFE_ADDRESS` and a Safe **delegate** key (`SUZAKU_PK`/`SUZAKU_PK_FILE`) — the CLI refuses Safe owner keys for this flow. `rewards_set_amount_propose` hard-refuses if the epoch already has rewards set, has set-amount events (accumulation guard), is outside the settable window, is at or above `SUZAKU_MAX_REWARDS_AMOUNT` (or the cap is unset), or a matching proposal is already pending. `rewards_distribute_propose` refuses if the epoch has no rewards set, returns early if distribution is complete, and refuses a duplicate pending proposal. The pending-proposal checks need the Safe API reachable and authenticated — they **fail open** with a warning on API errors (the CLI's exact-hash dedup and the human signature in the Safe UI remain the hard gates).

### Public cache tool

`middleware_cache_stakes` is registered only in `--public-write`. It is for a separate cache bot, not the read-only monitor. The tool requires a signer, `SUZAKU_MIDDLEWARE_ADDRESS`, and the pinned non-custom network (`SUZAKU_MIDDLEWARE_NETWORK`, default `mainnet`). It rejects custom `rpcUrl`, refuses middleware/network mismatches, fresh-reads `middleware get-cache-status --epoch <epoch>` with dedup disabled, checks `cacheByClass[collateralClass]`, and only then executes `middleware calc-operator-cache <middleware> <epoch> <class> --public-call`. The key should be fresh, role-less, and funded with only enough AVAX to be the spam ceiling.

### Signing methods (priority order)

1. **Ledger** — `SUZAKU_MCP_LEDGER=true`
2. **GPG keystore** — `SUZAKU_SECRET_NAME=my-key`
3. **Raw private key** — `SUZAKU_PK=0x...` or `SUZAKU_PK_FILE=/run/secrets/pk` (file-secret form; preferred for Docker deployments)

Add `SUZAKU_SAFE_ADDRESS` for Safe multisig overlay (works with any method).

## Example configs

The examples use the published-binary form (`"command": "suzaku-mcp"`); for a source install substitute `"command": "node", "args": ["/absolute/path/.../packages/mcp/dist/server.js"]` as shown in Setup.

**Testnet dev (raw key is fine here):**
```json
{
  "mcpServers": {
    "suzaku": {
      "command": "suzaku-mcp",
      "env": { "SUZAKU_PK": "0x..." }
    }
  }
}
```

**Mainnet with Safe + spend limit (use keystore or Ledger):**
```json
{
  "mcpServers": {
    "suzaku": {
      "command": "suzaku-mcp",
      "env": {
        "SUZAKU_SECRET_NAME": "operator-key",
        "SUZAKU_SAFE_ADDRESS": "0x1234...",
        "SUZAKU_MCP_MAX_AVAX_PER_TX": "100"
      }
    }
  }
}
```

## Environment variables

| Variable | Purpose |
|---|---|
| `SUZAKU_PK` | EVM private key (hex) |
| `SUZAKU_PK_FILE` | Path to a file holding the EVM key (Docker/compose file secret). Read at spawn time; preferred over `SUZAKU_PK` |
| `SUZAKU_SECRET_NAME` | GPG keystore secret name |
| `SUZAKU_MCP_LEDGER` | `true` for Ledger hardware wallet |
| `SUZAKU_PCHAIN_PK` / `SUZAKU_PCHAIN_PK_FILE` | P-Chain key for two-phase ops (direct or file) |
| `SUZAKU_SAFE_ADDRESS` | Safe multisig address |
| `SAFE_API_KEY` / `SAFE_API_KEY_FILE` | Safe transaction-service auth (mainnet), direct or file — needed by the propose tools |
| `SUZAKU_REWARDS_ADDRESS` | Default rewards contract for the propose tools |
| `SUZAKU_MIDDLEWARE_ADDRESS` | Default middleware for the propose tools' epoch-window check |
| `SUZAKU_MIDDLEWARE_NETWORK` | Pinned non-custom network for `--public-write` cache calls (default `mainnet`) |
| `SUZAKU_CACHE_KEY_ADDRESS` | Optional address monitored by `deployment_heartbeat` for cache-key C-Chain AVAX balance |
| `SUZAKU_CACHE_KEY_MIN_AVAX` | Optional low-balance threshold for the cache key (default 0.05 AVAX when address is set) |
| `SUZAKU_MAX_REWARDS_AMOUNT` | Upper bound (human units) for `rewards_set_amount_propose`; **required at startup under `--propose-only`** |
| `SUZAKU_MCP_SUGGEST` | `true`/`false` — override suggest mode |
| `SUZAKU_MCP_REQUIRE_CONFIRM` | `true` — elicitation for testnet writes |
| `SUZAKU_MCP_MAX_AVAX_PER_TX` | Max AVAX per tx |
| `SUZAKU_MCP_ALLOW_TOOLS` | Comma-separated tool allowlist |
| `SUZAKU_MCP_DENY_TOOLS` | Comma-separated tool denylist |
| `SUZAKU_MCP_DRY_RUN` | `true` for dry-run mode |
| `SUZAKU_CLI_PATH` | Override CLI binary path |
| `SUZAKU_MCP_DEDUP_WINDOW_MS` | Dedup window for read calls (default 60000 ms; writes always bypass) |
| `SUZAKU_MCP_DEBUG` | Forward subprocess stderr |
| `SUZAKU_MCP_WAIT` | Append `--wait <n>` to every CLI call (e.g. `1` for instant-mining forks/anvil) |
| `SUZAKU_MCP_MAX_CONCURRENT` | Max parallel CLI subprocesses (default 10; excess calls are rejected) |
| `SUZAKU_MCP_RATE_MAX_CALLS` / `SUZAKU_MCP_RATE_WINDOW_MS` | Rate limit: max calls per sliding window (defaults 60 per 60000 ms) |
| `SUZAKU_MCP_MAX_OPERATORS` | Cap on operators processed by composite middleware tools (default 50) |
| `SUZAKU_MCP_AUDIT_DIR` | Override audit log directory (useful for Docker volume mounts) |
| `SUZAKU_MCP_AUDIT_MAX_MB` | Audit log rotation size (default 50 MB; keeps max 2 files) |
| `SUZAKU_MCP_PUBLIC_HEALTH` | `true` hides signer type, Safe address, and guard config from `health_check` |

## Build

```bash
pnpm build        # tsc + chmod +x
pnpm test         # vitest
```

## License

[BUSL-1.1](../../LICENSE)
