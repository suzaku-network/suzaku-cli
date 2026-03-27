# Contract instances — extensions on top of viem

`src/lib/viemUtils.ts` wraps viem's `getContract` to produce richer contract instances used throughout the CLI. Every contract obtained via the config comes with five extra capabilities on top of the standard viem `read` / `write` / `simulate` API.

---

## Getting a contract instance

> **In the CLI, never call `curriedContract` directly.** Instances are built automatically by `getConfig` in `config.ts` and exposed via `config.contracts`. Each entry is a lazy factory — call it with an address to get the enriched instance:

```ts
// In a command handler, config is injected by the middleware
const vault = await config.contracts.StakingVault('0xABCD...')
// If the STAKING_VAULT env var is set, the address argument can be omitted:
const vault = await config.contracts.StakingVault()
```

The factory validates the contract bytecode against expected ABI selectors before returning. When `config.client` is a `WalletClient`, the instance is a `SafeSuzakuContract` (includes `safeWrite`). Otherwise it is a `SuzakuContract`.

---

## Added methods and behaviours

### 1. `write` — transaction lifecycle management

Every write call is transparently upgraded:

- **Waits for receipt** — blocks until the transaction is mined (`confirmations` configured at `getConfig` level, defaults to `1`).
- **Reverts throw** — if the transaction reverts, an error is thrown with the invocation signature and tx hash.
- **Logs are printed** — events emitted during the transaction are decoded and logged to the console.
- **Safe multisig support** — when the client has a Safe attached, the write is routed through the Safe SDK (new tx, confirm, propose, or skip depending on the current state of the queue).
- **Cast mode** — when cast mode is active, the equivalent `cast send` command is printed instead of executing.

```ts
const hash = await vault.write.registerValidator([...args])
// ↳ waits for receipt, prints decoded logs, throws on revert
```

`account` is automatically injected from `client.account` and does not need to be passed manually.

---

### 2. `safeWrite` — simulate-then-write

`safeWrite` has the same signature as `write` but runs `contract.simulate` first. If simulation fails, the error is thrown before any transaction is sent.

```ts
// Throws before sending if the call would revert
await vault.safeWrite.unstake([...args])
```

Useful when you want to catch revert reasons cheaply (via `eth_call`) before paying gas.

---

### 3. `read` — error formatting

`read` calls are proxied to:

- Strip noisy viem documentation links from error messages.
- Prefix errors with the contract name for easier debugging.
- Print the equivalent `cast call` command in cast mode.

Usage is identical to standard viem:

```ts
const balance = await vault.read.balanceOf(['0x...'])
```

---

### 4. `multicall` — batched reads

`multicall` batches multiple view/pure calls into a single `eth_call` via the Multicall3 contract, reducing RPC round-trips.

```ts
// Functions with no arguments: pass the name as a string
// Functions with arguments: pass { name, args }
const [totalStake, minStake, nodeStake] = await vault.multicall([
  'totalStake',
  'minStake',
  { name: 'nodeStake', args: ['0xValidatorAddr'] },
] as const)
// Return types are inferred per function
```

**Options:**

| Option | Default | Description |
|---|---|---|
| `strict` | `false` | Throw if any individual call fails (default: warn and return `undefined`) |
| `details` | `false` | Return `{ name, result }` objects instead of plain values |

```ts
const results = await vault.multicall(['totalStake', 'minStake'] as const, { details: true })
// results[0] = { name: 'totalStake', result: 1000000n }
```

---

### 5. `getLogs` — typed event log fetching

`getLogs` fetches or parses event logs for this contract. All parameters are optional.

```ts
// Defaults: fromBlock = 302400, toBlock = 'latest', no filter
const allLogs = await vault.getLogs()

// Filter by a single event — args are typed to that event's inputs
const registrations = await vault.getLogs({
  event: 'StakingVault__DelegatorRegistrationInitiated',
  args: { validationID: '0x...' },
  fromBlock: 1_000_000n,
})

// Filter by multiple events (args filtering not available in this case)
const logs = await vault.getLogs({
  event: ['StakingVault__ValidatorRemovalInitiated', 'StakingVault__DelegationRemoved'],
})

// Parse logs from an existing transaction receipt — no eth_getLogs query
const logs = await vault.getLogs({
  hash: '0xabc...',
  event: 'StakingVault__DelegatorRegistrationInitiated',
})
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `event` | event name \| event name[] | `undefined` | Event(s) to filter. TypeScript constrains values to this contract's ABI events. |
| `args` | typed per event | — | Filter by indexed/non-indexed inputs. Only valid when `event` is a single name. |
| `fromBlock` | `bigint` | `302400n` | Start block |
| `toBlock` | `bigint \| 'latest'` | `'latest'` | End block |
| `hash` | `Hex` | — | If provided, parses logs from the receipt of this tx instead of querying `eth_getLogs`. If the transaction reverted, throws immediately. |

The return type is fully typed: `ParseEventLogsReturnType<ABI, EventName>`, giving strongly-typed `eventName` and `args` on each log entry.

---

## Extra properties

| Property | Type | Description |
|---|---|---|
| `contract.address` | `Hex` | The contract address |
| `contract.name` | `string` | The ABI name (e.g. `'StakingVault'`) |
