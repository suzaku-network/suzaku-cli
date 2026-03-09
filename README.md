# Suzaku CLI

A simple CLI tool to interact with Suzaku core smart contracts on Avalanche. The commands let you register L1s, set up vaults, register operators, handle deposits/withdrawals, and perform middleware operations.

> **Note:**
>
> - The default usage is aimed at launching on Fuji.

---

## Table of Contents

- [Suzaku CLI](#suzaku-cli)
  - [Table of Contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
    - [User experience](#user-experience)
    - [Identify the required addresses and credentials](#identify-the-required-addresses-and-credentials)
    - [Multi-Signature](#multi-signature)
    - [Ledger Hardware Wallet](#ledger-hardware-wallet)
  - [Token values](#token-values)
  - [Usage on Fuji](#usage-on-fuji)
    - [L1 Setup Sequence on Fuji](#l1-setup-sequence-on-fuji)
    - [Rewards Testing Sequence](#rewards-testing-sequence)
    - [Key Store Commands](#key-store-commands)
  - [Commands Reference](#commands-reference)
    - [Global Options](#global-options)
    - [L1 Registry Commands (`l1-registry`)](#l1-registry-commands-l1-registry)
    - [Operator Registry Commands (`operator-registry`)](#operator-registry-commands-operator-registry)
    - [Vault Manager Commands (`vault-manager`)](#vault-manager-commands-vault-manager)
    - [Vault Commands (`vault`)](#vault-commands-vault)
    - [Middleware Commands (`middleware`)](#middleware-commands-middleware)
    - [Operator Opt-In Commands (`opt-in`)](#operator-opt-in-commands-opt-in)
    - [Balancer Commands (`balancer`)](#balancer-commands-balancer)
    - [POA Security Module Commands (`poa`)](#poa-security-module-commands-poa)
    - [Uptime Commands (`uptime`)](#uptime-commands-uptime)
    - [Rewards Commands (`rewards`)](#rewards-commands-rewards)
    - [Key Store Commands (`key`)](#key-store-commands-key)
    - [Validator Manager Contract Commands (`vmc`)](#vmc-commands-vmc)
    - [KiteStakingManager Commands (`kite-staking-manager`)](#kitestakingmanager-commands-kite-staking-manager)
    - [StakingVault Commands (`staking-vault`)](#stakingvault-commands-staking-vault)
    - [Ledger Commands (`ledger`)](#ledger-commands-ledger)
    - [Safe Commands (`safe`)](#safe-commands-safe)
    - [Access Control Commands (`access-control`)](#access-control-commands-access-control)
    - [Completion](#completion)
    - [Other Commands](#other-commands)

## Requirements

- Node.js (v16+ recommended)
- pnpm package manager (or npm/yarn)
- [cast](https://book.getfoundry.sh/reference/cast) for token minting/approval commands (optional)
- [pass](https://www.passwordstore.org/) to manager private keys securely (mandatory on mainnet)

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

### User experience

- Link the cli globally to make it accessible system-wide

  ```bash
  pnpm link --global
  ```

  After ward you can use the cli using `suzaku-cli` command which hit the transpiled build (faster than `pnpm cli`)

- Enable the auto-completion (only available on bash & zsh).
  This will be installed on the default user shell (It can be enforced using `SHELL` env var).

  ```bash
  suzaku-cli completion install
  ```

- Wait confirmation.
  It's often the case that, on fuji or on the mainnet, we should ensure the transaction haven't reverted waiting some blocks.
  To wait some blocks to confirm a tx, use the `--wait` parameter followed by the number of block to wait.

  To see all parameters, see the [Commands Reference](#commands-reference) below.

### Identify the required addresses and credentials

The specific commands and required information (such as contract addresses and private keys) will vary depending on your role—Operator, Curator, or L1. Ensure you have the relevant contract addresses and credentials prepared before proceeding.

- **Private key security**

  If you plain to use **Avalanche mainnet**, It's mandatory to **use `pass`**. The cli wrap this tool **avoiding** the use of **raw private keys** in the terminal which ends in the history.

  Using this feature implies initializing the password store of the cli located in `~/.suzaku-cli/.password-store`:

  ```bash
  # Check if you have already setup gpg keys
  suzaku-cli key list-gpg-ids
  # initialize the keystore
  suzaku-cli key init <all-needed-gpg-ids>
  ```

  To save a new private key, the best way is copying it into the clipboard and use the following command:

  ```bash
  # Show the address of the imported private key
  suzaku-cli key create <private-key-role-name> -c
  ```

  The `-c` use the value in the clip board and erase it if the key format is valid.

  To send tx with a stored key, use the `-s` parameter followed by the name of the secret as in the next command example.

  For private key options, you can directly replace the pk value with its secret name.

### Multi-Signature

**Requirement:** Set the env var `SAFE_API_KEY` after creating the API key on [Safe developer platform](https://developer.safe.global/api-keys)

The CLI supports [Safe wallet](https://app.safe.global/) on all transactions.
To use it, just use the private key of a signer (or use Ledger) and set the address of the wallet after `--safe` parameter like that:

```bash
# Using a secret from the keystore (mainnet is default)
suzaku-cli vault set-l1-limit $DELEGATOR $BALANCER_VALIDATOR_MANAGER 100 1 -s signer1-pk --safe 0x1234...

# Using Ledger hardware wallet with Safe
suzaku-cli vault deposit $VAULT 1000 --ledger --safe 0x1234...
```

**Transaction management strategy:**

1. Search for similar pending transactions in the Safe.
2. **Exact match:**
   - If already signed by the user: Ignore the transaction (Skip).
   - If not signed: Automatically confirm the existing transaction.
3. **Partial match** (same function, different arguments):
   - Display an interactive menu.
   - Options: Confirm an existing transaction, Create a new one, or Skip all.
4. **No match:** Create a new transaction.
5. **Proposal:** If the signer is not an owner but is registered as a delegate, the transaction will be proposed instead of executed. Delegates can propose transactions that owners must then confirm.

The first signer to reach the Safe threshold will execute the transaction.

All other operations like reject tx... are not supported. Please use the official [Safe wallet UI](https://app.safe.global/).

### Ledger Hardware Wallet

The CLI supports Ledger hardware wallets for secure transaction signing. This is the recommended method for mainnet operations.

```bash
# Use Ledger for signing (mainnet is default)
suzaku-cli middleware add-node $MIDDLEWARE $NODE_ID $BLS_KEY --ledger

# Use Ledger with Safe multisig
suzaku-cli vault deposit $VAULT 1000 --ledger --safe 0x1234...

# Use Ledger on Fuji testnet
suzaku-cli vault deposit $VAULT 100 --ledger --network fuji
```

**Configuration:**

- `LEDGER_ACCOUNT_INDEX`: Set this environment variable to use a different account index (default: 0)

**Ledger commands:**

```bash
# Get addresses from connected Ledger
suzaku-cli ledger addresses

# Fix USB rules on Linux (if Ledger is not detected)
suzaku-cli ledger fix-usb-rules
```

> **Note:** On Linux, you may need to run `suzaku-cli ledger fix-usb-rules` with sudo privileges if the device is not detected. It will use the official Ledger script to add `/etc/udev/rules.d/20-hw1.rules` to identify Ledger devices.

## Token values

It's important to notice that all token values to use as cli input are decimal formatted.

It means the given value is multiplied by the onchain decimal number or, for AVAX, by 18 for the C-Chain and 9 for the P-Chain.

## Usage on Fuji

When deploying on Fuji, run commands using the `fuji` network parameter. For example:

```bash
suzaku-cli l1-registry register $BALANCER_VALIDATOR_MANAGER $MIDDLEWARE https://l1.com --network fuji --private-key $PK
```

### L1 Setup Sequence on Fuji

- **L1 & Vault Registration:**

  ```bash
  suzaku-cli l1-registry register $BALANCER_VALIDATOR_MANAGER $MIDDLEWARE https://l1.com --network fuji --private-key $L1_OWNER
  # Vault max limit for the L1 is 2M token (use decimal format)
  suzaku-cli vault-manager register-vault-l1 $VAULT_MANAGER $VAULT 1 2000000 --network fuji --private-key $L1_OWNER
  ```

- **(Optional) Modify L1 Middleware:**

  ```bash
  # Update the middleware associated with a registered L1
  suzaku-cli l1-registry set-middleware $BALANCER_VALIDATOR_MANAGER $MIDDLEWARE --network fuji --private-key $L1_OWNER
  ```

- **Operator Setup & Opt-In:**

  ```bash
  suzaku-cli operator-registry register https://operator1.com --network fuji --private-key $OPERATOR_OWNER
  suzaku-cli opt-in l1-in $BALANCER_VALIDATOR_MANAGER --network fuji --private-key $OPERATOR_OWNER
  suzaku-cli opt-in check-l1 $OPERATOR $BALANCER_VALIDATOR_MANAGER --network fuji
  suzaku-cli opt-in vault-in $VAULT --network fuji --private-key $OPERATOR_OWNER
  suzaku-cli opt-in check-vault $OPERATOR $VAULT --network fuji
  ```

- **Set Limits & Operator Shares:**

  ```bash
  # Set the limit of the L1 in this vault to 1M tokens (use decimal format)
  suzaku-cli vault set-l1-limit $VAULT $BALANCER_VALIDATOR_MANAGER 1000000 1 --network fuji --private-key $L1_OWNER
  # Operator will be able to use 10.5 tokens (use decimal format)
  suzaku-cli vault set-operator-l1-shares $VAULT $BALANCER_VALIDATOR_MANAGER $OPERATOR 10.5 1 --network fuji --private-key $L1_OWNER
  ```

- **(Optional) Mint & Approve sAVAX, Then Deposit**
  1.  Mint via `cast`:
      ```bash
      cast send "$SAVAX" "mint(address,uint256)" "$STAKER" 5000000000000000000000000 \
        --rpc-url $RPC_URL \
        --private-key "$CURATOR_OWNER"
      ```
  2.  Check allowance:
      ```bash
      cast call "$SAVAX" "allowance(address,address)" "$STAKER" "$PRIMARY_COLLATERAL" \
      --rpc-url $RPC_URL
      ```
  3.  Approve and deposit on the collateral (4M tokens):
      ```bash
      suzaku-cli vault collateral-deposit $COLLATERAL 4000000 --network fuji --private-key $STAKER_PK
      ```
  4.  Deposit on Vault's `deposit(address,uint256)`:
      ```bash
      suzaku-cli vault deposit $VAULT1 4000000 --private-key $STAKER_PK
      ```

- **Deposits / Withdrawals / Claims:**

  ```bash
  suzaku-cli vault deposit $VAULT 400 --network fuji --private-key $STAKER_OWNER
  suzaku-cli vault withdraw $VAULT 100 --network fuji --private-key $STAKER_OWNER
  suzaku-cli vault claim $VAULT 100 --network fuji --private-key $STAKER_OWNER
  ```

- **Check Vault Information**

  ```bash
  # Get vault collateral token
  suzaku-cli vault get-collateral $VAULT --network fuji

  # Get vault delegator
  suzaku-cli vault get-delegator $VAULT --network fuji

  # Check your vault balance (using --account for an address or a pk instead)
  suzaku-cli vault get-balance $VAULT --account $STAKER_OWNER --network fuji

  # Check total vault supply
  suzaku-cli vault get-total-supply $VAULT --network fuji

  # Check withdrawal shares for an epoch
  suzaku-cli vault get-withdrawal-shares $VAULT 100 --account $STAKER_OWNER --network fuji
  ```

- **Check Stakes & Epochs**

  ```bash
  suzaku-cli vault-manager opstakes $VAULT_MANAGER $OPERATOR --network fuji
  suzaku-cli middleware get-current-epoch $MIDDLEWARE --network fuji
  suzaku-cli middleware register-operator $MIDDLEWARE $OPERATOR --private-key $L1_OWNER --network fuji
  suzaku-cli middleware calc-operator-cache $MIDDLEWARE <current-epoch> 1 --private-key $L1_OWNER --network fuji
  suzaku-cli middleware get-operator-stake $MIDDLEWARE $OPERATOR <current-epoch> 1 --network fuji
  ```

- **Balancer / Security Module Setup**

  ```bash
  suzaku-cli balancer set-up-security-module $BALANCER_VALIDATOR_MANAGER $MIDDLEWARE 200000 --private-key $L1_OWNER --network fuji
  suzaku-cli balancer get-security-modules $BALANCER_VALIDATOR_MANAGER --network fuji
  ```

- **Check Epoch Information**

  ```bash
  suzaku-cli middleware get-current-epoch $MIDDLEWARE --network fuji
  suzaku-cli middleware calc-operator-cache $MIDDLEWARE <current-epoch> 1 --private-key $L1_OWNER --network fuji
  suzaku-cli middleware get-operator-stake $MIDDLEWARE $OPERATOR <next-epoch> 1 --network fuji
  ```

- **Process Node Stake Cache**

  ```bash
  # Process all epochs 50 by 50 (default)
  suzaku-cli middleware process-node-stake-cache $MIDDLEWARE --private-key $L1_OWNER --network fuji

  # Process 5 epochs at once
  suzaku-cli middleware process-node-stake-cache $MIDDLEWARE --epochs 5 --private-key $L1_OWNER --network fuji

  # Process 100 epochs in batches of 10, with 2 second delay between batches
  suzaku-cli middleware process-node-stake-cache $MIDDLEWARE --epochs 10 --loop-epochs 10 --delay 2000 --private-key $L1_OWNER --network fuji

  # Process all epochs in batches of 50, waiting 1 block between batches
  suzaku-cli middleware process-node-stake-cache $MIDDLEWARE --epochs 10 --loop-epochs 10 --wait 1

  ```

- **Initialize and Complete Node Addition**

  ```bash
  suzaku-cli middleware add-node $MIDDLEWARE $NODE_ID $BLS_KEY --private-key $OPERATOR_OWNER --network fuji

  suzaku-cli middleware complete-validator-registration \ --network fuji
    $MIDDLEWARE \
    $ADD_NODE_TX_HASH \
    $BLS_PROOF_OF_POSSESSION \
    --private-key $OPERATOR_OWNER
  ```

  Use the same commands for the `poa` security module but adding the `initialWeight` parameter.

### Rewards Testing Sequence

Here's a recommended sequence of commands to test the rewards functionality:

1. **Initial Setup and Configuration**

   ```bash
   # Check current fees configuration
   suzaku-cli rewards get-fees-config $REWARDS --network fuji

   # Set appropriate fees if needed
   suzaku-cli rewards update-protocol-fee $REWARDS 1000 --network fuji --private-key $CURATOR_OWNER
   suzaku-cli rewards update-operator-fee $REWARDS 2000 --network fuji --private-key $CURATOR_OWNER
   suzaku-cli rewards update-curator-fee $REWARDS 500 --network fuji --private-key $CURATOR_OWNER

   # Configure minimum required uptime
   suzaku-cli rewards get-min-uptime $REWARDS --network fuji
   suzaku-cli rewards set-min-uptime $REWARDS 3000 --network fuji --private-key $CURATOR_OWNER

   # Set rewards bips for collateral class
   suzaku-cli rewards set-bips-collateral-class $REWARDS 1 5000 --network fuji --private-key $CURATOR_OWNER
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
   # Set rewards amount for the epochs you want to test (1 token in decimal format)
   suzaku-cli rewards set-amount $REWARDS 99 5 1 --network fuji --private-key $L1_OWNER

   # Verify rewards allocation
   suzaku-cli rewards get-epoch-rewards $REWARDS 99 --network fuji
   ```

3. **Distribute Rewards**

   ```bash
   # Distribute rewards for epoch 99 with batch size 10
   suzaku-cli rewards distribute $REWARDS 99 10 --network fuji --private-key $L1_OWNER

   # Check distribution status
   suzaku-cli rewards get-distribution-batch $REWARDS 99 --network fuji

   # Continue distribution if not complete
   suzaku-cli rewards distribute $REWARDS 99 10 --network fuji --private-key $L1_OWNER
   ```

4. **Verify Shares Calculation**

   ```bash
   # Check operator shares
   suzaku-cli rewards get-operator-shares $REWARDS 99 $OPERATOR --network fuji

   # Check vault shares
   suzaku-cli rewards get-vault-shares $REWARDS 99 $VAULT --network fuji

   # Check curator shares
   suzaku-cli rewards get-curator-shares $REWARDS 99 $CURATOR --network fuji
   ```

5. **Claim Rewards**

   ```bash
   # Claim operator fees
   suzaku-cli rewards claim-operator-fee $REWARDS --network fuji --private-key $OPERATOR_KEY

   # Claim staker rewards
   suzaku-cli rewards claim $REWARDS --network fuji --private-key $STAKER_KEY

   # Claim curator fees
   suzaku-cli rewards claim-curator-fee $REWARDS --network fuji --private-key $CURATOR_KEY

   # Claim protocol fees
   suzaku-cli rewards claim-protocol-fee $REWARDS --network fuji --private-key $PROTOCOL_OWNER
   ```

6. **Verify Claim Status**

   ```bash
   # Check last claimed epoch for operator
   suzaku-cli rewards get-last-claimed-operator $REWARDS $OPERATOR $REWARDS_TOKEN --network fuji

   # Check last claimed epoch for staker
   suzaku-cli rewards get-last-claimed-staker $REWARDS $STAKER $REWARDS_TOKEN --network fuji

   # Check last claimed epoch for curator
   suzaku-cli rewards get-last-claimed-curator $REWARDS $CURATOR $REWARDS_TOKEN --network fuji
   ```

7. **Claim Undistributed Rewards (if applicable)**
   ```bash
   # This should be done after epoch 99+2 to ensure all claims are done
   suzaku-cli rewards claim-undistributed $REWARDS 99 --network fuji --private-key $L1_OWNER
   ```

### Key Store Commands

The following commands allow you to manage the cli secrets keystore. Under the wood, it uses [pass](https://www.passwordstore.org/), the standard unix password manager.
It's a mandatory dependency when working on the mainnet with this cli.

1. **Initialize cli keystore**

   ```bash
   # Acquire available gpg key ids
   suzaku-cli key list-gpg-ids
   > [suzabro@domain.com
   > avabro@domain.com]
   # Initialize the keystore using the ids that are supposed to interact with.
   suzaku-cli key init suzabro@domain.com avabro@domain.com ...
   ```

2. **Create new secret**

   ```bash
   suzaku-cli key create operator
   ```

3. **Use your secret name instead of raw private key**

   ```bash
   suzaku-cli middleware add-node $L1_MIDDLEWARE $NODE_ID $BLS_KEY -s operator
   ```

   You'll be prompted like using [pass](https://www.passwordstore.org/) normally and it will use the underlying private key

4. **List all available secrets**

   ```bash
   suzaku-cli key list
   > Available secrets:
   > .password-store
   > └── operator
   ```

5. **Remove a secret**
   ```bash
   suzaku-cli key rm operator
   ```

For a complete list of commands, see the [Commands Reference](#commands-reference) below.

---

## Commands Reference

Run the help command for a full listing of available commands and options:

```bash
suzaku-cli --help
```

### Global Options

- `-n, --network <network>`: Network to use (fuji, mainnet, anvil, kitetestnet, custom). Default: **mainnet**.
- `-r, --rpc-url <rpcUrl>`: RPC URL for a custom network. Automatically sets `--network` to `custom`. If `--network custom` is used, this option is **required**.
- `-k, --private-key <privateKey>`: Private key for signing transactions.
- `-s, --secret-name <secretName>`: The keystore secret name containing the private key.
- `-l, --ledger`: Use Ledger hardware wallet for signing (conflicts with `-k` and `-s`).
- `-w, --wait <confirmations>`: Number of confirmations to wait after a write transaction. Default: 2.
- `--json`: Output logs in JSON format.
- `-y, --yes`: Automatic yes to prompts.
- `--safe <address>`: Use Safe smart account for transactions (compatible with Ledger).
- `--cast`: Output equivalent Foundry `cast` commands instead of executing write transactions (conflicts with `--safe`).
- `--skip-abi-validation`: Skip the ABI validation for used contracts.

**Environment variables:**

- `LogLevel`: Set log verbosity (DEBUG, INFO, WARN, ERROR). Default: INFO.
- `LEDGER_ACCOUNT_INDEX`: Ledger account index to use. Default: 0.

### L1 Registry Commands (`l1-registry`)

- **register `<balancerAddress>` `<l1Middleware>` `<metadataUrl>`**
  Register a new L1 in the L1 registry.
- **get-all**
  List all L1s registered in the L1 registry.
- **set-metadata-url `<l1Address>` `<metadataUrl>`**
  Set metadata URL for an L1 in the L1 registry.
- **set-middleware `<l1Address>` `<l1Middleware>`**
  Set middleware address for an L1 in the L1 registry.

### Operator Registry Commands (`operator-registry`)

- **register `<metadataUrl>`**
  Register a new operator in the operator registry.
- **get-all**
  List all operators registered in the operator registry.

### Vault Manager Commands (`vault-manager`)

- **register-vault-l1 `<middlewareVaultManagerAddress>` `<vaultAddress>` `<collateralClass>` `<maxLimit>`**
  Register a vault for L1 staking.
- **update-vault-max-l1-limit `<middlewareVaultManagerAddress>` `<vaultAddress>` `<collateralClass>` `<maxLimit>`**
  Update the maximum L1 limit for a vault.
- **remove-vault `<middlewareVaultManager>` `<vaultAddress>`**
  Remove a vault from L1 staking.
- **get-vault-count `<middlewareVaultManager>`**
  Get the number of vaults registered for L1 staking.
- **get-vault-at-with-times `<middlewareVaultManager>` `<index>`**
  Get the vault address at a specific index along with its registration and removal times.
- **get-vault-collateral-class `<middlewareVaultManager>` `<vaultAddress>`**
  Get the collateral class ID associated with a vault.
- **opstakes `<middlewareVaultManager>` `<operatorAddress>`**
  Show operator stakes across L1s, enumerating each L1 the operator is opted into.
- **l1stakes `<validatorManagerAddress>`**
  Show L1 stakes for a given validator manager.

### Vault Commands (`vault`)

- **deposit `<vaultAddress>` `<amount>` [--onBehalfOf `<behalfOf>]**
  Deposit tokens into the vault.
- **withdraw `<vaultAddress>` `<amount>` [--claimer `<claimer>]**
  Withdraw tokens from the vault.
- **claim `<vaultAddress>` `<epoch>` [--recipient `<recipient>]**
  Claim withdrawn tokens from the vault for a specific epoch.
- **grant-staker-role `<vaultAddress>` `<account>`**
  Grant staker role on a vault to an account.
- **revoke-staker-role `<vaultAddress>` `<account>`**
  Revoke staker role on a vault from an account.
- **collateral-deposit `<collateralAddress>` `<amount>`**
  Approve and deposit tokens into the collateral contract associated with a vault.
- **set-deposit-limit `<vaultAddress>` `<limit>`**
  Set deposit limit for a vault (0 will disable the limit).
- **collateral-increase-limit `<vaultAddress>` `<limit>`**
  Set deposit limit for a collateral.
- **get-collateral `<vaultAddress>`**
  Get the collateral token address of a vault.
- **get-delegator `<vaultAddress>`**
  Get the delegator address of a vault.
- **get-balance `<vaultAddress>` [--account `<account>]**
  Get vault token balance for an account.
- **get-active-balance `<vaultAddress>` [--account `<account>]**
  Get active vault balance for an account.
- **get-total-supply `<vaultAddress>`**
  Get total supply of vault tokens.
- **get-withdrawal-shares `<vaultAddress>` `<epoch>` [--account `<account>]**
  Get withdrawal shares for an account at a specific epoch.
- **get-withdrawals `<vaultAddress>` `<epoch>` [--account `<account>]**
  Get withdrawal amount for an account at a specific epoch.
- **get-deposit-limit `<vaultAddress>`**
  Get deposit limit for a vault.
- **set-l1-limit `<vaultAddress>` `<l1Address>` `<limit>` `<collateralClass>`**
  Set the L1 limit for a vault's delegator.
- **set-operator-l1-shares `<vaultAddress>` `<l1Address>` `<operatorAddress>` `<shares>` `<collateralClass>`**
  Set the L1 shares for an operator in a delegator.
- **get-l1-limit `<vaultAddress>` `<l1Address>` `<collateralClass>`**
  Get L1 limit for a vault's delegator.
- **get-operator-l1-shares `<vaultAddress>` `<l1Address>` `<collateralClass>` `<operatorAddress>`**
  Get L1 shares for an operator in a vault's delegator.

### Middleware Commands (`middleware`)

- **add-collateral-class `<middlewareAddress>` `<collateralClassId>` `<minValidatorStake>` `<maxValidatorStake>` `<initialCollateral>`**
  Add a new collateral class to the middleware.
- **add-collateral-to-class `<middlewareAddress>` `<collateralClassId>` `<collateralAddress>`**
  Add a new collateral address to an existing collateral class.
- **remove-collateral-from-class `<middlewareAddress>` `<collateralClassId>` `<collateralAddress>`**
  Remove a collateral address from an existing collateral class.
- **remove-collateral-class `<middlewareAddress>` `<collateralClassId>`**
  Remove an existing secondary collateral class.
- **activate-collateral-class `<middlewareAddress>` `<collateralClassId>`**
  Activate a secondary collateral class.
- **deactivate-collateral-class `<middlewareAddress>` `<collateralClassId>`**
  Deactivate a secondary collateral class.
- **register-operator `<middlewareAddress>` `<operator>`**
  Register an operator to operate on this L1.
- **disable-operator `<middlewareAddress>` `<operator>`**
  Disable an operator to prevent it from operating on this L1.
- **remove-operator `<middlewareAddress>` `<operator>`**
  Remove an operator from this L1.
- **process-node-stake-cache `<middlewareAddress>` [--epochs `<epochs>] [--loop-epochs `<count>] [--delay `<milliseconds>]**
  Manually process node stake cache for one or more epochs.
- **add-node `<middlewareAddress>` `<nodeId>` `<blsKey>` [--initial-stake `<initialStake>] [--registration-expiry `<expiry>] [--pchain-remaining-balance-owner-threshold `<threshold>] [--pchain-disable-owner-threshold `<threshold>] [--pchain-remaining-balance-owner-address `<address>...] [--pchain-disable-owner-address `<address>...]**
  Add a new node to an L1.
- **complete-validator-registration `<middlewareAddress>` `<addNodeTxHash>` `<blsProofOfPossession>` [--pchain-tx-private-key `<pchainTxPrivateKey>] [--initial-balance `<initialBalance>] [--skip-wait-api]**
  Complete validator registration on the P-Chain and on the middleware after adding a node.
- **remove-node `<middlewareAddress>` `<nodeId>`**
  Remove a node from an L1.
- **complete-validator-removal `<middlewareAddress>` `<removeNodeTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>] [--skip-wait-api] [--node-id `<nodeId>]**
  Complete validator removal on the P-Chain and on the middleware after removing a node.
- **init-stake-update `<middlewareAddress>` `<nodeId>` `<newStake>`**
  Initialize validator stake update and lock.
- **complete-stake-update `<middlewareAddress>` `<validatorStakeUpdateTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>] [--node-id `<nodeId>]**
  Complete validator stake update of all or specified node IDs.
- **calc-operator-cache `<middlewareAddress>` `<epoch>` `<collateralClass>`**
  Calculate and cache stakes for operators.
- **calc-node-stakes `<middlewareAddress>`**
  Calculate and cache node stakes for all operators.
- **force-update-nodes `<middlewareAddress>` `<operator>` [--limit-stake `<stake>]**
  Force update operator nodes with stake limit.
- **top-up-operator-validators `<middlewareAddress>` `<operator>` `<targetBalance>`**
  Top up all operator validators to meet a target continuous fee balance.
- **get-operator-stake `<middlewareAddress>` `<operator>` `<epoch>` `<collateralClass>`**
  Get operator stake for a specific epoch and collateral class.
- **get-operator-nodes `<middlewareAddress>` `<operator>`**
  Get all nodes for an operator.
- **get-current-epoch `<middlewareAddress>`**
  Get current epoch number.
- **get-epoch-start-ts `<middlewareAddress>` `<epoch>`**
  Get epoch start timestamp.
- **get-active-nodes-for-epoch `<middlewareAddress>` `<operator>` `<epoch>`**
  Get active nodes for an operator in a specific epoch.
- **get-operator-nodes-length `<middlewareAddress>` `<operator>`**
  Get current number of nodes for an operator.
- **get-node-stake-cache `<middlewareAddress>` `<epoch>` `<validationId>`**
  Get node stake cache for a specific epoch and validator.
- **get-operator-validation-ids `<middlewareAddress>` `<operator>`**
  Get all validation IDs for an operator.
- **get-operator-locked-stake `<middlewareAddress>` `<operator>`**
  Get operator locked stake.
- **node-pending-removal `<middlewareAddress>` `<validationId>`**
  Check if node is pending removal.
- **get-operator-used-stake `<middlewareAddress>` `<operator>`**
  Get operator used stake from cache.
- **get-operator-available-stake `<middlewareAddress>` `<operator>`**
  Get operator available stake.
- **get-all-operators `<middlewareAddress>`**
  Get all operators registered.
- **get-collateral-class-ids `<middlewareAddress>`**
  Get all collateral class IDs from the middleware.
- **get-active-collateral-classes `<middlewareAddress>`**
  Get active collateral classes (primary and secondary).
- **node-logs `<middlewareAddress>` [--node-id `<nodeId>] [--snowscan-api-key `<string>]**
  Get middleware node logs.
- **get-last-node-validation-id `<middlewareAddress>` `<nodeId>`**
  Get last node validation ID.
- **to-vault-epoch `<middlewareAddress>` `<vaultAddress>` `<middlewareEpoch>`**
  Convert middleware epoch to a vault epoch.
- **update-window-ends-ts `<middlewareAddress>`**
  Get the end timestamp of the last completed middleware epoch window.
- **vault-to-middleware-epoch `<middlewareAddress>` `<vaultAddress>` `<vaultEpoch>`**
  Convert vault epoch to a middleware epoch.
- **set-vault-manager `<middlewareAddress>` `<vaultManagerAddress>`**
  Set vault manager.
- **account-info `<middlewareAddress>` `<account>`**
  Get account info.
- **info `<middlewareAddress>`**
  Get general information about the middleware.
- **weight-watcher `<middlewareAddress>` [--epochs `<number>`] [--loop-epochs `<number>`]**
  Watch for operators weight changes.

### Operator Opt-In Commands (`opt-in`)

- **l1-in `<l1Address>`**
  Operator opts in to a given L1.
- **l1-out `<l1Address>`**
  Operator opts out from a given L1.
- **check-l1 `<operator>` `<l1Address>`**
  Check if an operator is opted in to a given L1.
- **vault-in `<vaultAddress>`**
  Operator opts in to a given Vault.
- **vault-out `<vaultAddress>`**
  Operator opts out from a given Vault.
- **check-vault `<operator>` `<vaultAddress>`**
  Check if an operator is opted in to a given Vault.

### Balancer Commands (`balancer`)

- **set-up-security-module `<balancerValidatorManagerAddress>` `<middlewareAddress>` `<maxWeight>`**
  Set up a security module.
- **get-security-modules `<balancerValidatorManagerAddress>`**
  Get all security modules.
- **get-security-module-weights `<balancerValidatorManagerAddress>` `<securityModule>`**
  Get security module weights.
- **get-validator-status `<balancerAddress>` `<nodeId>`**
  Get validator status by node ID.
- **resend-validator-registration `<balancerAddress>` `<nodeId>`**
  Resend validator registration transaction.
- **resend-weight-update `<balancerAddress>` `<nodeId>`**
  Resend validator weight update transaction.
- **resend-validator-removal `<balancerAddress>` `<nodeId>`**
  Resend validator removal transaction.
- **transfer-l1-ownership `<balancerAddress>` `<newOwner>`**
  Transfer Validator manager, balancer and its security modules ownership to a new owner.

### POA Security Module Commands (`poa`)

- **add-node `<poaSecurityModule>` `<nodeId>` `<blsKey>` `<initialWeight>` [--registration-expiry `<expiry>] [--pchain-remaining-balance-owner-threshold `<threshold>] [--pchain-disable-owner-threshold `<threshold>] [--pchain-remaining-balance-owner-address `<address>...] [--pchain-disable-owner-address `<address>...]**
  Add a new node to an L1.
- **complete-validator-registration `<poaSecurityModuleAddress>` `<addNodeTxHash>` `<blsProofOfPossession>` [--pchain-tx-private-key `<pchainTxPrivateKey>] [--initial-balance `<initialBalance>] [--skip-wait-api]**
  Complete validator registration on the P-Chain and on the middleware after adding a node.
- **remove-node `<poaSecurityModuleAddress>` `<nodeId>`**
  Initiate validator removal.
- **complete-validator-removal `<poaSecurityModuleAddress>` `<nodeId>` `<removeNodeTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>]**
  Complete validator removal in the P-Chain and in the POA Security Module.
- **init-weight-update `<poaSecurityModuleAddress>` `<nodeId>` `<newWeight>`**
  Update validator weight.
- **complete-weight-update `<middlewareAddress>` `<validatorStakeUpdateTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>] [--node-id `<nodeId>]**
  Complete validator weight update of all or specified node IDs.

### Uptime Commands (`uptime`)

- **get-validation-uptime-message `<rpcUrl>` `<blockchainId>` `<nodeId>`**
  Get the validation uptime message for a given validator in the given L1 RPC.
- **compute-validator-uptime `<uptimeTrackerAddress>` `<signedUptimeHex>`**
  Compute validator uptime based on the signed uptime message.
- **report-uptime-validator `<rpcUrl>` `<blockchainId>` `<nodeId>` `<uptimeTrackerAddress>`**
  Gets a validator's signed uptime message and submits it to the UptimeTracker contract.
- **report-all-validators-uptime `<uptimeTrackerAddress>` `<middlewareAddress>` `<rpcUrl>` `<blockchainId>`** [--epoch `<epoch>`]
  Report uptime for all validators (optional `--epoch` defaults to current epoch).
- **compute-operator-uptime `<uptimeTrackerAddress>` `<operator>` `<epoch>`**
  Compute uptime for an operator at a specific epoch.
- **compute-operator-uptime-range `<uptimeTrackerAddress>` `<operator>` `<startEpoch>` `<endEpoch>`**
  Compute uptime for an operator over a range of epochs (client-side looping).
- **get-validator-uptime `<uptimeTrackerAddress>` `<validationID>` `<epoch>`**
  Get the recorded uptime for a validator at a specific epoch.
- **check-validator-uptime-set `<uptimeTrackerAddress>` `<validationID>` `<epoch>`**
  Check if uptime data is set for a validator at a specific epoch.
- **get-operator-uptime `<uptimeTrackerAddress>` `<operator>` `<epoch>`**
  Get the recorded uptime for an operator at a specific epoch.
- **check-operator-uptime-set `<uptimeTrackerAddress>` `<operator>` `<epoch>`**
  Check if uptime data is set for an operator at a specific epoch.

### Rewards Commands (`rewards`)

- **distribute `<rewardsAddress>` `<epoch>` `<batchSize>`**
  Distribute rewards for a specific epoch.
- **claim `<rewardsAddress>` [--recipient `<recipient>]**
  Claim rewards for a staker in batch of 64 epochs.
- **claim-operator-fee `<rewardsAddress>` [--recipient `<recipient>]**
  Claim operator fees in batch of 64 epochs.
- **claim-curator-fee `<rewardsAddress>` [--recipient `<recipient>]**
  Claim all curator fees in batch of 64 epochs.
- **claim-protocol-fee `<rewardsAddress>` [--recipient `<recipient>]**
  Claim protocol fees (only for protocol owner).
- **claim-undistributed `<rewardsAddress>` `<epoch>` [--recipient `<recipient>]**
  Claim undistributed rewards (admin only).
- **set-amount `<rewardsAddress>` `<startEpoch>` `<numberOfEpochs>` `<rewardsAmount>`**
  Set rewards amount for epochs.
- **set-bips-collateral-class `<rewardsAddress>` `<collateralClass>` `<bips>`**
  Set rewards bips for collateral class.
- **set-min-uptime `<rewardsAddress>` `<minUptime>`**
  Set minimum required uptime for rewards eligibility.
- **set-protocol-owner `<rewardsAddress>` `<newOwner>`**
  Set protocol owner (DEFAULT_ADMIN_ROLE only).
- **update-protocol-fee `<rewardsAddress>` `<newFee>`**
  Update protocol fee.
- **update-operator-fee `<rewardsAddress>` `<newFee>`**
  Update operator fee.
- **update-curator-fee `<rewardsAddress>` `<newFee>`**
  Update curator fee.
- **update-all-fees `<rewardsAddress>` `<protocolFee>` `<operatorFee>` `<curatorFee>`**
  Update all fees at once (protocol, operator, curator).
- **get-epoch-rewards `<rewardsAddress>` `<epoch>`**
  Get rewards amount for a specific epoch.
- **get-operator-shares `<rewardsAddress>` `<epoch>` `<operator>`**
  Get operator shares for a specific epoch.
- **get-vault-shares `<rewardsAddress>` `<epoch>` `<vault>`**
  Get vault shares for a specific epoch.
- **get-curator-shares `<rewardsAddress>` `<epoch>` `<curator>`**
  Get curator shares for a specific epoch.
- **get-protocol-rewards `<rewardsAddress>` `<token>`**
  Get protocol rewards for a token.
- **get-distribution-batch `<rewardsAddress>` `<epoch>`**
  Get distribution batch status for an epoch.
- **get-fees-config `<rewardsAddress>`**
  Get current fees configuration.
- **get-bips-collateral-class `<rewardsAddress>` `<collateralClass>`**
  Get rewards bips for collateral class.
- **get-min-uptime `<rewardsAddress>`**
  Get minimum required uptime for rewards eligibility.
- **get-last-claimed-staker `<rewardsAddress>` `<staker>` `<rewardToken>`**
  Get last claimed epoch for a staker.
- **get-last-claimed-operator `<rewardsAddress>` `<operator>` `<rewardToken>`**
  Get last claimed epoch for an operator.
- **get-last-claimed-curator `<rewardsAddress>` `<curator>` `<rewardToken>`**
  Get last claimed epoch for a curator.

### Key Store Commands (`key`)

- **list-gpg-ids**
  List available gpg key ids installed on the system.
- **init `<gpgKeyIds...>`**
  Initialize the keystore.
- **create `<name>`** (requires one of: **-c/--clip**, **-v/--value `<value>`**, or **-p/--prompt**)
  Create a new encrypted secret (clipboard, value, or prompt for value).
- **rm `<name>`**
  Remove an encrypted secret.
- **list** [--hide-addresses]
  List all encrypted secrets.
- **addresses `<name>`**
  Show the address of an encrypted private key.

### Validator Manager Contract Commands (`vmc`)

- **info `<validatorManagerAddress>`**
  Get summary information about a Validator Manager Contract.
- **transfer-ownership `<validatorManagerAddress>` `<owner>`**
  Transfer the ownership of a ValidatorManager contract.
- **complete-validator-removal `<validatorManagerAddress>` `<removalTxId>`**
  Complete the removal of a validator that has been pending removal.

### KiteStakingManager Commands (`kite-staking-manager`)

Alias: `ksm`

- **update-staking-config `<kiteStakingManagerAddress>` `<minimumStakeAmount>` `<maximumStakeAmount>` `<minimumStakeDuration>` `<minimumDelegationFeeBips>` `<maximumStakeMultiplier>`**
  Update staking configuration.
- **initiate-validator-registration `<kiteStakingManagerAddress>` `<nodeId>` `<blsKey>` `<delegationFeeBips>` `<minStakeDuration>` `<rewardRecipient>` `<stakeAmount>` [--pchain-remaining-balance-owner-threshold `<threshold>`] [--pchain-disable-owner-threshold `<threshold>`] [--pchain-remaining-balance-owner-address `<address>`...] [--pchain-disable-owner-address `<address>`...]**
  Initiate validator registration on KiteStakingManager.
- **complete-validator-registration `<kiteStakingManagerAddress>` `<initiateTxHash>` `<blsProofOfPossession>` [--pchain-tx-private-key `<pchainTxPrivateKey>`] [--initial-balance `<initialBalance>`] [--skip-wait-api]**
  Complete validator registration on the P-Chain and on the KiteStakingManager after initiating registration.
- **initiate-delegator-registration `<kiteStakingManagerAddress>` `<nodeId>` `<rewardRecipient>` `<stakeAmount>`**
  Initiate delegator registration on KiteStakingManager.
- **complete-delegator-registration `<kiteStakingManagerAddress>` `<initiateTxHash>` `<rpcUrl>` [--pchain-tx-private-key `<pchainTxPrivateKey>`]**
  Complete delegator registration on the P-Chain and on the KiteStakingManager after initiating registration.
- **initiate-delegator-removal `<kiteStakingManagerAddress>` `<delegationID>` [--include-uptime-proof] [--rpc-url `<rpcUrl>`]**
  Initiate delegator removal on KiteStakingManager.
- **complete-delegator-removal `<kiteStakingManagerAddress>` `<initiateRemovalTxHash>` `<rpcUrl>` [--pchain-tx-private-key `<pchainTxPrivateKey>`] [--skip-wait-api] [--delegation-id `<delegationID>`...] [--initiate-tx `<initiateTx>`]**
  Complete delegator removal on the P-Chain and on the KiteStakingManager after initiating removal.
- **initiate-validator-removal `<kiteStakingManagerAddress>` `<nodeId>` [--include-uptime-proof]**
  Initiate validator removal on KiteStakingManager.
- **complete-validator-removal `<kiteStakingManagerAddress>` `<initiateRemovalTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>`] [--skip-wait-api] [--node-id `<nodeId>`...] [--initiate-tx `<initiateTx>`...]**
  Complete validator removal on the P-Chain and on the KiteStakingManager after initiating removal.

### StakingVault Commands (`staking-vault`)

Alias: `sv`

- **deposit `<stakingVaultAddress>` `<amount>` `<minShares>`**
  Deposit native tokens (AVAX) into the StakingVault. `minShares` provides slippage protection.
- **request-withdrawal `<stakingVaultAddress>` `<shares>`**
  Request withdrawal from the StakingVault.
- **claim-withdrawal `<stakingVaultAddress>` `<requestId>`**
  Claim a withdrawal from the StakingVault.
- **process-epoch `<stakingVaultAddress>`**
  Process the current epoch in the StakingVault.
- **add-operator `<stakingVaultAddress>` `<operator>` `<allocationBips>` `<feeRecipient>`**
  Add an operator to the StakingVault. `allocationBips` is in basis points (1 bips = 0.01%).
- **update-operator-allocations `<stakingVaultAddress>` `<operator>` `<allocationBips>`**
  Update operator allocations in the StakingVault.
- **initiate-validator-registration `<stakingVaultAddress>` `<nodeId>` `<blsKey>` `<stakeAmount>` [--pchain-remaining-balance-owner-threshold `<threshold>`] [--pchain-disable-owner-threshold `<threshold>`] [--pchain-remaining-balance-owner-address `<address>`...] [--pchain-disable-owner-address `<address>`...]**
  Initiate validator registration in the StakingVault.
- **complete-validator-registration `<stakingVaultAddress>` `<initiateTxHash>` `<blsProofOfPossession>` [--pchain-tx-private-key `<pchainTxPrivateKey>`] [--initial-balance `<initialBalance>`] [--skip-wait-api]**
  Complete validator registration on the P-Chain and on the StakingVault after initiating registration.
- **initiate-validator-removal `<stakingVaultAddress>` `<nodeId>`**
  Initiate validator removal in the StakingVault.
- **complete-validator-removal `<stakingVaultAddress>` `<initiateRemovalTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>`] [--skip-wait-api] [--node-id `<nodeId>`...] [--initiate-tx `<initiateTx>`]**
  Complete validator removal on the P-Chain and on the StakingVault after initiating removal.
- **force-remove-validator `<stakingVaultAddress>` `<nodeId>`**
  Force remove a validator from the StakingVault (admin/emergency operation).
- **initiate-delegator-registration `<stakingVaultAddress>` `<nodeId>` `<amount>`**
  Initiate delegator registration in the StakingVault.
- **complete-delegator-registration `<stakingVaultAddress>` `<initiateTxHash>` `<rpcUrl>` [--pchain-tx-private-key `<pchainTxPrivateKey>`]**
  Complete delegator registration on the P-Chain and on the StakingVault after initiating registration.
- **initiate-delegator-removal `<stakingVaultAddress>` `<delegationID>`**
  Initiate delegator removal in the StakingVault.
- **complete-delegator-removal `<stakingVaultAddress>` `<initiateRemovalTxHash>` [--pchain-tx-private-key `<pchainTxPrivateKey>`] [--skip-wait-api] [--delegation-id `<delegationID>`...] [--initiate-tx `<initiateTx>`]**
  Complete delegator removal on the P-Chain and on the StakingVault after initiating removal.
- **force-remove-delegator `<stakingVaultAddress>` `<delegationID>`**
  Force remove a delegator from the StakingVault (admin/emergency operation).
- **info `<stakingVaultAddress>`**
  Get general overview of the StakingVault.
- **fees-info `<stakingVaultAddress>`**
  Get fees configuration of the StakingVault.
- **operators-info `<stakingVaultAddress>`**
  Get operators details of the StakingVault.
- **validators-info `<stakingVaultAddress>`**
  Get validators details per operator of the StakingVault.
- **delegators-info `<stakingVaultAddress>`**
  Get delegations details per operator of the StakingVault.
- **withdrawals-info `<stakingVaultAddress>`**
  Get withdrawal queue info of the StakingVault.
- **epoch-info `<stakingVaultAddress>`**
  Get epoch info of the StakingVault.
- **full-info `<stakingVaultAddress>`**
  Get all information about the StakingVault (combines all info commands above).

### Ledger Commands (`ledger`)

- **addresses**
  Get addresses from connected Ledger device.
- **fix-usb-rules**
  Fix USB rules on Linux for Ledger device detection.

### Safe Commands (`safe`)

- **nonce `<safeAddress>`**
  Get the current nonce of a Safe.
- **get-role** [--account `<account>`]
  Get user role in the Safe (Owner, Delegate, or No role). Uses global `--safe` for the Safe address; optionally check a specific account with `--account`, otherwise uses the signer.

### Access Control Commands (`access-control`)

- **grant-role `<contractAddress>` `<role>` `<account>`**
  Grant a role to an account.
- **revoke-role `<contractAddress>` `<role>` `<account>`**
  Revoke a role from an account.
- **has-role `<contractAddress>` `<role>` `<account>`**
  Check if an account has a specific role.
- **get-role-admin `<contractAddress>` `<role>`**
  Get the admin role that controls a specific role.

### Completion

- **completion install**
  Install shell autocompletion for Bash and Zsh (uses default user shell; set `SHELL` to override).

### Other Commands

- **verify-abi `<address>` `<abi>`**
  Verify that a contract at a given address matches the expected Suzaku ABI (5% tolerance). This verification is done every time a contract is used and raises an error if validation fails.
- **top-up-l1-validators `<subnetID>` `<targetBalance>` [--node-id `<nodeId>]**
  Top up all/selected l1 validators to meet a target continuous fee balance.
- **help-all**
  Display help for all commands and sub-commands.

---

## Development Scripts

### Update ABIs (`scripts/update-abis.mjs`)

This script updates the ABI files in `src/abis/` from a Foundry output directory. It extracts ABIs from compiled contract JSON files, deduplicates overloaded functions, and generates TypeScript files.

**Usage:**

```bash
# Use the default source directory
scripts/update-abis.mjs

# Specify a custom source directory
scripts/update-abis.mjs --source-dir /path/to/foundry/out
scripts/update-abis.mjs -s /path/to/foundry/out

# Show help
scripts/update-abis.mjs --help
```

**Options:**

| Option                | Alias | Description                                                            |
| --------------------- | ----- | ---------------------------------------------------------------------- |
| `--source-dir <path>` | `-s`  | Path to the Foundry output directory containing compiled contract ABIs |
| `--help`              | `-h`  | Show help message                                                      |

**What it does:**

1. Reads contract ABIs from the Foundry `out/` directory
2. Deduplicates overloaded functions (keeps the version with the fewest parameters)
3. Generates TypeScript files in `src/abis/`
4. Updates `abi-selectors.json` with function selectors for ABI validation

**What next:**

1. Update the index.ts file in `src/abis/` with the new ABIs
2. If a contract is not a proxy but use the forward and delegate call pattern, add a combined ABI in the index.ts file (like with the StakingVault), and validate only the abi of the targeted contract address (as done in curriedContract function in `src/lib/viemUtils.ts`). Then you can instantiate the contract with the combined abi.
