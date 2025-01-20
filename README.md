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
# Replace PK & SUZAKU_CORE_PATH with a private key (e.g. Anvil #0) & path to suzaku-core directory from which the ABI files are fetched
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

### OK

```bash
# --- for general use (related to Networks) ---
python3 suzaku-cli.py isl1 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py l1s
python3 suzaku-cli.py l1ops 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# --- for general use (related to Operators) ---
python3 suzaku-cli.py isop 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py ops
python3 suzaku-cli.py opl1s 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py check-opt-in-l1 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py check-opt-in-vault 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
python3 suzaku-cli.py opstakes 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# --- for general use (related to Vaults) ---
python3 suzaku-cli.py isvault 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
python3 suzaku-cli.py vaults
python3 suzaku-cli.py vaultops 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
python3 suzaku-cli.py vaultl1s 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
python3 suzaku-cli.py vaultl1sops 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b

#--- for general use (related to Stakers) ---
python3 suzaku-cli.py active-balance-of 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py withdrawals-of 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 1 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py withdrawals-claimed 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 1 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# --- for Networks ---
python3 suzaku-cli.py register-l1 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 https://l1.com
python3 suzaku-cli.py set-max-l1-limit 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 10

# --- for Operators ---
python3 suzaku-cli.py register-operator https://operator1.com
python3 suzaku-cli.py opt-in-l1 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py opt-in-l1-signature 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py opt-out-l1 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py opt-out-l1-signature 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
python3 suzaku-cli.py opt-in-vault 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
python3 suzaku-cli.py opt-in-vault-signature 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
python3 suzaku-cli.py opt-out-vault 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
python3 suzaku-cli.py opt-out-vault-signature 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b
python3 suzaku-cli.py op-vault-l1-stake 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# --- for Stakers ---
python3 suzaku-cli.py deposit 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 10
python3 suzaku-cli.py withdraw 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 5
python3 suzaku-cli.py claim 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 1

# --- for Vault Curators ---
python3 suzaku-cli.py set-l1-limit 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 1
python3 suzaku-cli.py set-operator-l1-shares 0x670EA377eF80c40F717871e0Fd92eC6D7AC7328b 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 10
```
