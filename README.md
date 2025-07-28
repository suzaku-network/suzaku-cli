# Suzaku CLI

A simple CLI tool to interact with Suzaku core smart contracts on the Fuji network. The commands let you register L1s, set up vaults, register operators, handle deposits/withdrawals, and perform middleware operations.

> **Note:**  
> - The default usage is aimed at launching on Fuji.  
---

## Table of Contents

- [Suzaku CLI](#suzaku-cli)
- [Table of Contents](#table-of-contents)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Usage on Fuji](#usage-on-fuji)
  - [L1 Setup Sequence on Fuji](#l1-setup-sequence-on-fuji)
- [Commands Reference](#commands-reference)
  - [L1 Registry Commands](#l1-registry-commands)
  - [Operator Registry Commands](#operator-registry-commands)
  - [Vault Manager Commands](#vault-manager-commands)
  - [Vault Deposit/Withdraw/Claim Commands](#vault-depositwithdrawclaim-commands)
  - [L1RestakeDelegator Commands](#l1restakedelegator-commands)
  - [Middleware Commands](#middleware-commands)
    - [Operator-Related Actions](#operator-related-actions)
    - [Node Operations](#node-operations)
    - [Weight Update & Caching](#weight-update--caching)
    - [Middleware Read Operations](#middleware-read-operations)
  - [Operator → L1 Opt-In/Opt-Out Commands](#operator--l1-opt-inopt-out-commands)
  - [Operator → Vault Opt-In/Opt-Out Commands](#operator--vault-opt-inopt-out-commands)
  - [Balancer Commands](#balancer-commands)
  - [Utility Commands](#utility-commands)
  - [Uptime Tracking Commands](#uptime-tracking-commands)
  - [Rewards Commands](#rewards-commands)
  - [Secret Commands](#secret-commands)

## Requirements

- Node.js (v16+ recommended)
- pnpm package manager (or npm/yarn)
- [cast](https://book.getfoundry.sh/reference/cast) for token minting/approval commands (optional)

---


## Installation

1. **Clone the repository and navigate to it:**

   ```bash
   git clone https://github.com/suzaku-network/suzaku-cli
   cd suzaku-cli
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

---

## Environment Setup

1. **Identify the required addresses and credentials:**

The specific commands and required information (such as contract addresses and private keys) will vary depending on your role—Operator, Curator, or L1. Ensure you have the relevant contract addresses and credentials prepared before proceeding.

## Usage on Fuji

When deploying on Fuji, run commands using the `fuji` network parameter. For example:

```bash
pnpm cli --network fuji --private-key $PK register-l1 $BALANCER_VALIDATOR_MANAGER $MIDDLEWARE https://l1.com
```


### L1 Setup Sequence on Fuji

- **L1 & Vault Registration:**

  ```bash
  pnpm cli --network fuji --private-key $L1_OWNER register-l1 $BALANCER_VALIDATOR_MANAGER $MIDDLEWARE https://l1.com
  pnpm cli --network fuji --private-key $L1_OWNER vault-manager-register-vault-l1 $VAULT_MANAGER $VAULT 1 200000000000000000000000
  ```

- **(Optional) Modify L1 Middleware:**

  ```bash
  # Update the middleware associated with a registered L1
  pnpm cli --network fuji --private-key $L1_OWNER set-l1-middleware $BALANCER_VALIDATOR_MANAGER $MIDDLEWARE
  ```

- **Operator Setup & Opt-In:**

  ```bash
  pnpm cli --network fuji --private-key $OPERATOR_OWNER register-operator https://operator1.com
  pnpm cli --network fuji --private-key $OPERATOR_OWNER opt-in-l1 $BALANCER_VALIDATOR_MANAGER
  pnpm cli --network fuji check-opt-in-l1 $OPERATOR $BALANCER_VALIDATOR_MANAGER
  pnpm cli --network fuji --private-key $OPERATOR_OWNER opt-in-vault $VAULT
  pnpm cli --network fuji check-opt-in-vault $OPERATOR $VAULT
  ```

- **Set Limits & Operator Shares:**

  ```bash
  pnpm cli --network fuji --private-key $L1_OWNER set-l1-limit $DELEGATOR $BALANCER_VALIDATOR_MANAGER 100000000000000000000000 1
  pnpm cli --network fuji --private-key $L1_OWNER set-operator-l1-shares $DELEGATOR $BALANCER_VALIDATOR_MANAGER $OPERATOR 10 1
  ```

- **(Optional) Mint & Approve sAVAX, Then Deposit via `cast`**
   1. Mint:
      ```bash
      cast send "$SAVAX" "mint(address,uint256)" "$STAKER" 50000000000000000000000 \
        --rpc-url $RPC_URL \
        --private-key "$CURATOR_OWNER"
      ```
   2. Check allowance:
      ```bash
      cast call "$SAVAX" "allowance(address,address)" "$STAKER" "$PRIMARY_ASSET" \
      --rpc-url $RPC_URL
      ```
   3. Approve:
      ```bash
      cast send "$SAVAX" "approve(address,uint256)" "$PRIMARY_ASSET" 200000000000000000000 \
        --rpc-url $RPC_URL \
        --private-key "$STAKER_OWNER"
      ```
   4. Deposit on Vault's `deposit(address,uint256)`:
      ```bash
      cast send $PRIMARY_ASSET "deposit(address,uint256)" "$STAKER" 200000000000000000000 \
        --rpc-url $RPC_URL \
        --private-key "$STAKER_OWNER"
      ```

- **Deposits / Withdrawals / Claims:**

  ```bash
  pnpm cli --network fuji --private-key $STAKER_OWNER deposit $VAULT 400
  pnpm cli --network fuji --private-key $STAKER_OWNER withdraw $VAULT 100
  pnpm cli --network fuji --private-key $STAKER_OWNER claim $VAULT 100
  ```
  
- **Check Stakes & Epochs**
   ```bash
   pnpm cli --network fuji opstakes $VAULT_MANAGER $OPERATOR
   pnpm cli --network fuji middleware-get-current-epoch $MIDDLEWARE
   pnpm cli --network fuji middleware-register-operator $MIDDLEWARE $OPERATOR --private-key $L1_OWNER
   pnpm cli --network fuji middleware-operator-cache $MIDDLEWARE <current-epoch> 1 --private-key $L1_OWNER
   pnpm cli --network fuji middleware-get-operator-stake $MIDDLEWARE $OPERATOR <current-epoch> 1
   ```

- **Balancer / Security Module Setup**
    ```bash
    pnpm cli --network fuji balancer-set-up-security-module $BALANCER_VALIDATOR_MANAGER $MIDDLEWARE 200000 --private-key $L1_OWNER
    pnpm cli --network fuji balancer-get-security-modules $BALANCER_VALIDATOR_MANAGER
    ```

- **Check Epoch Information**
    ```bash
    pnpm cli --network fuji middleware-get-current-epoch $MIDDLEWARE
    pnpm cli --network fuji middleware-operator-cache $MIDDLEWARE <current-epoch> 1 --private-key $L1_OWNER
    pnpm cli --network fuji middleware-get-operator-stake $MIDDLEWARE $OPERATOR <next-epoch> 1
    ```

- **Initialize and Complete Node Addition**
    ```bash
    pnpm cli --network fuji middleware-add-node $MIDDLEWARE $NODE_ID $BLS_KEY --private-key $OPERATOR_OWNER

    pnpm cli --network fuji middleware-complete-validator-registration \
      $MIDDLEWARE \
      $OPERATOR \
      $NODE_ID \
      $ADD_NODE_TX_HASH \
      $BLS_PROOF_OF_POSSESSION \
      --private-key $OPERATOR_OWNER
    ```

### Rewards Testing Sequence

Here's a recommended sequence of commands to test the rewards functionality:

1. **Initial Setup and Configuration**
   ```bash
   # Check current fees configuration
   pnpm cli --network fuji rewards-get-fees-config $REWARDS

   # Set appropriate fees if needed
   pnpm cli --network fuji --private-key $CURATOR_OWNER rewards-update-protocol-fee $REWARDS 1000
   pnpm cli --network fuji --private-key $CURATOR_OWNER rewards-update-operator-fee $REWARDS 2000
   pnpm cli --network fuji --private-key $CURATOR_OWNER rewards-update-curator-fee $REWARDS 500

   # Configure minimum required uptime
   pnpm cli --network fuji rewards-get-min-uptime $REWARDS
   pnpm cli --network fuji --private-key $CURATOR_OWNER rewards-set-min-uptime $REWARDS 3000

   # Set rewards share for collateral classes
   pnpm cli --network fuji --private-key $CURATOR_OWNER rewards-set-share-asset-class $REWARDS 1 5000
   ```

1.1. **Mint & Approve Reward Tokens**
   ```bash
   # Mint reward tokens to the admin
   cast send "$SAVAX" "mint(address,uint256)" "$L1_OWNER_ADDRESS" 10000000000000000000000000 \
     --rpc-url $RPC_URL \
     --private-key "$CURATOR_OWNER"
   
   # Check balance
   cast call "$SAVAX" "balanceOf(address)" "$L1_OWNER_ADDRESS" \
     --rpc-url $RPC_URL
     
   # Check current allowance
   cast call "$SAVAX" "allowance(address,address)" "$L1_OWNER_ADDRESS" "$REWARDS" \
     --rpc-url $RPC_URL
     
   # Approve reward tokens to be used by the rewards contract
   cast send "$SAVAX" "approve(address,uint256)" "$REWARDS" 10000000000000000000000000 \
     --rpc-url $RPC_URL \
     --private-key "$L1_OWNER"
   ```
   
   > **Note:** Make sure `$SAVAX` in this step corresponds to the same token address you plan to use as `$SAVAX` in the next step. The admin account needs a sufficient balance and allowance for the rewards contract to transfer tokens during the rewards allocation process.

2. **Allocate Rewards**
   ```bash
   # Set rewards amount for the epochs you want to test (using REWARDS_TOKEN variable)
   pnpm cli --network fuji --private-key $L1_OWNER rewards-set-amount $REWARDS 99 5 $REWARDS_TOKEN 1000000000000000000

   # Verify rewards allocation
   pnpm cli --network fuji rewards-get-amounts $REWARDS 99
   ```

3. **Distribute Rewards**
   ```bash
   # Distribute rewards for epoch 99 with batch size 10
   pnpm cli --network fuji --private-key $L1_OWNER rewards-distribute $REWARDS 99 10

   # Check distribution status
   pnpm cli --network fuji rewards-get-distribution-batch $REWARDS 99

   # Continue distribution if not complete
   pnpm cli --network fuji --private-key $L1_OWNER rewards-distribute $REWARDS 99 10
   ```

4. **Verify Shares Calculation**
   ```bash
   # Check operator shares
   pnpm cli --network fuji rewards-get-operator-shares $REWARDS 99 $OPERATOR

   # Check vault shares
   pnpm cli --network fuji rewards-get-vault-shares $REWARDS 99 $VAULT

   # Check curator shares
   pnpm cli --network fuji rewards-get-curator-shares $REWARDS 99 $CURATOR
   ```

5. **Claim Rewards**
   ```bash
   # Claim operator fees
   pnpm cli --network fuji --private-key $OPERATOR_KEY rewards-claim-operator-fee $REWARDS $REWARDS_TOKEN

   # Claim staker rewards
   pnpm cli --network fuji --private-key $STAKER_KEY rewards-claim $REWARDS $REWARDS_TOKEN

   # Claim curator fees
   pnpm cli --network fuji --private-key $CURATOR_KEY rewards-claim-curator-fee $REWARDS $REWARDS_TOKEN

   # Claim protocol fees
   pnpm cli --network fuji --private-key $PROTOCOL_OWNER rewards-claim-protocol-fee $REWARDS $REWARDS_TOKEN
   ```

6. **Verify Claim Status**
   ```bash
   # Check last claimed epoch for operator
   pnpm cli --network fuji rewards-get-last-claimed-operator $REWARDS $OPERATOR

   # Check last claimed epoch for staker
   pnpm cli --network fuji rewards-get-last-claimed-staker $REWARDS $STAKER

   # Check last claimed epoch for curator
   pnpm cli --network fuji rewards-get-last-claimed-curator $REWARDS $CURATOR

   # Check last claimed epoch for protocol owner
   pnpm cli --network fuji rewards-get-last-claimed-protocol $REWARDS $PROTOCOL_OWNER
   ```

7. **Claim Undistributed Rewards (if applicable)**
   ```bash
   # This should be done after epoch 99+2 to ensure all claims are done
   pnpm cli --network fuji --private-key $L1_OWNER rewards-claim-undistributed $REWARDS 99 $REWARDS_TOKEN
   ```

### Secret Commands

The following commands allow you to manage the cli secrets keystore. Under the wood, it uses [pass](https://www.passwordstore.org/), the standard unix password manager.
It's a mandatory dependency when working on the mainnet with this cli.

1. **Initialize cli keystore**
   ```bash
   # Acquire available gpg key ids
   pnpm cli secret list-gpg-ids
   > [suzabro@domain.com
   > avabro@domain.com]
   # Initialize the keystore using the ids that are supposed to interact with.
   pnpm cli secret init suzabro@domain.com avabro@domain.com ...
   ```

2. **Create new secret**
   ```bash
   pnpm cli secret create operator $OPERATOR_PK
   ```

3. **Use your secret name instead of raw private key**
   ```bash
   pnpm cli middleware-add-node $L1_MIDDLEWARE $NODE_ID $BLS_KEY -s operator
   ```
   You'll be prompted like using [pass](https://www.passwordstore.org/) normally and it will use the underlying private key

4. **List all available secrets**
   ```bash
   pnpm cli secret list
   > Available secrets:
   > .password-store
   > └── operator
   ```

5. **Remove a secret**
   ```bash
   pnpm cli secret rm operator
   ```

For a complete list of commands, see the [Commands Reference](#commands-reference) below.

---

## Commands Reference

Run the help command for a full listing of available commands and options:

```bash
pnpm cli --help
```
## Command Reference

Below is a complete list of all commands available in the Suzaku CLI tool. Global options (such as `--private-key` and `--network`) apply to every command. Use `pnpm cli --help` for more details on each command.

---

### L1 Registry Commands

- **register-l1 `<validatorManager>` `<l1Middleware>` `<metadataUrl>`**  
  Registers a new L1 by linking a validator manager and L1 middleware and setting a metadata URL.
- **get-l1s**  
  Lists all registered L1s.
- **set-l1-metadata-url `<l1Address>` `<metadataUrl>`**  
  Updates the metadata URL for a registered L1.
- **set-l1-middleware `<l1Address>` `<l1Middleware>`**  
  Updates the middleware associated with a registered L1.

---

### Operator Registry Commands

- **register-operator `<metadataUrl>`**  
  Registers an operator using the provided metadata URL.
- **get-operators**  
  Lists all registered operators.

---

### Vault Manager Commands

- **vault-manager-register-vault-l1 `<middlewareVaultManager>` `<vaultAddress>` `<collateralClass>` `<maxLimit>`**  
  Registers a vault for an L1 with the given parameters.
- **vault-manager-update-vault-max-l1-limit `<middlewareVaultManager>` `<vaultAddress>` `<collateralClass>` `<maxLimit>`**  
  Updates the maximum L1 limit of a registered vault.
- **vault-manager-remove-vault `<middlewareVaultManager>` `<vaultAddress>`**  
  Removes a registered vault.
- **get-vault-count `<middlewareVaultManager>`**  
  Retrieves the total number of registered vaults.
- **get-vault-at-with-times `<middlewareVaultManager>` `<index>`**  
  Returns vault details at a specified index, including related timestamps.
- **get-vault-asset-class `<middlewareVaultManager>` `<vaultAddress>`**  
  Returns the collateral class associated with the given vault.

---

### Vault Deposit/Withdraw/Claim Commands

- **deposit `<vaultAddress>` `<amount>` [--onBehalfOf `<address>`]**  
  Deposits the specified amount into the vault. Optionally, deposit on behalf of another address.
- **withdraw `<vaultAddress>` `<amount>` [--claimer `<address>`]**  
  Withdraws the specified amount from the vault. Optionally, designate a different claimer address.
- **claim `<vaultAddress>` `<epoch>` [--recipient `<address>`]**  
  Claims withdrawal for a specific epoch. Optionally, specify the recipient address.

---

### L1RestakeDelegator Commands

- **set-l1-limit `<delegatorAddress>` `<l1Address>` `<limit>` `<collateralClass>`**  
  Sets the staking limit for the given L1 address within a delegator.
- **set-operator-l1-shares `<delegatorAddress>` `<l1Address>` `<operatorAddress>` `<shares>` `<collateralClass>`**  
  Sets the share allocation for an operator under the given L1 in the delegator contract.

---

### Middleware Commands

#### Operator-Related Actions

- **middleware-register-operator `<middlewareAddress>` `<operator>`**  
  Registers an operator in the middleware.
- **middleware-disable-operator `<middlewareAddress>` `<operator>`**  
  Disables an operator in the middleware.
- **middleware-remove-operator `<middlewareAddress>` `<operator>`**  
  Removes an operator from the middleware.
- **middleware-get-all-operators `<middlewareAddress>`**  
  Lists all operators registered in the middleware.

#### Node Operations

- **middleware-add-node `<middlewareAddress>` `<nodeId>` `<blsKey>` [--initial-stake `<initialStake>`] [--registration-expiry `<expiry>`] [--pchain-remaining-balance-owner-threshold `<threshold>`] [--pchain-disable-owner-threshold `<threshold>`] [--pchain-remaining-balance-owner-address `<address>`...] [--pchain-disable-owner-address `<address>`...]**  
  Adds a node with its BLS key. Options include setting the initial stake (default: 0), registration expiry (default: now + 12 hours), P-Chain thresholds, and owner addresses.
- **middleware-complete-validator-registration `<middlewareAddress>` `<operator>` `<nodeId>` `<addNodeTxHash>` `<blsProofOfPossession>` [--pchain-tx-private-key `<pchainTxPrivateKey>`] [--initial-balance `<initialBalance>`]**  
  Completes validator registration for a given node. Includes the transaction hash from the add-node operation and BLS proof of possession. Optionally specify a P-Chain transaction private key and initial balance (default: 0.1 AVAX).
- **middleware-remove-node `<middlewareAddress>` `<nodeId>`**  
  Removes a node from the middleware.
- **middleware-complete-validator-removal `<middlewareAddress>` `<nodeId>` `<removeNodeTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>`]**  
  Completes the validator removal process, specifying the transaction hash from the removal operation.

#### Weight Update & Caching

- **middleware-init-stake-update `<middlewareAddress>` `<nodeId>` `<newStake>`**  
  Initiates a node stake update.
- **middleware-complete-stake-update `<middlewareAddress>` `<nodeId>` `<validatorStakeUpdateTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>`]**  
  Completes a node's stake update.
- **middleware-operator-cache `<middlewareAddress>` `<epoch>` `<collateralClass>`**  
  Caches operator stakes for a specified epoch and collateral class.
- **middleware-calc-node-stakes `<middlewareAddress>`**  
  Calculates and caches node stakes for all operators.
- **middleware-force-update-nodes `<middlewareAddress>` `<operator>` [--limit-stake `<stake>`]**  
  Forces an update of nodes for an operator with an optional stake limit (default: 0).

#### Middleware Read Operations

- **middleware-get-operator-stake `<middlewareAddress>` `<operator>` `<epoch>` `<collateralClass>`**  
  Retrieves the stake of an operator for the specified epoch and collateral class.
- **middleware-get-current-epoch `<middlewareAddress>`**  
  Returns the current epoch.
- **middleware-get-epoch-start-ts `<middlewareAddress>` `<epoch>`**  
  Retrieves the start timestamp for the given epoch.
- **middleware-get-active-nodes-for-epoch `<middlewareAddress>` `<operator>` `<epoch>`**  
  Retrieves the active nodes for an operator during a specific epoch.
- **middleware-get-operator-nodes-length `<middlewareAddress>` `<operator>`**  
  Returns the number of nodes associated with an operator.
- **middleware-get-node-stake-cache `<middlewareAddress>` `<epoch>` `<validatorId>`**  
  Fetches the cached stake for a node (validator) for a given epoch.
- **middleware-get-operator-locked-stake `<middlewareAddress>` `<operator>`**  
  Retrieves the locked stake for the operator.
- **middleware-node-pending-removal `<middlewareAddress>` `<validatorId>`**  
  Checks if a node is pending removal.
- **middleware-node-pending-update `<middlewareAddress>` `<validatorId>`**  
  Checks if a node is pending an update. (Note: Currently not available in the contract - placeholder for future versions)
- **middleware-get-operator-used-stake `<middlewareAddress>` `<operator>`**  
  Retrieves the used stake for an operator.

---

### Operator → L1 Opt-In/Opt-Out Commands

- **opt-in-l1 `<l1Address>`**  
  Operator opts in to a specified L1.
- **opt-out-l1 `<l1Address>`**  
  Operator opts out from a specified L1.
- **check-opt-in-l1 `<operator>` `<l1Address>`**  
  Checks whether the operator is opted in to the given L1.

---

### Operator → Vault Opt-In/Opt-Out Commands

- **opt-in-vault `<vaultAddress>`**  
  Operator opts in to a specified vault.
- **opt-out-vault `<vaultAddress>`**  
  Operator opts out from a specified vault.
- **check-opt-in-vault `<operator>` `<vaultAddress>`**  
  Checks whether the operator is opted in to the specified vault.

---

### Balancer Commands

- **balancer-set-up-security-module `<balancerValidatorManagerAddress>` `<middlewareAddress>` `<maxWeight>`**  
  Sets up a security module with the given parameters and maximum weight.
- **balancer-get-security-modules `<balancerValidatorManagerAddress>`**  
  Retrieves the list of security modules for the specified balancer validator manager.
- **balancer-get-security-module-weights `<securityModule>`**  
  Retrieves weight details for the specified security module.

---

### Utility Commands

- **opstakes `<middlewareVaultManager>` `<operatorAddress>`**  
  Shows operator stakes across L1s, enumerating each L1 the operator is opted into.
- **get-validation-uptime-message `<rpcUrl>` `<chainId>` `<nodeId>`**  
  Gets the validation uptime message for a given validator in the specified L1 RPC.
- **help [command]**  
  Displays help information for a specific command or the entire CLI.

---

### Uptime Tracking Commands

- **get-validation-uptime-message `<rpcUrl>` `<chainId>` `<nodeId>`**  
  Gets the validation uptime message for a given validator in the specified L1 RPC.
- **compute-validator-uptime `<uptimeTrackerAddress>` `<signedUptimeHex>`**
  Computes validator uptime based on the signed uptime message.
- **report-uptime-validator `<rpcUrl>` `<sourceChainId>` `<nodeId>` `<uptimeTrackerAddress>`**
  Gets a validator's signed uptime message and submits it to the UptimeTracker contract.

---

### Rewards Commands

The following commands allow you to interact with the Rewards contract, which distributes, calculates, and tracks rewards across stakeholders in the Suzaku protocol.

#### Rewards Distribution and Claiming

- **rewards-distribute `<rewardsAddress>` `<epoch>` `<batchSize>`**  
  Distribute rewards for a specific epoch, processing a batch of operators.
- **rewards-claim `<rewardsAddress>` `<rewardsToken>` [--recipient `<recipient>`]**  
  Claim rewards for a staker. Optionally specify the recipient address.
- **rewards-claim-operator-fee `<rewardsAddress>` `<rewardsToken>` [--recipient `<recipient>`]**  
  Claim operator fees. Optionally specify the recipient address.
- **rewards-claim-curator-fee `<rewardsAddress>` `<rewardsToken>` [--recipient `<recipient>`]**  
  Claim curator fees. Optionally specify the recipient address.
- **rewards-claim-protocol-fee `<rewardsAddress>` `<rewardsToken>` [--recipient `<recipient>`]**  
  Claim protocol fees (only for protocol owner). Optionally specify the recipient address.
- **rewards-claim-undistributed `<rewardsAddress>` `<epoch>` `<rewardsToken>` [--recipient `<recipient>`]**  
  Claim undistributed rewards for an epoch (admin only). Optionally specify the recipient address.

#### Rewards Configuration

- **rewards-set-amount `<rewardsAddress>` `<startEpoch>` `<numberOfEpochs>` `<rewardsToken>` `<rewardsAmount>`**  
  Set rewards amount for a range of epochs.
- **rewards-set-share-asset-class `<rewardsAddress>` `<collateralClass>` `<share>`**  
  Set rewards share for an collateral class (in basis points, 100 = 1%).
- **rewards-set-min-uptime `<rewardsAddress>` `<minUptime>`**  
  Set minimum required uptime for rewards eligibility (in seconds).
- **rewards-set-admin `<rewardsAddress>` `<newAdmin>`**  
  Set admin role (DEFAULT_ADMIN_ROLE only).
- **rewards-set-protocol-owner `<rewardsAddress>` `<newOwner>`**  
  Set protocol owner (DEFAULT_ADMIN_ROLE only).
- **rewards-update-protocol-fee `<rewardsAddress>` `<newFee>`**  
  Update protocol fee (in basis points, 100 = 1%).
- **rewards-update-operator-fee `<rewardsAddress>` `<newFee>`**  
  Update operator fee (in basis points, 100 = 1%).
- **rewards-update-curator-fee `<rewardsAddress>` `<newFee>`**  
  Update curator fee (in basis points, 100 = 1%).

#### Rewards Queries

- **rewards-get-amounts `<rewardsAddress>` `<epoch>`**  
  Get rewards amounts per token for an epoch.
- **rewards-get-amount-for-token `<rewardsAddress>` `<epoch>` `<token>`**  
  Get rewards amount for a specific token and epoch.
- **rewards-get-operator-shares `<rewardsAddress>` `<epoch>` `<operator>`**  
  Get operator shares for a specific epoch.
- **rewards-get-vault-shares `<rewardsAddress>` `<epoch>` `<vault>`**  
  Get vault shares for a specific epoch.
- **rewards-get-curator-shares `<rewardsAddress>` `<epoch>` `<curator>`**  
  Get curator shares for a specific epoch.
- **rewards-get-protocol-rewards `<rewardsAddress>` `<token>`**  
  Get protocol rewards for a token.
- **rewards-get-distribution-batch `<rewardsAddress>` `<epoch>`**  
  Get distribution batch status for an epoch.
- **rewards-get-fees-config `<rewardsAddress>`**  
  Get current fees configuration.
- **rewards-get-share-asset-class `<rewardsAddress>` `<collateralClass>`**  
  Get rewards share for collateral class.
- **rewards-get-min-uptime `<rewardsAddress>`**  
  Get minimum required uptime for rewards eligibility.
- **rewards-get-last-claimed-staker `<rewardsAddress>` `<staker>`**  
  Get last claimed epoch for a staker.
- **rewards-get-last-claimed-operator `<rewardsAddress>` `<operator>`**  
  Get last claimed epoch for an operator.
- **rewards-get-last-claimed-curator `<rewardsAddress>` `<curator>`**  
  Get last claimed epoch for a curator.
- **rewards-get-last-claimed-protocol `<rewardsAddress>` `<protocolOwner>`**  
  Get last claimed epoch for protocol owner.

---

*Bullet Points for Clarification:*
- Global options like `--private-key` and `--network` are inherited by every command.
- Optional flags are shown in square brackets and have default values where applicable.
- Numeric inputs are processed as BigInt values when needed.

For further details on options and examples for each command, run:

```bash
pnpm cli --help
```
