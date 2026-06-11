# suzaku-cli

TypeScript CLI for the Suzaku restaking protocol on Avalanche. Built with Commander.js + viem.

## Monorepo Layout

```
/                   CLI package (this level)
packages/keeper/    Keeper bot for StakingVault operations — see keeper-review.md for open issues
packages/mcp/       MCP server (127 tools wrapping this CLI; --read-only and --propose-only profiles) — see packages/mcp/CLAUDE.md
```

pnpm workspace. Root is the CLI; `packages/mcp/` is the only sub-package.

## Source File Map

### `src/` — Command modules (one per contract/domain)

| File | Role |
|---|---|
| `cli.ts` | Entry point. Defines `main()`, global options, all subcommands, `preSubcommand` hook (cast mode, custom RPC, **Guard B**: mainnet PK block), `preAction` hook |
| `client.ts` | `generateClient()` — creates viem wallet/public client with network, account, Safe overlay |
| `config.ts` | `getConfig()` — builds contract map, resolves registry addresses per network (mainnet/fuji/anvil) |
| `index.ts` | Library re-exports (`cChainUtils`, `pChainUtils`, `transferUtils`, `utils`, `warpUtils`, `client`, `config`) |
| `middleware.ts` | L1Middleware commands (register/disable/remove operator, add/remove node, stake update, weight watcher) |
| `vault.ts` | Symbiotic vault commands (deposit, withdraw, claim, balance queries) |
| `vaultManager.ts` | VaultManager commands (register vault to L1, update limits, remove) |
| `operator.ts` | OperatorRegistry commands (list, register) |
| `operatorOptIn.ts` | Opt-in/out for L1 and vault |
| `delegator.ts` | L1RestakeDelegator commands (set L1 limit, set operator shares) |
| `rewards.ts` | Rewards commands (distribute, claim, fee config, epoch queries). `set-amount`/`distribute` support `--safe-propose` for atomic MultiSend Safe proposals via `handleBatchTransaction` |
| `l1.ts` | L1Registry commands (register L1, set metadata URL, set middleware) |
| `balancer.ts` | BalancerValidatorManager commands (security modules, validator lifecycle) |
| `securityModule.ts` | PoASecurityModule commands (complete validator registration/removal, weight update) |
| `kiteStaking.ts` | KiteStakingManager commands (two-phase validator/delegator registration/removal, staking config) |
| `stakingVault.ts` | StakingVault commands (deposit, withdraw, epoch processing, two-phase validator/delegator lifecycle, info queries) |
| `uptime.ts` | Uptime tracking commands (compute, report, query validator/operator uptime) |
| `accessControl.ts` | OpenZeppelin AccessControl commands (grant/revoke/check roles) |
| `lstWrapper.ts` | LSTWrapper (ERC4626 LST vault, e.g. wsALOT) commands: info, balance, preview deposit/redeem, paused, max-deposit, deposit, redeem, harvest |
| `vaultHelper.ts` | VaultHelper read commands: info, pending withdraws, claimable reward, latest distributed rewards |
| `keyStore.ts` | GPG keystore subcommands (init, create, rm, list, addresses). Store path: `~/.suzaku-cli/.password-store` |

### `src/lib/` — Shared utilities

| File | Role |
|---|---|
| `commandUtils.ts` | Monkey-patches `Command.prototype.action` to wrap all actions with error handling + `logger.printJson()` |
| `cliParser.ts` | Argument/option parsers (`ParserPrivateKey`, `ParserAddress`, `ParserHex`, `ParserNodeID`, `ParserAVAX`). **Mainnet raw-PK guard (Guard A) lives here**; relaxed only for `--safe` + `--safe-propose` |
| `viemUtils.ts` | `curriedContract()` — curried contract factory with ABI validation. `withSafeWrite()` — proxy adding simulate-then-execute, Safe tx strategy, cast mode, event log parsing. `contractAbiValidation()` — selector matching with Aho-Corasick + proxy detection |
| `chainList.ts` | Chain definitions (mainnet, fuji, anvil, kitetestnet, custom). `setCustomChainRpcUrl()` for `--rpc-url` |
| `castUtils.ts` | `--cast` mode: formats equivalent `cast call`/`cast send`/`curl` commands instead of executing |
| `safeUtils.ts` | Safe multisig transaction strategy: `handleTransactionStrategy` (match pending txs, confirm/propose/skip) and `handleBatchTransaction` (atomic batch send/propose for `rewards set-amount`/`distribute` whenever `--safe` is active; pins nonce for a deterministic, idempotent SafeTxHash; `--safe-propose` sets `proposeOnly` to refuse owner keys). Also exports `safeQueueUrl` |
| `ledgerUtils.ts` | Ledger hardware wallet integration (account derivation, Safe provider adapter) |
| `pChainUtils.ts` | P-Chain operations (create subnet, convert to L1, validator balance, `getCurrentValidators`) |
| `cChainUtils.ts` | C-Chain utilities (get chain ID) |
| `warpUtils.ts` | Warp message encoding, signature aggregation from validators via `SIG_AGG_URL` |
| `transferUtils.ts` | ERC20 event parsing, P-Chain balance checks |
| `utils.ts` | General helpers (address derivation, NodeID encoding, clipboard, BigInt formatting) |
| `justification.ts` | P-Chain owner justification encoding for warp messages |
| `logger.ts` | Logger with JSON output mode (`--json`), prompt support, structured data collection |
| `pass.ts` | GPG pass wrapper (init, insert, show, rm, list) |
| `autoCompletion.ts` | Shell auto-completion support |

### `src/abis/` — Contract ABI definitions

One file per contract: `L1Middleware`, `VaultTokenized`, `VaultFactory`, `OperatorRegistry`, `L1Registry`, `OperatorL1OptInService`, `OperatorVaultOptInService`, `L1RestakeDelegator`, `RewardsNativeToken`, `BalancerValidatorManager`, `ValidatorManager`, `KiteStakingManager`, `StakingVault`, `StakingVaultOperations`, `PoASecurityModule`, `ERC20`, `DefaultCollateral`, `IWarpMessenger`, `AccessControl`, `Ownable`, `VaultManager`, `UptimeTracker`, `LSTWrapper`, `VaultHelper`. `index.ts` re-exports all as `SuzakuABI`.

`abi-selectors.json` (generated) maps ABI names to their 4-byte function selectors for ABI validation.

## CLI Framework

**Commander.js** with `@commander-js/extra-typings` for type-safe options.

### Global options (defined in `cli.ts`)

| Flag | Env | Purpose |
|---|---|---|
| `-n, --network <network>` | — | Chain selector: `mainnet` (default), `fuji`, `anvil`, `kitetestnet`, `custom` |
| `-r, --rpc-url <rpcUrl>` | — | RPC URL; auto-sets `--network custom`, resolves chain ID + network ID from the node |
| `-k, --private-key <pk>` | `PK` | EVM private key (hex). Conflicts with `--secret-name`, `--ledger` |
| `-s, --secret-name <name>` | — | GPG keystore secret. Conflicts with `--private-key`, `--ledger` |
| `-l, --ledger` | — | Use Ledger hardware wallet. Conflicts with `--private-key`, `--secret-name` |
| `-w, --wait <n>` | — | Confirmations to wait after write tx (default: 2) |
| `--json` | — | JSON output mode |
| `-y, --yes` | — | Auto-confirm prompts |
| `--safe <address>` | — | Safe multisig overlay address. Conflicts with `--cast` |
| `--skip-abi-validation` | — | Skip contract ABI validation |
| `--cast` | — | Output `cast` commands instead of executing. Conflicts with `--safe` |

### Action wrapper (`commandUtils.ts`)

Every command action is wrapped to: catch errors (log + `process.exit(1)`), call `logger.printJson()` on success.

## Network Configuration

Defined in `src/lib/chainList.ts`:

| Chain key | Chain ID | RPC | Testnet | Network bucket |
|---|---|---|---|---|
| `mainnet` | 43114 | Avalanche C-Chain default | no | `mainnet` |
| `fuji` | 43113 | Avalanche Fuji default | yes | `fuji` |
| `anvil` | 31337 | `http://localhost:8545` | yes | `fuji` |
| `kitetestnet` | 2368 | `https://rpc-testnet.gokite.ai/` | yes | `fuji` |
| `custom` | dynamic | from `--rpc-url` | auto-detected | auto-detected |

`--rpc-url` triggers `setCustomChainRpcUrl()` which queries the node for network ID and chain ID, then overrides the `custom` chain definition. If network ID is `"1"`, it's treated as mainnet; otherwise fuji/testnet.

## Key Management

### Signing priority (first match wins in `generateClient`)

1. **Ledger** (`--ledger`) — hardware wallet, derives P-Chain + C-Chain addresses
2. **GPG keystore** (`--secret-name <name>`) — decrypts via `gpg` from `~/.suzaku-cli/.password-store`
3. **Raw private key** (`--private-key <hex>` or `PK` env)

### Mainnet raw-PK guard

Two guards enforce keystore or Ledger on mainnet. **Guard A** (`ParserPrivateKey` in `cliParser.ts`) throws if a raw hex key is used with `mainnet` in `process.argv`. **Guard B** (`preSubcommand` hook in `cli.ts`) blocks a software key on any non-testnet network using the resolved options. Both relax for exactly one case: `--safe` **and** `--safe-propose` (a flag valid only on `rewards set-amount`/`distribute`), which permits a software key for the Safe delegate propose-only flow. Those commands route through `handleBatchTransaction`, which refuses Safe OWNER keys — so the relaxed key can queue proposals but never execute.

### Safe multisig

`--safe <address>` creates a `SafeClient` overlay. Transaction strategy in `safeUtils.ts`: searches for matching pending Safe txs, then confirms/proposes/creates new/skips. Works with any signing method.

For `rewards set-amount`/`distribute`, any `--safe` run already routes through `handleBatchTransaction` (an atomic batch, bypassing the per-call `withSafeWrite` proxy): set-amount batches `approve` + `setRewardsAmountForEpochs` as a MultiSend; distribute is a single-call batch. **`--safe-propose`** (per-command, only on these two commands) additionally forces propose-only mode — it refuses Safe OWNER keys (never executes) and is what relaxes the mainnet raw-key guard. The shared `withSafeWrite` proxy and `handleTransactionStrategy` are unchanged.

### GPG keystore

Store path: `~/.suzaku-cli/.password-store`. Managed via `keystore` subcommands (`init`, `create`, `rm`, `list`, `addresses`). Uses `pass.ts` (GPG wrapper).

## Contract Interaction Patterns

### Client factory (`client.ts`)

`generateClient(chain, privateKey?, safe?)` — returns `ExtendedWalletClient` (with account) or `ExtendedPublicClient` (read-only). The client carries `.network`, `.addresses` (C + P), `.safe`, `.ledger` fields.

### Curried contracts (`viemUtils.ts`)

`curriedContract(abiName, client, wait, skipAbiValidation)` returns `(address) => Promise<SafeSuzakuContract>`.

Calling with an address:
1. Runs ABI validation (selector matching via Aho-Corasick against bytecode, proxy-aware: EIP-1967 + EIP-1167)
2. Creates viem `getContract` instance
3. Wraps with `withSafeWrite()` proxy

### `withSafeWrite` proxy

Intercepts `.write.*`, `.safeWrite.*`, and `.read.*` methods:
- **`.safeWrite.fn(args)`** — simulates first, then executes (default for most commands)
- **`.write.fn(args)`** — direct execution, Safe tx strategy if Safe connected
- **`.read.fn(args)`** — direct read, error formatting
- **Cast mode** (`--cast`): logs `cast call`/`cast send` commands, skips execution
- Parses event logs from receipt and adds to logger data

### ABI validation (`contractAbiValidation`)

Extracts function selectors from `abi-selectors.json`, searches contract bytecode using Aho-Corasick. 5% tolerance for missing selectors. Detects EIP-1967 proxies and EIP-1167 minimal proxies, validates against implementation.

## Two-Phase Operations

Pattern used by `kiteStaking.ts` and `stakingVault.ts` for validator/delegator lifecycle:

1. **Initiate** (C-Chain tx) — `initiateValidatorRegistration`, `initiateDelegatorRegistration`, etc. Sends C-Chain transaction, emits event with `validationID`
2. **Complete** (C-Chain tx + P-Chain warp message) — `completeValidatorRegistration`, etc. Requires:
   - A separate P-Chain private key (via env or flag)
   - Signature aggregation from validators (`warpUtils.ts` → `SIG_AGG_URL`)
   - P-Chain transaction issuance

The `complete_*` steps need a P-Chain key because they issue P-Chain transactions (register/remove validator weight on the P-Chain).

## Build & Dev

```bash
pnpm build          # tsc → dist/
pnpm cli            # ts-node dev mode (pnpx ts-node src/cli.ts)
pnpm link --global  # install as global `suzaku-cli` command
```

Entry point: `bin/cli.js` (production) / `src/cli.ts` (dev).

ABI updates: regenerate TypeScript ABI files in `src/abis/` and `abi-selectors.json` from contract artifacts.

Type-check only: `npx tsc --noEmit`

## Key Invariants

1. **Mainnet raw-PK blocked** — `ParserPrivateKey` rejects hex private keys when `mainnet` is in argv (Guard A), and the `preSubcommand` hook blocks them on any non-testnet network (Guard B, cli.ts). Use `--secret-name` or `--ledger` on mainnet. One exception: `--safe` + `--safe-propose` (a flag valid only on `rewards set-amount`/`distribute`) permits a software key for the Safe delegate propose-only flow — those commands refuse Safe OWNER keys in `handleBatchTransaction`, so the key can queue proposals but never execute.
2. **ABI validation on by default** — every `curriedContract` call validates selectors against on-chain bytecode. Skip with `--skip-abi-validation`.
3. **JSON output contract** — `--json` mode: all output goes through `logger`, `printJson()` called on success. Commands must use `logger.log`/`logger.addData` (not `console.log`).
4. **Two-phase ops need separate P-Chain key** — `complete_*` commands require a P-Chain private key for warp message signing and P-Chain tx issuance.
5. **Safe write simulation** — `safeWrite` proxy always simulates before executing (unless in cast mode). Direct `write` proxy skips simulation.
6. **Cast mode is read-safe** — `--cast` logs equivalent `cast call`/`cast send`/`curl` commands; read operations still execute but also print the cast equivalent.
