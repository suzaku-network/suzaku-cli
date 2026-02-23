# @suzaku-network/mcp

MCP server for the Suzaku restaking protocol on Avalanche — 83 tools wrapping `suzaku-cli`.

Mainnet writes never auto-execute. Testnet writes run immediately.

## Setup

```bash
npm install -g @suzaku-network/mcp
```

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "suzaku": {
      "command": "suzaku-mcp"
    }
  }
}
```

This gives you all 34 read tools immediately. Add a signing method (see [Example configs](#example-configs)) when you need writes.

## Playbooks

### Check operator health

> "Check the health of operator 0xABC on middleware 0xDEF on fuji"

Uses `check-operator-health` prompt — runs 5 read tools (epoch, account info, locked/available stake, active nodes) and summarizes.

### Register a new operator

> "Register a new operator on fuji"

Uses `register-new-operator` prompt — guides through 5 steps:
1. Register in OperatorRegistry
2. Opt into L1
3. Opt into vault
4. Register in L1Middleware
5. Add validator nodes

### Register / remove a validator (two-phase)

> "Register a validator on my staking vault on fuji"

Uses `validator-lifecycle` prompt. Two phases:
1. **Initiate** — C-Chain transaction
2. **Complete** — cross-chain warp message to P-Chain (needs `SUZAKU_PCHAIN_PK`, takes up to 5 min)

### Monitor network state

> "Show me the network overview for middleware 0xDEF on fuji"

Calls `middleware_network_overview` — returns operators, nodes, stakes, and epoch status in one shot.

### Deposit into a vault

> "Deposit 100 AVAX into vault 0xABC on fuji"

Calls `vault_deposit`. On mainnet this returns the CLI command to run manually (suggest mode).

## Security

| Layer | What it does |
|---|---|
| Signer required | Blocks writes if no `SUZAKU_PK`, `SUZAKU_SECRET_NAME`, or `SUZAKU_MCP_LEDGER` set |
| Tool access control | `SUZAKU_MCP_DENY_TOOLS` / `SUZAKU_MCP_ALLOW_TOOLS` (deny wins) |
| Value limit | `SUZAKU_MCP_MAX_AVAX_PER_TX` caps per-transaction AVAX |
| Mainnet suggest mode | Writes return the CLI command instead of executing (default) |
| PK never on CLI args | Keys pass via child process env only; 64-char hex strings redacted from all output |
| Restricted child env | Subprocess inherits only `PATH`, `HOME`, `NODE_ENV`, `PASSWORD_STORE_DIR`, `GNUPGHOME`, `SIG_AGG_URL`, `LogLevel`, `SNOWSCAN_API_KEY` |
| Audit log | Every call logged to `~/.suzaku-cli/mcp-audit.log` |

### Mainnet vs testnet behavior

| Network | Default | `SUZAKU_MCP_SUGGEST=true` | `SUZAKU_MCP_SUGGEST=false` |
|---|---|---|---|
| mainnet | Suggest | Suggest | Confirm (elicitation) |
| testnet | Execute | Suggest | Execute |

### Signing methods (priority order)

1. **Ledger** — `SUZAKU_MCP_LEDGER=true`
2. **GPG keystore** — `SUZAKU_SECRET_NAME=my-key`
3. **Raw private key** — `SUZAKU_PK=0x...`

Add `SUZAKU_SAFE_ADDRESS` for Safe multisig overlay (works with any method).

## Example configs

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
| `SUZAKU_SECRET_NAME` | GPG keystore secret name |
| `SUZAKU_MCP_LEDGER` | `true` for Ledger hardware wallet |
| `SUZAKU_PCHAIN_PK` | P-Chain key for two-phase ops |
| `SUZAKU_SAFE_ADDRESS` | Safe multisig address |
| `SUZAKU_MCP_SUGGEST` | `true`/`false` — override suggest mode |
| `SUZAKU_MCP_REQUIRE_CONFIRM` | `true` — elicitation for testnet writes |
| `SUZAKU_MCP_MAX_AVAX_PER_TX` | Max AVAX per tx |
| `SUZAKU_MCP_ALLOW_TOOLS` | Comma-separated tool allowlist |
| `SUZAKU_MCP_DENY_TOOLS` | Comma-separated tool denylist |
| `SUZAKU_MCP_DRY_RUN` | `true` for dry-run mode |
| `SUZAKU_CLI_PATH` | Override CLI binary path |
| `SUZAKU_MCP_DEDUP_WINDOW_MS` | Dedup window (default 60000 ms) |
| `SUZAKU_MCP_DEBUG` | Forward subprocess stderr |

## Build

```bash
pnpm build        # tsc + chmod +x
pnpm test         # vitest
```

## License

[BUSL-1.1](../../LICENSE)
