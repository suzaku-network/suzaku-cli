# Kite Staking Manager — Step-by-step guide

This document describes how to use the `kite-staking-manager` subcommands (alias: `ksm`) in the context of the **Kite AI** L1 blockchain. The KiteStakingManager lets you stake **KITE** directly: you register validators and delegators by sending KITE with the initiate transactions (no vault or shares). You own validators and delegators directly and can claim rewards and change reward recipients.

All commands support the [global options](../README.md#global-options) (`--network`, `--private-key` / `-s` / `--ledger`, etc.). Examples below use `--network kiteai`; omit it or use another network as needed.

## Prerequisites

- Suzaku CLI installed and linked (`pnpm link --global` so `suzaku-cli` is available).
- A signer: private key via `PK` or `--private-key`, keystore secret via `-s`, or Ledger via `--ledger`.
- For P-Chain operations (validator/delegator complete steps), the signer must control a P-Chain address with enough **AVAX** for transaction fees (e.g. 0.00005 AVAX per complete step). Kite AI uses KITE on the L1; P-Chain fees remain in AVAX.

## 1. Environment and contract address

The KiteStakingManager is deployed on the **Kite AI** L1; use the network flag that targets that chain (e.g. `--network kiteai` for the Kite AI chain). Set the KiteStakingManager contract address and use it for all subsequent steps.

```bash
export KITE_STAKING_MANAGER=0x...   # your KiteStakingManager contract address
```

For signing, use one of:

- `export PK=0x...` (hex private key), then pass `--private-key $PK` or rely on `PK` if the CLI reads it.
- Or `-s <secret-name>` for a key from the CLI keystore.
- Or `--ledger` for a Ledger device.

All examples below use `$KITE_STAKING_MANAGER` and `--network kiteai`. Replace with your values.

## 2. Query global configuration (read-only)

Get the KiteStakingManager’s global configuration (staking limits, validator manager, reward calculator, reward vault, etc.). No private key needed.

```bash
suzaku-cli kite-staking-manager info $KITE_STAKING_MANAGER --network kiteai
```

Use **validator-info** and **delegator-info** (see [Query commands](#9-query-commands-read-only)) to inspect specific validators and delegators by validation ID or delegation ID.

## 3. Register a validator

Validator registration is a two-step process: **initiate** on the KiteStakingManager (you send KITE as stake), then **complete** (P-Chain registration + KiteStakingManager completion).

### 3.1 Initiate validator registration

You send KITE as the initial stake; the contract uses it for the validator. You must supply Node ID, BLS key, delegation fee, minimum stake duration, reward recipient, and stake amount.

**Variables:**

- `NODE_ID` — Avalanche P-Chain Node ID (e.g. `NodeID-9knX4hZSG7AU967HPB8ZgBMgzWWFzXwLg`). If you don’t know it, see [Getting your Node ID and BLS keys](#getting-your-node-id-and-bls-keys) below.
- `BLS_KEY` — BLS public key (hex). See the same section if you need to obtain it from your node.
- `DELEGATION_FEE_BIPS` — delegation fee in basis points (e.g. `1000` = 10%).
- `MIN_STAKE_DURATION` — minimum stake duration in seconds.
- `REWARD_RECIPIENT` — address that receives validator rewards.
- `STAKE_AMOUNT` — KITE to stake for this validator (e.g. `1000000`).

```bash
export NODE_ID=NodeID-9knX4hZSG7AU967HPB8ZgBMgzWWFzXwLg
export BLS_KEY=0xa089c9fa1abfa97afa35752eeaa952e7410506109ce1248e3eec6499a2a83b37eb98316f9f68839ca0a3cc2d4cc76116
export DELEGATION_FEE_BIPS=1000
export MIN_STAKE_DURATION=31536000
export REWARD_RECIPIENT=0xb9Ae195bAB60d7394E382a95561cB1416B746253
export STAKE_AMOUNT=1000000

suzaku-cli kite-staking-manager initiate-validator-registration \
  $KITE_STAKING_MANAGER \
  $NODE_ID \
  $BLS_KEY \
  $DELEGATION_FEE_BIPS \
  $MIN_STAKE_DURATION \
  $REWARD_RECIPIENT \
  $STAKE_AMOUNT \
  --network kiteai
```

Save the transaction hash from the output; you need it for the complete step.

```bash
export INIT_TX_HASH=0x...
```

Optional: `--pchain-remaining-balance-owner-threshold`, `--pchain-disable-owner-threshold`, `--pchain-remaining-balance-owner-address`, `--pchain-disable-owner-address` for P-Chain owner configuration.

### 3.2 Complete validator registration

This step registers the validator on the P-Chain and finalizes it in the KiteStakingManager. You need the BLS proof-of-possession (POP).

**Variables:**

- `INIT_TX_HASH` — transaction hash from **initiate-validator-registration**.
- `BLS_POP` — BLS proof-of-possession (hex).

```bash
export BLS_POP=0xb715518ede94c0eb8cd3a25c52a131e15608a027ed7ca48a68a870cb4209b2b154fd2d0c5be45922cbfe345094f05120108de6a48671437a7bc159421be64ecdf14902a52d1295be76872f0e6b9c6d1241568f06fb8740f14492d431fb8298bb

suzaku-cli kite-staking-manager complete-validator-registration \
  $KITE_STAKING_MANAGER \
  $INIT_TX_HASH \
  $BLS_POP \
  --network kiteai
```

Optional: `--pchain-tx-private-key`, `--initial-balance` (see below), `--skip-wait-api`.

**--initial-balance** (optional): Amount of AVAX (in decimal, e.g. `0.5`) left on the P-Chain node after registration to pay for **continuous fee** (ongoing validation). If this balance reaches 0, the validator will become inactive. Default is `0.01`.

### Getting your Node ID and BLS keys

If you run the validator node yourself but don’t have the Node ID or BLS key at hand, you can query them from the node’s Info API. On the machine where the node is running (replace `http://localhost:9650` with your node’s base URL if needed):

**Node ID:**

```bash
curl -X POST --data '{"jsonrpc":"2.0","id":1,"method":"info.getNodeID"}' \
  -H "content-type:application/json;" \
  http://localhost:9650/ext/info
```

Example output:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "nodeID": "NodeID-9knX4hZSG7AU967HPB8ZgBMgzWWFzXwLg",
    "nodePOP": {
      "publicKey": "0xa089c9fa1abfa97afa35752eeaa952e7410506109ce1248e3eec6499a2a83b37eb98316f9f68839ca0a3cc2d4cc76116",
      "proofOfPossession": "0xb715518ede94c0eb8cd3a25c52a131e15608a027ed7ca48a68a870cb4209b2b154fd2d0c5be45922cbfe345094f05120108de6a48671437a7bc159421be64ecdf14902a52d1295be76872f0e6b9c6d1241568f06fb8740f14492d431fb8298bb"
    }
  },
  "id": 1
}
```

## 4. Start delegation

Delegation is also two steps: **initiate** then **complete**. You send KITE with the initiate call; the contract uses it as the delegation stake.

### 4.1 Initiate delegator registration

**Variables:**

- `NODE_ID` — Node ID of the validator you are delegating to.
- `REWARD_RECIPIENT` — address that receives delegator rewards.
- `DELEGATION_STAKE_AMOUNT` — KITE to delegate (e.g. `0.1`).

```bash
export NODE_ID=NodeID-9knX4hZSG7AU967HPB8ZgBMgzWWFzXwLg
export REWARD_RECIPIENT=0xb9Ae195bAB60d7394E382a95561cB1416B746253
export DELEGATION_STAKE_AMOUNT=10

suzaku-cli kite-staking-manager initiate-delegator-registration \
  $KITE_STAKING_MANAGER \
  $NODE_ID \
  $REWARD_RECIPIENT \
  $DELEGATION_STAKE_AMOUNT \
  --network kiteai
```

Save the transaction hash for the complete step.

```bash
export INIT_TX_HASH=0x...
```

### 4.2 Complete delegator registration

Completion submits the delegation on the P-Chain and records it in the KiteStakingManager. The CLI needs an RPC URL for validator uptime that exposes the `/validators` endpoint.

**Variables:**

- `INIT_TX_HASH` — transaction hash from **initiate-delegator-registration**.
- `UPTIME_RPC_URL` — base URL for the uptime service (e.g. `https://test.ash.center`).

```bash
export UPTIME_RPC_URL=https://test.ash.center

suzaku-cli kite-staking-manager complete-delegator-registration \
  $KITE_STAKING_MANAGER \
  $INIT_TX_HASH \
  $UPTIME_RPC_URL \
  --network kiteai
```

From the output or from **delegator-info**, note the **delegation ID** for later removal.

```bash
export DELEGATION_ID=0xc3aecbfae9bfcb44f66c322ec8fb7f823a1a0a0bf811154879db1f527b1a35b5
```

Optional: `--pchain-tx-private-key`.

## 5. Stop delegation

Removing a delegator is two steps: **initiate** removal, then **complete** it.

### 5.1 Initiate delegator removal

**Variables:**

- `DELEGATION_ID` — delegation ID from **complete-delegator-registration** or **delegator-info**.

```bash
suzaku-cli kite-staking-manager initiate-delegator-removal \
  $KITE_STAKING_MANAGER \
  $DELEGATION_ID \
  --network kiteai
```

Optional: `--include-uptime-proof` and `--rpc-url <rpcUrl>` if you want to include an uptime proof (required when the removal flow expects it).

Save the transaction hash.

```bash
export INIT_TX_HASH=0x...
```

### 5.2 Complete delegator removal

```bash
suzaku-cli kite-staking-manager complete-delegator-removal \
  $KITE_STAKING_MANAGER \
  $INIT_TX_HASH \
  $UPTIME_RPC_URL \
  --network kiteai
```

Optional: `--pchain-tx-private-key`, `--skip-wait-api`, `--delegation-id`, `--initiate-tx`.

## 6. Remove validator

Validator removal is two steps: **initiate** then **complete**.

### 6.1 Initiate validator removal

**Variables:**

- `NODE_ID` — Node ID of the validator to remove.

```bash
suzaku-cli kite-staking-manager initiate-validator-removal \
  $KITE_STAKING_MANAGER \
  $NODE_ID \
  --network kiteai
```

Optional: `--include-uptime-proof` to include an uptime proof.

Save the transaction hash.

```bash
export INIT_TX_HASH=0x...
```

### 6.2 Complete validator removal

```bash
suzaku-cli kite-staking-manager complete-validator-removal \
  $KITE_STAKING_MANAGER \
  $INIT_TX_HASH \
  --network kiteai
```

Optional: `--pchain-tx-private-key`, `--skip-wait-api`, `--node-id`, `--initiate-tx`.

## 7. Update staking config (admin)

If you have the appropriate admin role (e.g. owner) on the KiteStakingManager, you can update the global staking parameters: minimum/maximum stake amount, minimum stake duration, minimum delegation fee (bips), and maximum stake multiplier.

**Variables:**

- `MINIMUM_STAKE_AMOUNT`, `MAXIMUM_STAKE_AMOUNT` — in human-readable units (e.g. `0.5`, `100`).
- `MINIMUM_STAKE_DURATION` — in seconds.
- `MINIMUM_DELEGATION_FEE_BIPS` — basis points (e.g. `0`).
- `MAXIMUM_STAKE_MULTIPLIER` — integer (e.g. `5`).

```bash
suzaku-cli kite-staking-manager update-staking-config \
  $KITE_STAKING_MANAGER \
  <minimumStakeAmount> \
  <maximumStakeAmount> \
  <minimumStakeDuration> \
  <minimumDelegationFeeBips> \
  <maximumStakeMultiplier> \
  --network kiteai
```

## 8. Reward recipients and claiming

The KiteStakingManager contract supports:

- **changeValidatorRewardRecipient** — change the reward recipient for a validator (by validation ID).
- **changeDelegatorRewardRecipient** — change the reward recipient for a delegator (by delegation ID).
- **claimValidatorRewards** — claim pending validator rewards.
- **claimDelegatorRewards** — claim pending delegator rewards.

These are contract calls; the CLI does not currently expose dedicated subcommands for them. You can inspect **validator-info** and **delegator-info** to see current reward recipients and pending rewards, then call the contract directly (e.g. via cast or another tool) if needed.

## 9. Query commands (read-only)

These do not require a private key (no signing). Omit `--private-key` or use any account.

| Command            | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `info`             | Global configuration (staking config, validator manager, reward vault, etc.) |
| `validator-info`   | Full validator info by validation ID (owner, fee, uptime, pending rewards)  |
| `delegator-info`   | Full delegator info by delegation ID (status, weight, pending rewards)     |

Example:

```bash
suzaku-cli kite-staking-manager info $KITE_STAKING_MANAGER --network kiteai
suzaku-cli kite-staking-manager validator-info $KITE_STAKING_MANAGER <validationID> --network kiteai
suzaku-cli kite-staking-manager delegator-info $KITE_STAKING_MANAGER $DELEGATION_ID --network kiteai
```

Validation IDs and delegation IDs come from the **InitiatedStakingValidatorRegistration**, **InitiatedDelegatorRegistration**, and **CompletedDelegatorRegistration** events (or from the CLI output when you run the complete steps).

## Summary flow

1. Set `KITE_STAKING_MANAGER` and signer (e.g. `PK` or `-s`).
2. **info** — inspect global config (optional).
3. **initiate-validator-registration** → **complete-validator-registration** — register validator (BLS key + POP, stake amount in KITE).
4. **initiate-delegator-registration** → **complete-delegator-registration** — start delegation (save `DELEGATION_ID`).
5. **initiate-delegator-removal** → **complete-delegator-removal** — stop delegation.
6. **initiate-validator-removal** → **complete-validator-removal** — remove validator.

Use **info**, **validator-info**, and **delegator-info** to inspect state and IDs between steps. Use **update-staking-config** only if you have admin rights and need to change global staking parameters.
