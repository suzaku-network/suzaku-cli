# @suzaku/mcp

MCP server exposing 85 tools for the Suzaku protocol (Avalanche restaking) — with a mainnet-safe-by-default security model.

## Architecture

```
src/
├── server.ts            # Entry point: creates McpServer, registers tools/resources/prompts, starts stdio transport
├── cli-runner.ts        # Subprocess engine: resolves CLI path, builds restricted env, applies signing + suggest/confirm matrix, spawns child process, dedup cache, audit log
├── guard.ts             # Security middleware: tool access control, value limits, write confirmation via elicitation
├── schemas.ts           # Shared Zod schemas: Address, Hex, NodeID, Network (default 'mainnet'), RpcUrl
├── tools/
│   ├── middleware.ts    # 20 tools — L1Middleware contract (16 read: 9 atomic + 7 composite, 4 write)
│   ├── vault.ts         # 8 tools — Symbiotic vault (5 read, 3 write)
│   ├── operator.ts      # 2 tools — OperatorRegistry (1 read, 1 write)
│   ├── l1-registry.ts   # 2 tools — L1Registry (1 read, 1 write)
│   ├── opt-in.ts        # 4 tools — operator opt-in/out (all write)
│   ├── rewards.ts       # 3 tools — Rewards contract (1 read, 2 write)
│   ├── kite-staking.ts  # 9 tools — KiteStakingManager (all write, two-phase lifecycle)
│   ├── staking-vault.ts # 22 tools — StakingVault (8 read, 14 write, two-phase lifecycle)
│   ├── balancer.ts      # 8 tools — BalancerValidatorManager (3 read, 5 write)
│   └── poa-security-module.ts # 6 tools — PoASecurityModule (all write, two-phase lifecycle)
```

**Data flow** (write tool):

```
MCP client → server.ts (tool handler)
  → requireSigner()            [cli-runner.ts]  fail-fast if no signing method
  → guardWriteOperation()      [guard.ts]       access list → value limit → elicitation confirm
  → runCli(args, opts)         [cli-runner.ts]  suggest/confirm matrix → spawn child
    → subprocess: node CLI_PATH args --json --yes
    → stdout JSON captured, stderr buffered
    → output sanitized (PK redacted), cached, audit-logged
  → formatResult() → MCP response
```

Read tools skip `requireSigner()` and `guardWriteOperation()` — they always execute immediately.

## Safety Model

Five layers, checked in order for every write operation:

| # | Guard | Location | What it does |
|---|---|---|---|
| 1 | `requireSigner()` | `cli-runner.ts` | Blocks if no signing method configured (`SUZAKU_PK`, `SUZAKU_SECRET_NAME`, or `SUZAKU_MCP_LEDGER`) |
| 2 | `checkToolAccess()` | `guard.ts` | Checks `SUZAKU_MCP_DENY_TOOLS` then `SUZAKU_MCP_ALLOW_TOOLS`; deny wins |
| 3 | `checkValueLimit()` | `guard.ts` | Rejects if amount exceeds `SUZAKU_MCP_MAX_AVAX_PER_TX` |
| 4 | `confirmWriteOperation()` | `guard.ts` | On testnet with `SUZAKU_MCP_REQUIRE_CONFIRM=true`: MCP elicitation dialog |
| 5 | suggest/confirm matrix | `cli-runner.ts` | Network-aware execution control (see next section) |

Layers 2–4 are orchestrated by `guardWriteOperation(toolName, params, amountField?)`.

## Network-Aware Decision Matrix

Only applies to write tools (where `options.privateKey === true`):

| Network | `SUZAKU_MCP_SUGGEST` | Behavior |
|---|---|---|
| mainnet | unset (default) | **Suggest** — returns command string, does NOT execute |
| mainnet | `'true'` | **Suggest** — returns command string, does NOT execute |
| mainnet | `'false'` | **Confirm** — elicits human approval; blocks if client lacks elicitation |
| testnet | unset (default) | **Execute** — spawns subprocess directly |
| testnet | `'true'` | **Suggest** — returns command string, does NOT execute |
| testnet | `'false'` | **Execute** — spawns subprocess directly |

Formula: `shouldSuggest = suggestEnv === 'true' || (suggestEnv !== 'false' && !isTestnet)`

Testnet networks: `fuji`, `anvil`, `kitetestnet`. The `Network` schema defaults to `'mainnet'` when omitted.

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
| `SUZAKU_MCP_SUGGEST` | `'true'`=always suggest; `'false'`=disable suggest. See matrix above | unset (mainnet=suggest, testnet=execute) |
| `SUZAKU_MCP_REQUIRE_CONFIRM` | `'true'`=require MCP elicitation for testnet writes | — |
| `SUZAKU_MCP_MAX_AVAX_PER_TX` | Max AVAX per tx (float). Blocks writes exceeding this | — (no limit) |
| `SUZAKU_MCP_ALLOW_TOOLS` | Comma-separated allowlist of tool names | — (all allowed) |
| `SUZAKU_MCP_DENY_TOOLS` | Comma-separated denylist of tool names (checked before allow) | — (none denied) |
| `SUZAKU_MCP_DRY_RUN` | `'true'` appends `--cast` for dry-run/simulate mode | — |

### Operational

| Variable | Purpose | Default |
|---|---|---|
| `SUZAKU_CLI_PATH` | Override CLI binary path. Falls back to `../../../bin/cli.js` then `which suzaku-cli` | — |
| `SUZAKU_MCP_DEDUP_WINDOW_MS` | Dedup window (ms). Identical calls within window return cached result | `60000` |
| `SUZAKU_MCP_DEBUG` | Forwards subprocess stderr to server stderr in real time (server-side only — not passed to child process) | — |

### Child Process Env (allowlist)

Only these variables propagate to the subprocess: `PATH`, `HOME`, `NODE_ENV`, `PASSWORD_STORE_DIR`, `GNUPGHOME`, `SIG_AGG_URL`, `LogLevel`, `SNOWSCAN_API_KEY`.

## Tool Catalog

85 tools total (36 read, 49 write):

| File | R | W | Key tools |
|---|---|---|---|
| `middleware.ts` | 16 | 4 | `discover_network`, `middleware_get_linked_addresses`, `middleware_get_all_operators`, `middleware_operator_dashboard`, `middleware_network_overview`, `middleware_register_operator`, `middleware_add_node`, `middleware_weight_watcher` |
| `vault.ts` | 5 | 3 | `vault_get_balance`, `vault_deposit`, `vault_withdraw`, `vault_claim` |
| `operator.ts` | 1 | 1 | `operator_registry_get_all`, `operator_registry_register` |
| `l1-registry.ts` | 1 | 1 | `l1_registry_get_all`, `l1_registry_register` |
| `opt-in.ts` | 0 | 4 | `opt_in_l1`, `opt_out_l1`, `opt_in_vault`, `opt_out_vault` |
| `rewards.ts` | 1 | 2 | `rewards_get_epoch_rewards`, `rewards_distribute`, `rewards_claim` |
| `kite-staking.ts` | 0 | 9 | `kite_update_staking_config`, `kite_initiate_validator_registration`, `kite_complete_validator_registration` |
| `staking-vault.ts` | 8 | 14 | `staking_vault_info`, `staking_vault_full_info`, `staking_vault_deposit`, `staking_vault_process_epoch` |
| `balancer.ts` | 3 | 5 | `balancer_get_security_modules`, `balancer_get_validator_status`, `balancer_set_up_security_module`, `balancer_resend_*`, `balancer_transfer_l1_ownership` |
| `poa-security-module.ts` | 0 | 6 | `poa_add_node`, `poa_complete_validator_registration`, `poa_remove_node`, `poa_complete_validator_removal`, `poa_init_weight_update`, `poa_complete_weight_update` |
| `server.ts` | 1 | 0 | `health_check` — verifies CLI path, signer config, optional network connectivity |

## Signing Methods

Priority order (first match wins in `runCli()`):

1. **Ledger** (`SUZAKU_MCP_LEDGER=true`) — `--ledger` flag, timeout 180 s
2. **GPG keystore** (`SUZAKU_SECRET_NAME`) — `--secret-name <value>` flag
3. **Raw private key** (`SUZAKU_PK`) — injected as `PK` env var, never on command line

**Safe multisig overlay** — independent of signing method. If `SUZAKU_SAFE_ADDRESS` is set, `--safe <address>` is appended. Audit log records composite method (e.g. `SUZAKU_PK+SUZAKU_SAFE_ADDRESS`).

**P-Chain key** (`SUZAKU_PCHAIN_PK`) — separate from the above, injected as `PK_PCHAIN`. Required only by `complete_*` two-phase lifecycle tools.

**Key sanitization**: `sanitizeOutput()` redacts any 64-char hex string from all outputs, logs, and audit entries.

## Adding a New Tool

### Read tool

```typescript
// In src/tools/<group>.ts
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

For cross-chain warp tools, add `pchainPrivateKey: true` and `timeout: 300_000` to the `runCli` options.

## Resources & Prompts

### Resources (2)

| URI | Contents |
|---|---|
| `config://networks` | Supported networks + RPC endpoints (mainnet, fuji, anvil, kitetestnet) |
| `config://contracts` | Discovery guide: entry point (`discover_network`), auto-resolve paths, manual tools, and non-discoverable contracts |

### Prompts (3)

| Name | Purpose | Key params |
|---|---|---|
| `check-operator-health` | Run 5 read tools to assess operator health; suggests `discover_network` if middleware unknown | `middlewareAddress`, `operatorAddress` |
| `register-new-operator` | Step-by-step 5-phase registration; starts with `discover_network` for address discovery | `network?` |
| `validator-lifecycle` | Two-phase validator/delegator registration or removal; suggests `discover_network` + `middleware_operator_dashboard` for address resolution | `operation` (`register`/`remove`), `manager?` (`kite`/`vault`) |

## Build & Verify

```bash
cd packages/mcp
pnpm build          # tsc + chmod +x dist/server.js
pnpm dev            # tsc --watch
npx tsc --noEmit    # type-check only, no output
```

Start: `node packages/mcp/dist/server.js` (stdio transport).

## Key Invariants

1. **Mainnet-safe-by-default** — Write tools on mainnet never auto-execute. Default behavior is suggest mode. Opting out (`SUZAKU_MCP_SUGGEST=false`) still requires elicitation confirmation.
2. **No PK on command line** — Private keys pass only via child process env (`PK`, `PK_PCHAIN`). `sanitizeOutput()` redacts 64-char hex strings from all outputs.
3. **Restricted child env** — Subprocess inherits only 8 explicitly allowlisted variables. No ambient env leakage.
4. **Read tools always execute** — No guards, no suggest/confirm matrix, no signing required.
5. **Schema defaults to mainnet** — Omitting `network` param → `'mainnet'` → suggest mode for writes.
6. **Dedup is write-agnostic** — Cache key is args+network+rpcUrl. Write calls within `SUZAKU_MCP_DEDUP_WINDOW_MS` return cached results with `_dedup_warning`.
7. **Two-phase lifecycle needs P-Chain key** — `complete_*` tools require `SUZAKU_PCHAIN_PK` and use 5-minute timeout.
8. **Audit log is best-effort** — Written to `~/.suzaku-cli/mcp-audit.log` via non-blocking `appendFile`. Failures are silently ignored.
