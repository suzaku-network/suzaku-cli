# @suzaku-network/mcp

MCP server for the Suzaku restaking protocol on Avalanche. Exposes 83 tools (34 read, 49 write) that wrap the `suzaku-cli` command-line interface, with a mainnet-safe-by-default security model.

> **Note:**
>
> Write operations on mainnet never auto-execute. The server defaults to suggest mode, returning the CLI command for manual execution.

---

## Requirements

- Node.js >= 18
- `suzaku-cli` — installed globally or available as a workspace dependency

---

## Quick Start

### Install from npm

```bash
npm install -g @suzaku-network/mcp
```

### Configure in Claude Desktop

Add the server to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "suzaku": {
      "command": "suzaku-mcp",
      "env": {
        "SUZAKU_PK": "0x...",
        "SUZAKU_MCP_SUGGEST": "true"
      }
    }
  }
}
```

### Run with npx (no install)

```bash
npx @suzaku-network/mcp
```

### Run from repository

```bash
cd packages/mcp
pnpm build
node dist/server.js
```

### Verify setup

Use the `health_check` tool in your MCP client. It reports CLI reachability, signing method, guard configuration, and optional network connectivity.

---

## Safety Model

Five layers, checked in order for every write operation:

| # | Guard | What it does |
|---|---|---|
| 1 | `requireSigner()` | Blocks if no signing method configured |
| 2 | `checkToolAccess()` | Checks `SUZAKU_MCP_DENY_TOOLS` then `SUZAKU_MCP_ALLOW_TOOLS`; deny wins |
| 3 | `checkValueLimit()` | Rejects if amount exceeds `SUZAKU_MCP_MAX_AVAX_PER_TX` |
| 4 | `confirmWriteOperation()` | On testnet with `SUZAKU_MCP_REQUIRE_CONFIRM=true`: MCP elicitation dialog |
| 5 | Suggest/confirm matrix | Network-aware execution control (see below) |

### Suggest / Confirm Matrix

Only applies to write operations:

| Network | `SUZAKU_MCP_SUGGEST` | Behavior |
|---|---|---|
| mainnet | unset (default) | **Suggest** — returns command string, does NOT execute |
| mainnet | `'true'` | **Suggest** — returns command string, does NOT execute |
| mainnet | `'false'` | **Confirm** — elicits human approval before executing |
| testnet | unset (default) | **Execute** — spawns subprocess directly |
| testnet | `'true'` | **Suggest** — returns command string, does NOT execute |
| testnet | `'false'` | **Execute** — spawns subprocess directly |

Testnet networks: `fuji`, `anvil`, `kitetestnet`. Omitting the `network` parameter defaults to `mainnet`.

### Key Invariants

- **No PK on command line** — Private keys pass only via child process environment variables (`PK`, `PK_PCHAIN`). `sanitizeOutput()` redacts any 64-character hex string from all outputs.
- **Restricted child env** — Subprocess inherits only 8 allowlisted variables: `PATH`, `HOME`, `NODE_ENV`, `PASSWORD_STORE_DIR`, `GNUPGHOME`, `SIG_AGG_URL`, `LogLevel`, `SNOWSCAN_API_KEY`.
- **Dedup cache** — Identical calls within the dedup window (default 60 s) return cached results with a `_dedup_warning` field.
- **Audit log** — Best-effort append to `~/.suzaku-cli/mcp-audit.log` (non-blocking, silently ignores failures).

---

## Environment Variables

### Signing

| Variable | Purpose | Default |
|---|---|---|
| `SUZAKU_PK` | Raw EVM private key (hex). Injected as `PK` in child env — never on CLI args | — |
| `SUZAKU_SECRET_NAME` | GPG keystore secret name. Passed as `--secret-name` flag | — |
| `SUZAKU_MCP_LEDGER` | `'true'` to use hardware Ledger. Extends timeout to 180 s | — |
| `SUZAKU_PCHAIN_PK` | P-Chain key for cross-chain warp ops. Injected as `PK_PCHAIN` in child env | — |
| `SUZAKU_SAFE_ADDRESS` | Safe multisig overlay. Appends `--safe <address>` to CLI args | — |

### Safety / Guard

| Variable | Purpose | Default |
|---|---|---|
| `SUZAKU_MCP_SUGGEST` | `'true'` = always suggest; `'false'` = disable suggest. See matrix above | unset (mainnet=suggest, testnet=execute) |
| `SUZAKU_MCP_REQUIRE_CONFIRM` | `'true'` = require MCP elicitation for testnet writes | — |
| `SUZAKU_MCP_MAX_AVAX_PER_TX` | Max AVAX per transaction (float). Blocks writes exceeding this | — (no limit) |
| `SUZAKU_MCP_ALLOW_TOOLS` | Comma-separated allowlist of tool names | — (all allowed) |
| `SUZAKU_MCP_DENY_TOOLS` | Comma-separated denylist of tool names (checked before allow) | — (none denied) |
| `SUZAKU_MCP_DRY_RUN` | `'true'` appends `--cast` for dry-run/simulate mode | — |

### Operational

| Variable | Purpose | Default |
|---|---|---|
| `SUZAKU_CLI_PATH` | Override CLI binary path. Falls back to relative path, then npm dependency, then `which suzaku-cli` | — |
| `SUZAKU_MCP_DEDUP_WINDOW_MS` | Dedup window in milliseconds. Identical calls within window return cached result | `60000` |
| `SUZAKU_MCP_DEBUG` | Forwards subprocess stderr to server stderr in real time | — |

---

## Tool Catalog

83 tools across 10 groups (+ 1 health check):

| Group | Read | Write | Key tools |
|---|---|---|---|
| `middleware` | 14 | 4 | `middleware_get_all_operators`, `middleware_operator_dashboard`, `middleware_network_overview`, `middleware_register_operator`, `middleware_add_node`, `middleware_weight_watcher` |
| `vault` | 5 | 3 | `vault_get_balance`, `vault_deposit`, `vault_withdraw`, `vault_claim` |
| `operator` | 1 | 1 | `operator_registry_get_all`, `operator_registry_register` |
| `l1-registry` | 1 | 1 | `l1_registry_get_all`, `l1_registry_register` |
| `opt-in` | 0 | 4 | `opt_in_l1`, `opt_out_l1`, `opt_in_vault`, `opt_out_vault` |
| `rewards` | 1 | 2 | `rewards_get_epoch_rewards`, `rewards_distribute`, `rewards_claim` |
| `kite-staking` | 0 | 9 | `kite_initiate_validator_registration`, `kite_complete_validator_registration`, `kite_update_staking_config` |
| `staking-vault` | 8 | 14 | `staking_vault_info`, `staking_vault_full_info`, `staking_vault_deposit`, `staking_vault_process_epoch` |
| `balancer` | 3 | 5 | `balancer_get_security_modules`, `balancer_get_validator_status`, `balancer_set_up_security_module`, `balancer_transfer_l1_ownership` |
| `poa-security-module` | 0 | 6 | `poa_add_node`, `poa_complete_validator_registration`, `poa_remove_node`, `poa_complete_validator_removal` |
| `server` | 1 | 0 | `health_check` |

Use `list tools` in your MCP client to see full schemas for all tools.

---

## Prompts & Resources

### Prompts

- **`check-operator-health`** — Run 5 read tools to assess operator health (stake, active nodes, epoch status). Params: `middlewareAddress`, `operatorAddress`, `network?`.
- **`register-new-operator`** — Step-by-step 5-phase operator registration workflow. Params: `network?`.
- **`validator-lifecycle`** — Two-phase validator/delegator registration or removal guide. Params: `operation` (`register` | `remove`), `manager?` (`kite` | `vault`).

### Resources

- **`config://networks`** — Supported networks and their RPC endpoints (mainnet, fuji, anvil, kitetestnet).
- **`config://contracts`** — Note that addresses are deployment-specific; directs to registry tools for live discovery.

---

## Signing Methods

Priority order (first match wins):

1. **Ledger** (`SUZAKU_MCP_LEDGER=true`) — adds `--ledger` flag, extends timeout to 180 s
2. **GPG keystore** (`SUZAKU_SECRET_NAME`) — adds `--secret-name <value>` flag
3. **Raw private key** (`SUZAKU_PK`) — injected as `PK` env var, never on command line

**Safe multisig overlay** works independently of the signing method. Set `SUZAKU_SAFE_ADDRESS` to append `--safe <address>` to all write commands. The audit log records the composite method (e.g. `SUZAKU_PK+SUZAKU_SAFE_ADDRESS`).

### Example configurations

**Testnet with raw key (auto-execute):**

```json
{
  "mcpServers": {
    "suzaku": {
      "command": "suzaku-mcp",
      "env": {
        "SUZAKU_PK": "0x..."
      }
    }
  }
}
```

**Mainnet with GPG keystore + Safe (suggest mode):**

```json
{
  "mcpServers": {
    "suzaku": {
      "command": "suzaku-mcp",
      "env": {
        "SUZAKU_SECRET_NAME": "my-operator-key",
        "SUZAKU_SAFE_ADDRESS": "0x1234...",
        "SUZAKU_MCP_MAX_AVAX_PER_TX": "100"
      }
    }
  }
}
```

**Mainnet with confirmation instead of suggest:**

```json
{
  "mcpServers": {
    "suzaku": {
      "command": "suzaku-mcp",
      "env": {
        "SUZAKU_PK": "0x...",
        "SUZAKU_MCP_SUGGEST": "false"
      }
    }
  }
}
```

---

## Two-Phase Operations

> **Note:**
>
> Some validator and delegator lifecycle operations (register, remove) require two phases: an initiate step on the C-Chain followed by a complete step that involves a cross-chain warp message to the P-Chain.

The `complete_*` tools require:

- **`SUZAKU_PCHAIN_PK`** — P-Chain private key, injected as `PK_PCHAIN` in the child env
- **5-minute timeout** — warp signature aggregation can take several minutes

Use the `validator-lifecycle` prompt to get a guided walkthrough of the two-phase process.

---

## Adding a Tool

### Read tool

```typescript
server.tool(
  'my_read_tool',
  'Description of what this reads',
  { network: Network, address: Address },
  { readOnlyHint: true },
  async ({ network, address }) => {
    const result = await runCli(
      ['my-command', 'sub-command', '--address', address, '--network', network],
      {},
    );
    return formatResult(result);
  },
);
```

### Write tool

```typescript
server.tool(
  'my_write_tool',
  'Description of what this writes',
  { network: Network, address: Address, amount: z.string().describe('Amount in AVAX') },
  { destructiveHint: true },
  async ({ network, address, amount }) => {
    const pkErr = requireSigner();
    if (pkErr) return pkErr;

    const guardErr = await guardWriteOperation('my_write_tool', { network, amount }, 'amount');
    if (guardErr) return formatGuardError(guardErr);

    const result = await runCli(
      ['my-command', 'write-sub', '--address', address, '--amount', amount, '--network', network],
      { privateKey: true },
    );
    return formatResult(result);
  },
);
```

For cross-chain warp tools, add `pchainPrivateKey: true` and `timeout: 300_000` to the `runCli` options. See existing tool files in `src/tools/` for patterns.

---

## Build & Test

```bash
cd packages/mcp
pnpm build          # tsc + chmod +x dist/server.js
pnpm dev            # tsc --watch
pnpm test           # vitest run
npx tsc --noEmit    # type-check only
```

Start the server: `node dist/server.js` (stdio transport).

---

## License

[BUSL-1.1](../../LICENSE)
