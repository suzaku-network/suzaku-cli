# Suzaku CLI

A simple CLI tool to interact with Suzaku core smart contracts on the Fuji network. The commands let you register L1, set up vaults, register operators, handle deposits/withdrawals, and perform middleware operations.

> **Note:**  
> - The default current usage is aimed at launching on Fuji.  
> - For testing parts of the protocol locally, you can use the provided Anvil script (`scripts/anvil.sh`).

---

## Table of Contents

- [Suzaku CLI](#suzaku-cli)
  - [Table of Contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Usage on Fuji](#usage-on-fuji)
    - [L1 Setup Sequence on Fuji](#l1-setup-sequence-on-fuji)
  - [Testing on Anvil](#testing-on-anvil)
  - [Commands Reference](#commands-reference)
  - [Command Reference](#command-reference)
    - [L1 Registry Commands](#l1-registry-commands)
    - [Operator Registry Commands](#operator-registry-commands)
    - [Vault Manager Commands](#vault-manager-commands)
    - [Vault Deposit/Withdraw/Claim Commands](#vault-depositwithdrawclaim-commands)
    - [L1RestakeDelegator Commands](#l1restakedelegator-commands)
    - [Middleware Commands](#middleware-commands)
      - [Operator-Related Actions](#operator-related-actions)
      - [Node Operations](#node-operations)
      - [Weight Update \& Caching](#weight-update--caching)
      - [Middleware Read Operations](#middleware-read-operations)
    - [Operator → L1 Opt-In/Opt-Out Commands](#operator--l1-opt-inopt-out-commands)
    - [Operator → Vault Opt-In/Opt-Out Commands](#operator--vault-opt-inopt-out-commands)
    - [Balancer Commands](#balancer-commands)
    - [Utility Commands](#utility-commands)

## Requirements

- Node.js (v16+ recommended)
- pnpm package manager (or npm/yarn)
- [Anvil](https://book.getfoundry.sh/tutorials/anvil) if you want to test locally (default port: 8545)
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

1. **Configure Environment Variables:**

   Copy the example file and edit accordingly:

   ```bash
   cp .env.example .env
   ```

   **Key variables to update:**

   - **Owners & Roles Private Keys:**
     `CURATOR_OWNER`, `L1_OWNER`, `OPERATOR_OWNER`, `STAKER_OWNER`
   - **Contract Addresses:**  
     `BALANCER_BALANCER_VALIDATOR_MANAGER_FUJI`, `VAULT_MANAGER_FUJI`, `BALANCER_VALIDATOR_MANAGER_FUJI`, `VAULT`, etc.
   - **Network Variables:**  
     For Fuji, `https://api.avax-test.network/ext/bc/C/rpc`  
     *The Anvil script uses `RPC_URL=http://127.0.0.1:8545` by default.*

2. **Ensure that the environment variables match your intended network settings (Fuji for production/test deployment, or Anvil for local testing). This is not intended for a production environment**


## Usage on Fuji

When deploying on Fuji, run commands using the `fuji` network parameter. For example:

```bash
pnpm cli --network fuji --private-key $PK register-l1 $BALANCER_VALIDATOR_MANAGER_FUJI $VAULT_MANAGER_FUJI https://l1.com
```


### L1 Setup Sequence on Fuji

- **L1 & Vault Registration:**

  ```bash
  pnpm cli --network fuji --private-key $L1_OWNER register-l1 $BALANCER_VALIDATOR_MANAGER_FUJI $VAULT_MANAGER_FUJI https://l1.com
  pnpm cli --network fuji --private-key $L1_OWNER vault-manager-register-vault-l1 $VAULT_MANAGER_FUJI $VAULT 1 200000000000000000000000
  ```

- **Operator Setup & Opt-In:**

  ```bash
  pnpm cli --network fuji --private-key $OPERATOR_OWNER register-operator https://operator1.com
  pnpm cli --network fuji --private-key $OPERATOR_OWNER opt-in-l1 $BALANCER_VALIDATOR_MANAGER_FUJI
  pnpm cli --network fuji check-opt-in-l1 $OPERATOR $BALANCER_VALIDATOR_MANAGER_FUJI
  pnpm cli --network fuji --private-key $OPERATOR_OWNER opt-in-vault $VAULT
  pnpm cli --network fuji check-opt-in-vault $OPERATOR $VAULT
  ```

- **Set Limits & Operator Shares:**

  ```bash
  pnpm cli --network fuji --private-key $L1_OWNER set-l1-limit $DELEGATOR $BALANCER_VALIDATOR_MANAGER_FUJI 100000000000000000000000 1
  pnpm cli --network fuji --private-key $L1_OWNER set-operator-l1-shares $DELEGATOR $BALANCER_VALIDATOR_MANAGER_FUJI $OPERATOR 10 1
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
   pnpm cli --network fuji opstakes $VAULT_MANAGER_FUJI $OPERATOR
   pnpm cli --network fuji middleware-get-current-epoch $MIDDLEWARE
   pnpm cli --network fuji middleware-register-operator $MIDDLEWARE $OPERATOR --private-key $L1_OWNER
   pnpm cli --network fuji middleware-operator-cache $MIDDLEWARE <current-epoch> 1 --private-key $L1_OWNER
   pnpm cli --network fuji middleware-get-operator-stake $MIDDLEWARE $OPERATOR <current-epoch> 1
   ```

- **Balancer / Security Module Setup**
    ```bash
    pnpm cli --network fuji balancer-set-up-security-module $BALANCERVALIDATORMANAGER $MIDDLEWARE 200000 --private-key $L1_OWNER
    pnpm cli --network fuji balancer-get-security-modules $BALANCERVALIDATORMANAGER
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

For a complete list of commands, see the [Commands Reference](#commands-reference) below.

---


## Testing on Anvil

If you wish to test the commands on a local Anvil network, use the provided script:

```bash
set -a
source env.anvil
./scripts/anvil.sh
```

This script:

- Sets up example environment variables.
- Deploys contracts Suzaku-collateral and Suzaku-core. For this you will need to clone [suzaku-deployments.](https://github.com/suzaku-network/suzaku-deployments) and reference the path in env.anvil
- Executes a sequence of TS CLI commands on your local anvil chain.

*Bullet points for clarification:*
- The Anvil script is provided as an example of how to run the sequence locally.
- It mimics the Fuji commands while using local endpoints (e.g., `RPC_URL=http://127.0.0.1:8545`).

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

---

### Operator Registry Commands

- **register-operator `<metadataUrl>`**  
  Registers an operator using the provided metadata URL.
- **get-operators**  
  Lists all registered operators.

---

### Vault Manager Commands

- **vault-manager-register-vault-l1 `<middlewareVaultManager>` `<vaultAddress>` `<assetClass>` `<maxLimit>`**  
  Registers a vault for an L1 with the given parameters.
- **vault-manager-update-vault-max-l1-limit `<middlewareVaultManager>` `<vaultAddress>` `<assetClass>` `<maxLimit>`**  
  Updates the maximum L1 limit of a registered vault.
- **vault-manager-remove-vault `<middlewareVaultManager>` `<vaultAddress>`**  
  Removes a registered vault.
- **get-vault-count `<middlewareVaultManager>`**  
  Retrieves the total number of registered vaults.
- **get-vault-at-with-times `<middlewareVaultManager>` `<index>`**  
  Returns vault details at a specified index, including related timestamps.
- **get-vault-asset-class `<middlewareVaultManager>` `<vaultAddress>`**  
  Returns the asset class associated with the given vault.

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

- **set-l1-limit `<delegatorAddress>` `<l1Address>` `<limit>` `<assetClass>`**  
  Sets the staking limit for the given L1 address within a delegator.
- **set-operator-l1-shares `<delegatorAddress>` `<l1Address>` `<operatorAddress>` `<shares>` `<assetClass>`**  
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
- **middleware-operator-cache `<middlewareAddress>` `<epoch>` `<assetClass>`**  
  Caches operator stakes for a specified epoch and asset class.
- **middleware-calc-node-stakes `<middlewareAddress>`**  
  Calculates and caches node stakes for all operators.
- **middleware-force-update-nodes `<middlewareAddress>` `<operator>` [--limit-stake `<stake>`]**  
  Forces an update of nodes for an operator with an optional stake limit (default: 0).

#### Middleware Read Operations

- **middleware-get-operator-stake `<middlewareAddress>` `<operator>` `<epoch>` `<assetClass>`**  
  Retrieves the stake of an operator for the specified epoch and asset class.
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
  Checks if a node is pending an update.
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

*Bullet Points for Clarification:*
- Global options like `--private-key` and `--network` are inherited by every command.
- Optional flags are shown in square brackets and have default values where applicable.
- Numeric inputs are processed as BigInt values when needed.

For further details on options and examples for each command, run:

```bash
pnpm cli --help
```
