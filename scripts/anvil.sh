#!/usr/bin/env bash
set -euo pipefail

########################################
# Environment Variables
########################################
export CURATOR_OWNER=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export L1_OWNER=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
export OPERATOR_OWNER=0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba
export STAKER_OWNER=0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97

export VAULT_MANAGER=0x05Aa229Aec102f78CE0E852A812a388F076Aa555
export VALIDATOR_MANAGER=0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F
export VAULT=0x10233c0dbD1B2A309743F5336E30b79248724360
export DELEGATOR=0xB13cA41129b7209bFD0392147aEf54B21DE06770
export OPERATOR=0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
export SAVAX=0x5FbDB2315678afecb367f032d93F642f64180aa3
export STAKER=0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f
export PRIMARY_ASSET=0x9f1ac54BEF0DD2f6f3462EA0fa94fC62300d3a8e
export COLLATERAL=0x9f1ac54BEF0DD2f6f3462EA0fa94fC62300d3a8e
export MIDDLEWARE=0x1275D096B9DBf2347bD2a131Fb6BDaB0B4882487
export OPERATOR_REGISTRY=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
export L1_REGISTRY=0x0165878A594ca255338adfa4d48449f69242Eb8F
export OP_L1_OPT_IN=0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
export OP_VAULT_OPT_IN=0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6

export ANVIL_PORT="8545"
export RPC_URL="http://127.0.0.1:${ANVIL_PORT}"

########################################
# Globals
########################################
export LOGS_DIR="./logs"
export TEST_LOG="$LOGS_DIR/test-run.log"
export DEPLOY_SCRIPT="suzaku-deployments/suzaku-protocol/anvil.sh"
export ROOT_DIR="$(pwd)"

########################################
# Init
########################################
mkdir -p "$LOGS_DIR"

########################################
# Logging
########################################
log_info() { printf "[INFO] %s\n" "$1"; }
log_warn() { printf "[WARN] %s\n" "$1" >&2; }
log_err()  { printf "[ERROR] %s\n" "$1" >&2; }

########################################
# Execute Deploy Script in Subshell
########################################
run_deploy_script() {
  if [[ ! -f "$DEPLOY_SCRIPT" ]]; then
    log_warn "$DEPLOY_SCRIPT not found — skipping deployment."
    return 0
  fi

  local deploy_dir; deploy_dir="$(dirname "$DEPLOY_SCRIPT")"
  local deploy_script_name; deploy_script_name="$(basename "$DEPLOY_SCRIPT")"

  log_info "Assuming anvil is already running on $RPC_URL"
  log_info "1) Deploying contracts via $DEPLOY_SCRIPT..."

  (
    cd "$deploy_dir" || return 1
    bash "./$deploy_script_name"
  ) 2>&1 | tee "$TEST_LOG"
}

########################################
# Run and Inspect CLI Command Output
########################################
run_cmd() {
  printf "%s\n" "--------------------------------------------------"
  printf "[RUN] %s\n" "$*"

  local output_file; output_file=$(mktemp)
  if ! "$@" >"$output_file" 2>&1; then
    log_err "Command failed: $*"
    cat "$output_file" >&2
    rm -f "$output_file"
    return 1
  fi

  grep -E "error|fail|revert|panic|invalid|exception" -i "$output_file" >&2 || true
  grep -E "success|confirmed|complete|done|txHash|address|deployed" -i "$output_file" || true

  cat "$output_file" >>"$TEST_LOG"
  rm -f "$output_file"
  printf "[OK] %s\n" "$*"
}

########################################
# Run TS CLI Steps
########################################
run_ts_cli_calls() {
  cd "$ROOT_DIR" || return 1

  {
    printf "%s\n" "=== 1) Register L1 ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
      register-l1 "$VALIDATOR_MANAGER" "$VAULT_MANAGER" "https://l1.com"

    printf "\n%s\n" "=== 2) Register Vault in VaultManager ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
      vault-manager-register-vault-l1 "$VAULT" 1 200000000000000000000000

    printf "\n%s\n" "=== 3) Register Operator ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$OPERATOR_OWNER" \
      register-operator "https://operator1.com"

    printf "\n%s\n" "=== 4) Operator Opt-in to L1 ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$OPERATOR_OWNER" \
      opt-in-l1 "$VALIDATOR_MANAGER"

    printf "\n%s\n" "=== 5) Check Operator => L1 Opt-in ==="
    run_cmd npx ts-node src/cli.ts --network anvil \
      check-opt-in-l1 "$OPERATOR" "$VALIDATOR_MANAGER"

    printf "\n%s\n" "=== 6) Operator Opt-in to Vault ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$OPERATOR_OWNER" \
      opt-in-vault "$VAULT"

    printf "\n%s\n" "=== 7) Check Operator => Vault Opt-in ==="
    run_cmd npx ts-node src/cli.ts --network anvil \
      check-opt-in-vault "$OPERATOR" "$VAULT"

    printf "\n%s\n" "=== 8) Set L1 limit (100,000 ETH) ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
      set-l1-limit "$DELEGATOR" "$VALIDATOR_MANAGER" 100000000000000000000000 1

    printf "\n%s\n" "=== 9) Set operator-l1 shares (10) ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
      set-operator-l1-shares "$DELEGATOR" "$VALIDATOR_MANAGER" "$OPERATOR" 10 1

    printf "\n%s\n" "=== 0.1) Mint sAVAX to STAKER ==="
    run_cmd cast send "$SAVAX" "mint(address,uint256)" "$STAKER" 50000000000000000000000 \
      --private-key "$CURATOR_OWNER" \
     --rpc-url "$RPC_URL"

    printf "\n%s\n" "=== 0.2) Check sAVAX allowance for STAKER => PRIMARY_ASSET ==="
    run_cmd cast call "$SAVAX" "allowance(address,address)" "$STAKER" "$PRIMARY_ASSET" \
      --rpc-url "$RPC_URL"

    printf "\n%s\n" "=== 0.3) Approve sAVAX => PRIMARY_ASSET for STAKER ==="
    run_cmd cast send "$SAVAX" "approve(address,uint256)" "$PRIMARY_ASSET" 5000000000000000000000 \
      --private-key "$STAKER_OWNER" \
      --rpc-url "$RPC_URL"

    printf "\n%s\n" "=== 0.4) (Optional) Deposit on the sAVAX contract directly if needed ==="
    run_cmd cast send "$PRIMARY_ASSET" "deposit(address,uint256)" "$STAKER" 300000000000000000000 \
      --private-key "$STAKER_OWNER" \
      --rpc-url "$RPC_URL"

    printf "\n%s\n" "=== 10) Deposit 300 tokens to Vault ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$STAKER_OWNER" \
      deposit "$VAULT" 300000000000000000000

    printf "\n%s\n" "=== 11) Withdraw 100 tokens from Vault ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$STAKER_OWNER" \
      withdraw "$VAULT" 100000000000000000000


    printf "\n%s\n" "=== 12) Register operator in the Middleware ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
      middleware-register-operator "$OPERATOR"

    printf "\n%s\n" "=== 13) Check current epoch in the middleware ==="
    run_cmd npx ts-node src/cli.ts --network anvil \
      middleware-get-current-epoch

    # We'll assume epoch=0 for testing; adapt if needed
    printf "\n%s\n" "=== 14) Calc & Cache stakes for epoch=0, assetClass=1 ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
      middleware-operator-cache 0 1

    printf "\n%s\n" "=== 15) Read operator stake for epoch=0, assetClass=1 ==="
    run_cmd npx ts-node src/cli.ts --network anvil \
      middleware-get-operator-stake "$OPERATOR" 0 1


    # Increase time by 2 hours (or whatever EPOCH_DURATION is)
    cast rpc evm_increaseTime 7200

    # Then mine a block so the new timestamp is realized
    cast rpc evm_mine

    printf "\n%s\n" "=== 15.1) Check current epoch in the middleware ==="
    npx ts-node src/cli.ts --network anvil middleware-get-current-epoch

    printf "\n%s\n" "=== 15.2) Calc & Cache stakes for epoch=1, assetClass=1 ==="
    npx ts-node src/cli.ts --network anvil \
      --private-key "$L1_OWNER" \
      middleware-operator-cache 1 1

    npx ts-node src/cli.ts --network anvil \
      --private-key "$L1_OWNER" \
      middleware-operator-cache 2 1
    
    # Add this before trying to add a node
    printf "\n%s\n" "=== 15.5) Set up security module in the middleware ==="
    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
    balancer-set-up-security-module "$MIDDLEWARE" 1000000 

    # Check if operator exists in the middleware
    npx ts-node src/cli.ts --network anvil middleware-get-all-operators

    # Check the operator's cached stake
    npx ts-node src/cli.ts --network anvil middleware-get-operator-stake "$OPERATOR" 0 1

    # Check the operator's locked stake
    npx ts-node src/cli.ts --network anvil middleware-get-operator-locked-stake "$OPERATOR"

    # Check the operator's used weight
    npx ts-node src/cli.ts --network anvil middleware-get-operator-used-weight "$OPERATOR"

    # Check the operator's nodes length
    npx ts-node src/cli.ts --network anvil middleware-get-operator-nodes-length "$OPERATOR"

    # 1) Grab the latest block timestamp from Anvil
    LATEST_TS=$(cast block latest --rpc-url "$RPC_URL" --json | jq -r '.timestamp')
    # 2) Add two hours
    export REGISTRATION_EXPIRY=$((LATEST_TS + 7200))

    log_info "Latest block timestamp = $LATEST_TS"
    log_info "Using registrationExpiry = $REGISTRATION_EXPIRY (2 hours from now)"

    run_cmd npx ts-node src/cli.ts --network anvil --private-key "$OPERATOR_OWNER" \
      middleware-add-node \
      0x00000000000000000000000039a662260f928d2d98ab5ad93aa7af8e0ee4d426 \
      0xb6d4ef306dcbfd1fb4e9ba75e47caf564f170eccc7a17033f40a2887fe6887b5c245e6dd38ba34a5be81683dc0d6394e \
      "0" \
      1 \
      1 \
      100000000000000000000 \
      --pchain-address 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc \
      --reward-address 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc

    printf "\n%s\n" "[INFO] Done with CLI calls. Check the logs above.\n"
  } 2>&1 | tee -a "$TEST_LOG"
}

########################################
# Main
########################################
main() {
  if ! run_deploy_script; then
    log_err "Deploy script failed. Aborting."
    return 1
  fi

  if ! run_ts_cli_calls; then
    log_err "CLI script failed."
    return 1
  fi

  log_info "All steps complete. Check '$TEST_LOG' for logs."
}

main "$@"
