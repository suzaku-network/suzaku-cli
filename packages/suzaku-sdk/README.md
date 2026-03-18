# @suzaku-network/sdk

Browser-safe TypeScript SDK for Suzaku StakingVault operations on Avalanche.

This package lets a frontend application manage validator and delegator lifecycle through the **StakingVault** contract, using the **Core wallet** extension for both C-Chain and P-Chain transaction signing. No private keys are ever handled by the SDK.

## Installation

```bash
pnpm add @suzaku-network/sdk viem @avalabs/avalanchejs
```

`viem` and `@avalabs/avalanchejs` are peer dependencies -- install them alongside the SDK.

## Prerequisites

- **Core wallet** browser extension installed and connected
- A funded Avalanche account (AVAX on both C-Chain and P-Chain)
- Node operator details: `nodeId`, `blsKey`, `blsProofOfPossession`
- The `StakingVault` contract address for your target network

## Quick start

```ts
import { createWalletClient, createPublicClient, custom, http } from "viem"
import { avalancheFuji } from "viem/chains"
import {
  initiateValidatorRegistration,
  completeValidatorRegistration,
  createCoreWalletPChainSigner,
} from "@suzaku-network/sdk"

// 1. Create viem clients from Core wallet's injected provider
const provider = window.avalanche ?? window.ethereum

const walletClient = createWalletClient({
  chain: avalancheFuji,
  transport: custom(provider),
})

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(),
})

// 2. Create the P-Chain signer from Core wallet
const pChainSigner = await createCoreWalletPChainSigner({ provider, network: "fuji" })

// 3. Initiate registration (C-Chain transaction -- user signs in wallet)
const initiateTxHash = await initiateValidatorRegistration({
  walletClient,
  publicClient,
  stakingVaultAddress: "0x...",
  nodeId: "NodeID-...",
  blsKey: "0x...",
  remainingBalanceOwner: { threshold: 1, addresses: ["0x..."] },
  disableOwner: { threshold: 1, addresses: ["0x..."] },
  stakeAmount: 25000000000000000000n, // 25 AVAX in wei (from vault pool)
})

// 4. Complete registration (multi-chain -- user signs both P-Chain and C-Chain txs)
const completeTxHash = await completeValidatorRegistration({
  walletClient,
  publicClient,
  network: "fuji",
  stakingVaultAddress: "0x...",
  blsProofOfPossession: "0x...",
  initiateTxHash,
  initialBalance: 100000000n, // P-Chain balance in nAVAX
  pChainSigner,
  onProgress: (step) => console.log(step),
})
```

## Operations

The SDK covers the full validator and delegator lifecycle through the StakingVault:

| Operation | Function | Description |
|-----------|----------|-------------|
| **Validator Registration** | `initiateValidatorRegistration` | Start validator registration (C-Chain) |
| | `completeValidatorRegistration` | 5-step orchestrator: receipt parsing, P-Chain registration, signature aggregation, C-Chain completion |
| **Validator Removal** | `initiateValidatorRemoval` | Start validator removal (C-Chain) |
| | `completeValidatorRemoval` | 5-step orchestrator: receipt parsing, P-Chain weight-to-zero, justification, signature aggregation, C-Chain completion |
| **Delegator Registration** | `initiateDelegatorRegistration` | Start delegator registration (C-Chain) |
| | `completeDelegatorRegistration` | 4-step orchestrator: receipt parsing, P-Chain weight update, signature aggregation, uptime proof + C-Chain completion |
| **Delegator Removal** | `initiateDelegatorRemoval` | Start delegator removal (C-Chain) |
| | `completeDelegatorRemoval` | 4-step orchestrator: receipt parsing, P-Chain weight update, signature aggregation, C-Chain completion |

### StakingVault vs KiteStakingManager

The SDK targets the **StakingVault** contract, which wraps the KiteStakingManager internally. Key differences from a direct KiteStakingManager integration:

- **Non-payable**: All calls use vault pool funds. `stakeAmount` is a parameter, not `msg.value`.
- **Simpler initiate removal**: No `includeUptimeProof` or `messageIndex` -- just `validationID` or `delegationID`.
- **Auto-resolution**: The SDK resolves `ValidatorManager` and settings automatically from the StakingVault address using `resolveFromVault()`.

## Address resolution

The SDK automatically resolves dependent contract addresses from the StakingVault:

```ts
import { resolveFromVault } from "@suzaku-network/sdk"

const resolved = await resolveFromVault(stakingVaultAddress, publicClient)
// resolved.kiteStakingManagerAddress
// resolved.validatorManagerAddress
// resolved.uptimeBlockchainID
```

## Step-by-step functions

Each `complete*` orchestrator is built from individually callable step functions for debuggability:

### completeValidatorRegistration steps

| Step | Function | Description |
|------|----------|-------------|
| 1 | `parseInitiateReceipt` | Parse initiate tx receipt for events and warp message |
| 2 | `checkPChainRegistration` | Check if validator is already on P-Chain |
| 3 | `registerOnPChain` | Collect signatures + register on P-Chain (wallet prompts) |
| 4 | `collectPChainWarpSignatures` | Build P-Chain warp message + aggregate BLS signatures |
| 5 | `submitCompleteRegistration` | Submit `completeValidatorRegistration` on C-Chain |

### completeValidatorRemoval steps

| Step | Function | Description |
|------|----------|-------------|
| 1 | `parseRemovalReceipt` | Parse removal tx receipt |
| 2 | `checkPChainRegistration` | Check if validator is still on P-Chain |
| 3 | `setWeightOnPChain` | Set validator weight to 0 on P-Chain (wallet prompts) |
| 4 | `collectRemovalWarpSignatures` | Get justification + aggregate signatures |
| 5 | `submitCompleteRemoval` | Submit `completeValidatorRemoval` on C-Chain |

### completeDelegatorRegistration steps

| Step | Function | Description |
|------|----------|-------------|
| 1 | `parseDelegatorReceipt` | Parse delegator registration receipt |
| 2 | `setDelegatorWeightOnPChain` | Update validator weight on P-Chain (wallet prompts) |
| 3 | `collectDelegatorPChainSignatures` | Aggregate weight confirmation signatures |
| 4 | `submitCompleteDelegatorRegistration` | Get uptime proof + submit on C-Chain |

### completeDelegatorRemoval steps

| Step | Function | Description |
|------|----------|-------------|
| 1 | `parseDelegatorRemovalReceipt` | Parse delegator removal receipt |
| 2 | `setDelegatorRemovalWeightOnPChain` | Update validator weight on P-Chain (wallet prompts) |
| 3 | `collectDelegatorRemovalWarpSignatures` | Aggregate weight confirmation signatures |
| 4 | `submitCompleteDelegatorRemoval` | Submit `completeDelegatorRemoval` on C-Chain |

## Progress reporting

Pass an `onProgress` callback to any `complete*` function:

```ts
await completeValidatorRegistration({
  // ...params
  onProgress: (step) => {
    setStatusMessage(step) // Update your UI
  },
})
```

## API reference

### `initiateValidatorRegistration(params)`

| Name | Type | Description |
|------|------|-------------|
| `walletClient` | `WalletClient` | viem wallet client from Core wallet |
| `publicClient` | `PublicClient` | viem public client for reads |
| `stakingVaultAddress` | `Hex` | StakingVault contract address |
| `nodeId` | `NodeId` | Validator node ID (`"NodeID-..."`) |
| `blsKey` | `Hex` | BLS public key |
| `remainingBalanceOwner` | `PChainOwnerParam` | P-Chain owner for remaining balance |
| `disableOwner` | `PChainOwnerParam` | P-Chain owner for disabling |
| `stakeAmount` | `bigint` | Stake amount in wei (from vault pool) |

### `initiateValidatorRemoval(params)`

| Name | Type | Description |
|------|------|-------------|
| `walletClient` | `WalletClient` | viem wallet client |
| `publicClient` | `PublicClient` | viem public client |
| `stakingVaultAddress` | `Hex` | StakingVault contract address |
| `nodeId` | `NodeId` | Validator node ID to remove |

### `initiateDelegatorRegistration(params)`

| Name | Type | Description |
|------|------|-------------|
| `walletClient` | `WalletClient` | viem wallet client |
| `publicClient` | `PublicClient` | viem public client |
| `stakingVaultAddress` | `Hex` | StakingVault contract address |
| `nodeId` | `NodeId` | Validator node ID to delegate to |
| `stakeAmount` | `bigint` | Delegation amount in wei (from vault pool) |

### `initiateDelegatorRemoval(params)`

| Name | Type | Description |
|------|------|-------------|
| `walletClient` | `WalletClient` | viem wallet client |
| `publicClient` | `PublicClient` | viem public client |
| `stakingVaultAddress` | `Hex` | StakingVault contract address |
| `delegationID` | `Hex` | Delegation ID to remove |

### `createCoreWalletPChainSigner(options)`

Creates a `PChainSigner` from the Core wallet extension provider.

```ts
const signer = await createCoreWalletPChainSigner({
  provider: window.avalanche,
  network: "fuji",
  evmAddress: "0x...", // optional: match a specific account
})
```

### Exported ABIs

```ts
import {
  StakingVaultABI,
  KiteStakingManagerABI,
  ValidatorManagerABI,
  IWarpMessengerABI,
} from "@suzaku-network/sdk"
```

## Error handling

All errors are thrown as standard JavaScript `Error` instances. The SDK never calls `process.exit` or uses any Node.js APIs.

## Architecture

```
@suzaku-network/sdk
├── kiteStaking/     All 8 operation functions + step functions
├── contracts/       Simplified viem contract wrapper (simulate + write + confirm)
├── pchain/          P-Chain RPC client, PChainSigner interface, Core wallet adapter
├── warp/            Warp message packing, Glacier signature collection
├── utils/           Address resolution, encoding, justification, retry
└── abis/            Contract ABIs (StakingVault, KiteStakingManager, ValidatorManager, IWarpMessenger)
```

The SDK is fully browser-safe:
- No `process`, `Buffer`, `fs`, `path`, or `child_process`
- No private keys -- all signing is delegated to the wallet
- Ships as dual ESM + CJS

## Development

```bash
pnpm install
pnpm build    # ESM + CJS + type declarations
pnpm dev      # Watch mode
pnpm typecheck
```

## License

MIT
