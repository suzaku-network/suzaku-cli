# Suzaku CLI (suzaku-cli)

Simple CLI tool for fetching data and interacting with Suzaku core smart contracts.

## Setup

### Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Environment

```bash
cp .env.example .env
# Replace PK & SUZAKU_CORE_PATH with a private key (e.g. Anvil #0) & the path to suzaku-core directory from which the ABI files are fetched
```

## Usage

```
Usage: suzaku-cli.py [OPTIONS] COMMAND [ARGS]...

Options:
  --chain CHAIN    Chain ID to use.  [default: anvil]
  --provider TEXT  Ethereum provider URL [http(s)].
  --help           Show this message and exit.

Commands:
  active-balance-of        Get an active balance of a given account at a...
  check-opt-in-l1          Check if operator is opted in to a L1.
  check-opt-in-vault       Check if operator is opted in to a vault.
  claim                    Claim a withdrawal for some epoch at the vault.
  deposit                  Deposit to the vault.
  isl1                     Check if address is L1.
  isop                     Check if address is operator.
  isvault                  Check if address is vault.
  l1ops                    List all operators opted in L1.
  l1s                      List all L1s.
  op-vault-l1-stake        Get operator stake in vault for L1.
  opl1s                    List all L1s where operator is opted in.
  ops                      List all operators.
  opstakes                 Show operator stakes in all L1s.
  opt-in-l1                Opt-in to a L1.
  opt-in-l1-signature      Get a signature for opt-in to a L1.
  opt-in-vault             Opt-in to a vault.
  opt-in-vault-signature   Get a signature for opt-in to a vault.
  opt-out-l1               Opt-out from a L1.
  opt-out-l1-signature     Get a signature for opt-out from a L1.
  opt-out-vault            Opt-out from a vault.
  opt-out-vault-signature  Get a signature for opt-out from a vault.
  register-l1              Register the signer as a L1.
  register-operator        Register the signer as an operator.
  set-l1-limit             Set a L1 limit at the vault's delegator.
  set-max-l1-limit         Set a maximum L1 limit at the vault's delegator.
  set-operator-l1-shares   Set an operator-L1 shares at the vault's...
  vaultl1s                 List all L1s associated with the given vault.
  vaultl1sops              List all operators and their associated L1s...
  vaultops                 List all operators opted into the given vault.
  vaults                   List all vaults.
  withdraw                 Withdraw from the vault.
  withdrawals-claimed      Check if some epoch's withdrawals of a given...
  withdrawals-of           Get some epoch's withdrawals of a given...
```

## TODO

- Write an end to end example using all the commands
- Catch & print errors everywhere rather than just having `Failed! Reason: 0xa090b95b`
- Don't use `mock_middleware` in `get_l1s` when we have a real middleware
- Make `python3 symb.py l1s --full` work
- What to do `delegator_type` 2 and 3 in `get_vaults`?
- Do we hardcode `delegator_type` to `0` everywhere?
- We don't have `setOperatorL1Shares` in `L1RestakeDelegator`?

## End-to-end example

```bash
# As a L1
export PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d # Anvil #1
## Register the L1 in the L1Registry. Using EOA as ValidatorManager & L1Middleware for now
python3 suzaku-cli.py register-l1 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 https://l1.com
## Set the max limit for the L1 at the vault's delegator
python3 suzaku-cli.py set-max-l1-limit <VAULT_ADDRESS> 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 20000000000000000000 # 20 ETH
# As an Operator
export PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a # Anvil #2
## Register the Operator in the OperatorRegistry
python3 suzaku-cli.py register-operator https://operator1.com
## Opt-in to the L1 via the OperatorL1OptInService
python3 suzaku-cli.py opt-in-l1 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
## Verify the opt-in via the OperatorL1OptInService
python3 suzaku-cli.py check-opt-in-l1 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
## Opt-in to the Vault via the OperatorVaultOptInService. Vault deployed by FullLocalDeploymentScript
python3 suzaku-cli.py opt-in-vault 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
## Verify the opt-in via the OperatorVaultOptInService
python3 suzaku-cli.py check-opt-in-vault 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b

# As a Vault Curator
export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # Anvil #0
## Set the limit for the L1 at the vault's delegator
python3 suzaku-cli.py set-l1-limit 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 10000000000000000000 # 10 ETH
## Set the operator's L1 shares at the vault's delegator
python3 suzaku-cli.py set-operator-l1-shares 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 10

## As a Staker
export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # Anvil #0
## Deposit to the vault
python3 suzaku-cli.py deposit 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 2 # 2 ETH
## Withdraw from the vault
python3 suzaku-cli.py withdraw 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 1
## Claim a withdrawal for some epoch at the vault
python3 suzaku-cli.py claim 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 1
```

## Operator recap

```bash
python3 suzaku-cli.py opstakes 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
```

```
Connected to chain ID 31337
Operator: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
L1s [1 total]:
  L1: ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'https://l1.com']
    Collateral: 0x5FbDB2315678afecb367f032d93F642f64180aa3 (TOKEN)
      Vault: 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
        Type: L1Restake / NonSlashable
        Stake: 2.0
    Total stake: 2.0 TOKEN

Total stakes:
  Collateral 0x5FbDB2315678afecb367f032d93F642f64180aa3 (TOKEN): 2.0
```

## L1 recap

```bash
python3 suzaku-cli.py l1stakes 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

```
Connected to chain ID 31337
L1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Operators [1 total]:
  Operator: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
    Collateral: 0x5FbDB2315678afecb367f032d93F642f64180aa3 (TOKEN)
      Vault: 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
        Type: L1Restake / NonSlashable
        Stake: 2.0
    Total stake: 2.0 TOKEN

Total stakes:
  Collateral 0x5FbDB2315678afecb367f032d93F642f64180aa3 (TOKEN): 2.0
```
