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
    - [Example Sequence on Fuji](#example-sequence-on-fuji)
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
     `BALANCER_VALIDATOR_MANAGER`, `VAULT_MANAGER`, `VALIDATOR_MANAGER`, `VAULT`, etc.
   - **Network Variables:**  
     For Fuji, `https://api.avax-test.network/ext/bc/C/rpc`  
     *The Anvil script uses `RPC_URL=http://127.0.0.1:8545` by default.*

2. **Ensure that the environment variables match your intended network settings (Fuji for production/test deployment, or Anvil for local testing). This is not intended for a production enviromment**


## Usage on Fuji

When deploying on Fuji, run commands using the `fuji` network parameter. For example:

```bash
pnpm cli --network fuji --private-key $PK register-l1 $VALIDATOR_MANAGER $VAULT_MANAGER https://l1.com
```


### Example Sequence on Fuji

- **L1 & Vault Registration:**

  ```bash
  pnpm cli --network fuji --private-key $L1_OWNER register-l1 $VALIDATOR_MANAGER $VAULT_MANAGER https://l1.com
  pnpm cli --network fuji --private-key $L1_OWNER vault-manager-register-vault-l1 $VAULT 1 200000000000000000000000
  ```

- **Operator Setup & Opt-In:**

  ```bash
  pnpm cli --network fuji --private-key $OPERATOR_OWNER register-operator https://operator1.com
  pnpm cli --network fuji --private-key $OPERATOR_OWNER opt-in-l1 $VALIDATOR_MANAGER
  pnpm cli --network fuji check-opt-in-l1 $OPERATOR $VALIDATOR_MANAGER
  pnpm cli --network fuji --private-key $OPERATOR_OWNER opt-in-vault $VAULT
  pnpm cli --network fuji check-opt-in-vault $OPERATOR $VAULT
  ```

- **Set Limits & Operator Shares:**

  ```bash
  pnpm cli --network fuji --private-key $L1_OWNER set-l1-limit $DELEGATOR $VALIDATOR_MANAGER 100000000000000000000000 1
  pnpm cli --network fuji --private-key $L1_OWNER set-operator-l1-shares $DELEGATOR $VALIDATOR_MANAGER $OPERATOR 10 1
  ```

- **Deposits / Withdrawals / Claims:**

  ```bash
  pnpm cli --network fuji --private-key $STAKER_OWNER deposit $VAULT 300
  pnpm cli --network fuji --private-key $STAKER_OWNER withdraw $VAULT 100
  pnpm cli --network fuji --private-key $STAKER_OWNER claim $VAULT 100
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

---

### Operator Registry Commands

- **register-operator `<metadataUrl>`**  
  Registers an operator using the provided metadata URL.

---

### Vault Manager Commands

- **vault-manager-register-vault-l1 `<vaultAddress>` `<assetClass>` `<maxLimit>`**  
  Registers a vault for an L1 with a given asset class and maximum limit.
- **vault-manager-update-vault-max-l1-limit `<vaultAddress>` `<assetClass>` `<maxLimit>`**  
  Updates the maximum L1 limit of a registered vault.
- **vault-manager-remove-vault `<vaultAddress>`**  
  Removes a registered vault.
- **get-vault-count**  
  Retrieves the total number of registered vaults.
- **get-vault-at-with-times `<index>`**  
  Returns vault details at a specified index, including related timestamps.
- **get-vault-asset-class `<vaultAddress>`**  
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

- **middleware-register-operator `<operator>`**  
  Registers an operator in the middleware.
- **middleware-disable-operator `<operator>`**  
  Disables an operator in the middleware.
- **middleware-remove-operator `<operator>`**  
  Removes an operator from the middleware.

#### Node Operations

- **middleware-add-node `<nodeId>` `<blsKey>` `<registrationExpiry>` `<pchainThreshold>` `<rewardThreshold>` `<initialStake>` [--pchain-address `<address>`...] [--reward-address `<address>`...]**  
  Adds a node with its BLS key, registration expiry, thresholds, and initial stake. Multiple addresses for p-chain and rewards can be specified.
- **middleware-complete-validator-registration `<operator>` `<nodeId>` `<messageIndex>`**  
  Completes validator registration for a given node.
- **middleware-remove-node `<nodeId>`**  
  Removes a node from the middleware.
- **middleware-complete-validator-removal `<messageIndex>`**  
  Completes the validator removal process.

#### Weight Update & Caching

- **middleware-init-weight-update `<nodeId>` `<newWeight>`**  
  Initiates a node weight update.
- **middleware-complete-weight-update `<nodeId>` `<messageIndex>`**  
  Completes a node’s weight update.
- **middleware-operator-cache `<epoch>` `<assetClass>`**  
  Caches operator stakes for a specified epoch and asset class.
- **middleware-calc-node-weights**  
  Calculates and caches node weights for all operators.
- **middleware-force-update-nodes `<operator>` `<messageIndex>`**  
  Forces an update of nodes for an operator.

#### Middleware Read Operations

- **middleware-get-operator-stake `<operator>` `<epoch>` `<assetClass>`**  
  Retrieves the stake of an operator for the specified epoch and asset class.
- **middleware-get-current-epoch**  
  Returns the current epoch.
- **middleware-get-epoch-start-ts `<epoch>`**  
  Retrieves the start timestamp for the given epoch.
- **middleware-get-active-nodes-for-epoch `<operator>` `<epoch>`**  
  Retrieves the active nodes for an operator during a specific epoch.
- **middleware-get-operator-nodes-length `<operator>`**  
  Returns the number of nodes associated with an operator.
- **middleware-get-node-weight-cache `<epoch>` `<validatorId>`**  
  Fetches the cached weight for a node (validator) for a given epoch.
- **middleware-get-operator-locked-stake `<operator>`**  
  Retrieves the locked stake for the operator.
- **middleware-node-pending-removal `<validatorId>`**  
  Checks if a node is pending removal.
- **middleware-node-pending-update `<validatorId>`**  
  Checks if a node is pending an update.
- **middleware-get-operator-used-weight `<operator>`**  
  Retrieves the used weight for an operator.

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

- **balancer-set-up-security-module `<middlewareAddress>` `<maxWeight>`**  
  Sets up a security module with the given middleware address and maximum weight.
- **balancer-get-security-modules**  
  Retrieves the list of security modules.
- **balancer-get-security-module-weights `<securityModule>`**  
  Retrieves weight details for the specified security module.

---

*Bullet Points for Clarification:*
- Global options like `--private-key` and `--network` are inherited by every command.
- Optional flags (such as `--onBehalfOf`, `--claimer`, `--recipient`, `--pchain-address`, and `--reward-address`) allow overriding default addresses.
- Numeric inputs are processed as BigInt values when needed.

For further details on options and examples for each command, run:

```bash
pnpm cli --help
```
---
