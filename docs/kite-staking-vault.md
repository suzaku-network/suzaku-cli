# Staking Vault — Step-by-step guide

This document describes how to use the `staking-vault` subcommands (alias: `sv`) in the context of the **Kite AI** L1 blockchain. The StakingVault is a liquid-staking vault: **stakers deposit KITE and receive shares** (a liquid representation of their stake). Operators registered in the vault run validators and delegators on behalf of stakers. Rewards accrue to the vault and are shared between stakers, operators, and the protocol.

All commands support the [global options](../README.md#global-options) (`--network`, `--private-key` / `-s` / `--ledger`, etc.).

> **Note:** All `staking-vault` commands accept `--staking-vault-address <address>` to specify the StakingVault contract. It can also be set via the `STAKING_VAULT` environment variable (by default there is no need to set it on KiteAI mainnet and testnet as addresses are in the default `.env` files). The network is automatically switched to KiteAI (or KiteAI testnet when on Fuji).

## Prerequisites

- Suzaku CLI installed and linked (`pnpm link --global` so `suzaku-cli` is available).
- A signer: keystore secret via `-s <secret-name>` (recommended), or `--ledger` for a Ledger device.
- For P-Chain operations (validator/delegator complete steps), the signer must control a P-Chain address with enough **AVAX** for transaction fees (≈ 0.00005 AVAX per complete step).

## 1. Inspect the vault (read-only)

Get a complete picture of the vault state — no signer required.

```bash
# Full overview (combines all info commands)
suzaku-cli staking-vault full-info

# Individual info sections
suzaku-cli staking-vault info
suzaku-cli staking-vault fees-info
suzaku-cli staking-vault operators-info
suzaku-cli staking-vault validators-info
suzaku-cli staking-vault delegators-info
suzaku-cli staking-vault withdrawals-info
suzaku-cli staking-vault epoch-info

# Epoch queries
suzaku-cli staking-vault get-current-epoch
suzaku-cli staking-vault get-epoch-duration
suzaku-cli staking-vault get-next-epoch-start-time
```

## 2. Deposit KITE (staker)

Deposit KITE into the vault and receive **shares** in return. `minShares` is the minimum number of shares you expect (slippage protection); pass `0` to accept any amount.

```bash
suzaku-cli staking-vault deposit \
  100 \   # <amount in KITE>
  0 \     # <minShares>
  -s staker
```

## 3. Withdraw KITE (staker)

Withdrawal is a two-step process: **request** (returns a request ID), then **claim** once the epoch has processed the withdrawal.

### 3.1 Request withdrawal

Burn shares to queue a withdrawal. The request will be fulfilled when the vault processes the next epoch.

```bash
suzaku-cli staking-vault request-withdrawal \
  50 \    # <shares>
  -s staker
```

Note the **request ID** from the output, then claim:

### 3.2 Claim withdrawal

Once the epoch has been processed (see [section 9](#9-epoch-management-admin--keeper)), claim your KITE.

```bash
suzaku-cli staking-vault claim-withdrawal \
  1 \     # <requestId>
  -s staker
```

Permissionless variants (can be called by anyone on behalf of claimants):

```bash
# Claim a single request
suzaku-cli staking-vault claim-withdrawal-for 1   # <requestId>
  -s keeper

# Claim multiple requests in one transaction
suzaku-cli staking-vault claim-withdrawals-for 1 2 3   # <requestId...>
  -s keeper
```

If KITE was escrowed (e.g. a failed claim), use:

```bash
suzaku-cli staking-vault claim-escrowed-withdrawal \
  0x...   # <recipient>
  -s staker
```

## 4. Operator management (admin)

Operators are addresses that manage validators and delegators on behalf of the vault.

### 4.1 Add an operator

`allocationBips` is in basis points (e.g. `5000` = 50%).

```bash
suzaku-cli staking-vault add-operator \
  0x... \   # <operator>
  5000 \    # <allocationBips>
  0x... \   # <feeRecipient>
  -s admin
```

### 4.2 Update operator allocation

```bash
suzaku-cli staking-vault update-operator-allocations \
  0x... \   # <operator>
  5000 \    # <allocationBips>
  -s admin
```

### 4.3 Remove an operator

```bash
suzaku-cli staking-vault remove-operator \
  0x... \   # <operator>
  -s admin
```

## 5. Register a validator (operator)

Validator registration is a two-step process: **initiate** (locks stake from the vault), then **complete** (P-Chain registration + vault completion).

### 5.1 Initiate validator registration

```bash
suzaku-cli staking-vault initiate-validator-registration \
  NodeID-xxxxxxx \   # <nodeId>
  0xa089c9...6116 \                              # <blsKey>
  1000 \                                         # <stakeAmount in KITE>
  -s operator
```

Save the transaction hash from the output:

```bash
export INIT_TX_HASH=0x...
```

Optional: `--pchain-remaining-balance-owner-threshold`, `--pchain-disable-owner-threshold`, `--pchain-remaining-balance-owner-address`, `--pchain-disable-owner-address`.

### 5.2 Complete validator registration

```bash
suzaku-cli staking-vault complete-validator-registration \
  $INIT_TX_HASH \
  0xb715518... \   # <blsProofOfPossession>
  -s operator
```

Optional: `--pchain-tx-private-key`, `--initial-balance` (AVAX for continuous fee on P-Chain, default `0.01`), `--skip-wait-api`.

> **Getting Node ID and BLS keys:** see the [kite-staking-manager guide](./kite-staking-manager.md#getting-your-node-id-and-bls-keys).

## 6. Remove a validator (operator)

### 6.1 Initiate validator removal

```bash
suzaku-cli staking-vault initiate-validator-removal \
  NodeID-xxxxxxx \   # <nodeId>
  -s operator
```

Save the transaction hash:

```bash
export REMOVE_TX_HASH=0x...
```

### 6.2 Complete validator removal

```bash
suzaku-cli staking-vault complete-validator-removal \
  $REMOVE_TX_HASH \
  -s operator
```

Optional: `--pchain-tx-private-key`, `--skip-wait-api`, `--node-id <nodeId>...`, `--initiate-tx <initiateTx>`.

In an emergency, an admin can force-remove a validator without going through the two-step process:

```bash
suzaku-cli staking-vault force-remove-validator \
  NodeID-xxxxxxx \   # <nodeId>
  -s admin
```

## 7. Register a delegator (operator)

### 7.1 Initiate delegator registration

```bash
suzaku-cli staking-vault initiate-delegator-registration \
  NodeID-xxxxxxx \   # <nodeId>
  100 \                                          # <amount in KITE>
  -s operator
```

Save the transaction hash:

```bash
export INIT_TX_HASH=0x...
```

### 7.2 Complete delegator registration

`rpcUrl` is the base URL of the L1 RPC. The CLI appends the uptime blockchain path automatically.

```bash
suzaku-cli staking-vault complete-delegator-registration \
  $INIT_TX_HASH \
  https://rpc.kiteai.network \   # <rpcUrl with the correct api enabled>
  -s operator
```

Note the **delegation ID** from the output or from `delegators-info`:

```bash
export DELEGATION_ID=0x...
```

Optional: `--pchain-tx-private-key`.

## 8. Remove a delegator (operator)

### 8.1 Initiate delegator removal

```bash
suzaku-cli staking-vault initiate-delegator-removal \
  $DELEGATION_ID \
  -s operator
```

Save the transaction hash:

```bash
export REMOVE_TX_HASH=0x...
```

### 8.2 Complete delegator removal

```bash
suzaku-cli staking-vault complete-delegator-removal \
  $REMOVE_TX_HASH \
  -s operator
```

Optional: `--pchain-tx-private-key`, `--skip-wait-api`, `--delegation-id <delegationID>...`, `--initiate-tx <initiateTx>`.

In an emergency, an admin can force-remove a delegator:

```bash
suzaku-cli staking-vault force-remove-delegator \
  $DELEGATION_ID \
  -s admin
```

## 9. Epoch management (admin / keeper)

The vault operates in epochs. At the end of each epoch, the keeper calls **process-epoch** to fulfil pending withdrawals and update balances. Rewards must also be harvested before processing.

```bash
# Harvest all pending rewards (validators + delegators)
suzaku-cli staking-vault harvest -s keeper

# Harvest validator rewards in batches (operatorIndex, start validator index, validator batch size)
suzaku-cli staking-vault harvest-validators 0 0 50 -s keeper   # <operatorIndex> <start> <batchSize>

# Harvest delegator rewards in batches (operatorIndex, start delegator index, delegator batch size)
suzaku-cli staking-vault harvest-delegators 0 0 50 -s keeper   # <operatorIndex> <start> <batchSize>

# Prepare withdrawals (initiates stake removals to cover pending withdrawal requests)
suzaku-cli staking-vault prepare-withdrawals -s keeper

# Process the current epoch (fulfils pending withdrawals)
suzaku-cli staking-vault process-epoch -s keeper
```

## 10. Fee management (admin)

```bash
# Operator claims their own fees
suzaku-cli staking-vault claim-operator-fees -s operator

# Admin force-claims fees for a specific operator
suzaku-cli staking-vault force-claim-operator-fees \
  0x... \   # <operator>
  -s admin

# Admin claims pending protocol fees
suzaku-cli staking-vault claim-pending-protocol-fees -s admin
```

## 11. Pause / Unpause (admin)

```bash
suzaku-cli staking-vault pause   -s admin
suzaku-cli staking-vault unpause -s admin
```

## Summary flow

### Staker flow

1. **deposit** `<amount> <minShares>` — deposit KITE, receive shares.
2. **request-withdrawal** `<shares>` — queue a withdrawal (note `REQUEST_ID`).
3. Wait for the keeper to run **process-epoch**.
4. **claim-withdrawal** `<requestId>` — receive KITE.

### Operator flow

1. Admin: **add-operator** with allocation and fee recipient.
2. **initiate-validator-registration** → **complete-validator-registration** — register validators.
3. **initiate-delegator-registration** → **complete-delegator-registration** — register delegators.
4. Keeper: **harvest** / **harvest-validators** / **harvest-delegators** — collect rewards before each epoch.
5. Keeper: **prepare-withdrawals** → **process-epoch** — fulfill pending withdrawals each epoch.
6. **initiate-delegator-removal** → **complete-delegator-removal** — remove delegators when done.
7. **initiate-validator-removal** → **complete-validator-removal** — remove validators when done.
8. **claim-operator-fees** — claim accumulated operator fees.

Use **info**, **operators-info**, **validators-info**, **delegators-info**, **withdrawals-info**, and **epoch-info** to inspect state between steps.
