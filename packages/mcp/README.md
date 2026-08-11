# @suzaku-network/mcp

MCP server for the Suzaku restaking protocol on Avalanche — 125 full-profile tools wrapping `suzaku-cli`, including a 69-tool read-only surface.

Mainnet operator writes never auto-execute by default. Testnet writes run immediately unless `SUZAKU_MCP_SUGGEST=true` or `SUZAKU_MCP_REQUIRE_CONFIRM=true`.

**Scope note:** tool coverage spans every CLI domain, including KiteStakingManager (`kite_*`) and StakingVault (`staking_vault_*`). The composite `deployment_heartbeat`, rewards playbook, and production OpenClaw monitor are built for suzaku-core deployments such as Dexalot. Kite/StakingVault expose per-contract tools; the `validator-lifecycle` prompt guides both `manager=kite|vault`.

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
node packages/mcp/dist/server.js [--read-only]
```

## Server profiles

Start flags select which tools are registered:

| Flag | Tools | Use case |
|---|---|---|
| _(none)_ | 125 (69 read + 56 write) | Full-access operator |
| `--read-only` | 69 read only | Public/group bot — no write surface |

The retired `--propose-only` and `--public-write` flags fail closed. Proposer and public-cache write features are deferred to separate work.

## Playbooks

- **Discover network**: `discover_network` — returns all L1s, middlewares, operators, and linked addresses for a network (no address input needed).
- **Check operator health**: `check-operator-health` prompt — runs 5 read tools and summarizes operator status.
- **Register a new operator**: `register-new-operator` prompt — guides through registry, opt-ins, middleware registration, and node addition.
- **Register / remove a validator**: `validator-lifecycle` prompt — two-phase C-Chain + P-Chain lifecycle (needs `SUZAKU_PCHAIN_PK`); covers both `manager=kite|vault`.
- **Weekly epoch rewards (Dexalot)**: `epoch-rewards-runbook` prompt — 6-step workflow: report validator uptimes → compute operator uptime → diagnose rewards state (warns on set-amount accumulation) → set rewards → distribute → harvest the LST wrapper.
- **Monitor a deployment**: `deployment_heartbeat` — `mode=digest` (per-epoch changes, rewards activity, claimability table) or `mode=alerts` (non-OK findings only). Production invokes both at the twice-weekly epoch boundaries.
- **Monitor network state**: `middleware_network_overview` — operators, nodes, stakes, epoch config, and vault listing in one call.
- **Deposit into a vault**: `vault_deposit` — on mainnet returns the CLI command to run manually (suggest mode).

## Security

| Layer | What it does |
|---|---|
| Signer required | Blocks writes if no `SUZAKU_PK`, `SUZAKU_PK_FILE`, `SUZAKU_SECRET_NAME`, or `SUZAKU_MCP_LEDGER` set |
| Tool access control | `SUZAKU_MCP_DENY_TOOLS` / `SUZAKU_MCP_ALLOW_TOOLS` (deny wins) |
| Value limit | `SUZAKU_MCP_MAX_AVAX_PER_TX` caps per-transaction AVAX |
| Mainnet suggest mode | Writes return the CLI command instead of executing (default) |
| PK never on CLI args | Keys pass via child process env only; 64-char hex strings redacted from all output |
| Restricted child env | Ordinary subprocesses inherit only `PATH`, `HOME`, `NODE_ENV`, `PASSWORD_STORE_DIR`, `GNUPGHOME`, `SIG_AGG_URL`, and `LogLevel`; event scans additionally receive `ETHERSCAN_API_KEY` when configured. `PK` is injected for write operations; `SAFE_API_KEY` only for Safe-wired writes (when `SUZAKU_SAFE_ADDRESS` is set)—both read from the direct env or `_FILE` form at spawn time |
| Audit log | Every call logged to `~/.suzaku-cli/mcp-audit.log` |

### Mainnet vs testnet behavior

| Network | Default | `SUZAKU_MCP_SUGGEST=true` | `SUZAKU_MCP_SUGGEST=false` |
|---|---|---|---|
| mainnet | Suggest | Suggest | Confirm (elicitation) |
| testnet | Execute | Suggest | Execute |

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
| `SAFE_API_KEY` / `SAFE_API_KEY_FILE` | Safe transaction-service auth for mainnet Safe-wired writes, direct or file |
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
