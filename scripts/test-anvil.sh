#!/usr/bin/env bash
set -euo pipefail

########################################
# Environment Variables
########################################
export CURATOR_OWNER=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export L1_OWNER=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
export OPERATOR_OWNER=0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
export STAKER_OWNER=0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97

export VAULT_MANAGER=0x05Aa229Aec102f78CE0E852A812a388F076Aa555
export VALIDATOR_MANAGER=0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F
export VAULT=0x10233c0dbD1B2A309743F5336E30b79248724360
export DELEGATOR=0xB13cA41129b7209bFD0392147aEf54B21DE06770
export OPERATOR=0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
export SAVAX=0x5FbDB2315678afecb367f032d93F642f64180aa3
export STAKER=0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f
export PRIMARY_ASSET=0x9f1ac54BEF0DD2f6f3462EA0fa94fC62300d3a8e
export MIDDLEWARE=0x1275D096B9DBf2347bD2a131Fb6BDaB0B4882487
export OPERATOR_REGISTRY=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
export L1_REGISTRY=0x0165878A594ca255338adfa4d48449f69242Eb8F

# RPC URL
export ANVIL_PORT="8545"
export RPC_URL="http://127.0.0.1:${ANVIL_PORT}"

########################################
# Logging Setup
########################################
LOGS_DIR="./logs"
TEST_LOG="$LOGS_DIR/test-run.log"
mkdir -p "$LOGS_DIR"

########################################
# Path to anvil.sh
########################################
DEPLOY_SCRIPT="suzaku-deployments/suzaku-protocol/anvil.sh"

echo "[INFO] Assuming anvil is already running on $RPC_URL"
echo "[INFO] 1) Deploying contracts via $DEPLOY_SCRIPT..."

########################################
# STEP 1: Deploy Contracts
########################################
if [ -f "$DEPLOY_SCRIPT" ]; then
  pushd "$(dirname "$DEPLOY_SCRIPT")" >/dev/null
  
  # (IMPORTANT) The next line runs anvil.sh and returns control after it's done
  bash "./$(basename "$DEPLOY_SCRIPT")" 2>&1 | tee "$TEST_LOG"
  
  popd >/dev/null
else
  echo "[WARN] $DEPLOY_SCRIPT not found — skipping deployment."
fi

echo "[INFO] 2) Deployment script finished. Now running CLI commands..."

########################################
# Helper function
########################################
run_cmd() {
  echo "--------------------------------------------------"
  echo "[RUN] $*"
  "$@"
  echo "[OK] $*"
}

########################################
# STEP 2: Run the TS CLI calls
########################################
{
  echo "=== 1) Register L1 ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
    register-l1 "$VALIDATOR_MANAGER" "$VAULT_MANAGER" "https://l1.com"

  echo ""
  echo "=== 2) Register Vault in VaultManager ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
    vault-manager-register-vault-l1 "$VAULT" 1 200000000000000000000000

  echo ""
  echo "=== 3) Register Operator ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$OPERATOR_OWNER" \
    register-operator "https://operator1.com"

  echo ""
  echo "=== 4) Operator Opt-in to L1 ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$OPERATOR_OWNER" \
    opt-in-l1 "$VALIDATOR_MANAGER"

  echo ""
  echo "=== 5) Check Operator => L1 Opt-in ==="
  run_cmd npx ts-node src/cli.ts --network anvil \
    check-opt-in-l1 "$OPERATOR" "$VALIDATOR_MANAGER"

  echo ""
  echo "=== 6) Operator Opt-in to Vault ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$OPERATOR_OWNER" \
    opt-in-vault "$VAULT"

  echo ""
  echo "=== 7) Check Operator => Vault Opt-in ==="
  run_cmd npx ts-node src/cli.ts --network anvil \
    check-opt-in-vault "$OPERATOR" "$VAULT"

  echo ""
  echo "=== 8) Set L1 limit (100,000 ETH) ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
    set-l1-limit "$VAULT" "$VALIDATOR_MANAGER" 100000000000000000000000 1

  echo ""
  echo "=== 9) Set operator-l1 shares (10) ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$L1_OWNER" \
    set-operator-l1-shares "$VAULT" "$VALIDATOR_MANAGER" "$OPERATOR" 10 1

  echo ""
  echo "=== 10) Deposit 300 tokens to Vault ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$STAKER_OWNER" \
    deposit "$VAULT" 300000000000000000000

  echo ""
  echo "=== 11) Withdraw 100 tokens from Vault ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$STAKER_OWNER" \
    withdraw "$VAULT" 100000000000000000000

  echo ""
  echo "=== 12) Claim from Vault, epoch=1 ==="
  run_cmd npx ts-node src/cli.ts --network anvil --private-key "$STAKER_OWNER" \
    claim "$VAULT" 1

  echo ""
  echo "[INFO] Done with CLI calls. More 'middleware-*' commands can go here if needed."
  echo ""
} 2>&1 | tee -a "$TEST_LOG"

echo "[INFO] All steps complete. Check '$TEST_LOG' for logs."
