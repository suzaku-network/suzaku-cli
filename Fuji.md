
Steps to launch on anvil
Fill .env with `CURATOR_OWNER` & `L1_OWNER` env vars

```bash

python3 suzaku-cli.py --chain fuji register-l1 $VALIDATOR_MANAGER $VAULT_MANAGER https://l1.com --private-key $L1_OWNER
python3 suzaku-cli.py --chain fuji register-vault-l1 $VAULT 1 200000000000000000000000 --private-key $L1_OWNER # 200_000 ETH

# As an Operator
## Register the Operator in the OperatorRegistry
python3 suzaku-cli.py --chain fuji register-operator https://operator1.com --private-key $OPERATOR_OWNER
## Opt-in to the L1 via the OperatorL1OptInService
python3 suzaku-cli.py --chain fuji opt-in-l1 $VALIDATOR_MANAGER --private-key $OPERATOR_OWNER
## Verify the opt-in via the OperatorL1OptInService
python3 suzaku-cli.py --chain fuji check-opt-in-l1 $OPERATOR $VALIDATOR_MANAGER
## Opt-in to the Vault via the OperatorVaultOptInService. Vault deployed by FullLocalDeploymentScript
python3 suzaku-cli.py --chain fuji opt-in-vault $VAULT --private-key $OPERATOR_OWNER
## Verify the opt-in via the OperatorVaultOptInService
python3 suzaku-cli.py --chain fuji check-opt-in-vault $OPERATOR $VAULT

## Set the limit for the L1 at the vault's delegator
python3 suzaku-cli.py --chain fuji set-l1-limit $VAULT $VALIDATOR_MANAGER 100000000000000000000000 1 --private-key $L1_OWNER # 100_000 ETH
## check
cast call $DELEGATOR "l1Limit(address,uint96)(uint256)" \
  $VALIDATOR_MANAGER 1

python3 suzaku-cli.py --chain fuji set-operator-l1-shares $VAULT $VALIDATOR_MANAGER $OPERATOR 10 --private-key $L1_OWNER


# 1) Mint 5000 sAVAX tokens to $STAKER
cast send "$SAVAX" \
  "mint(address to, uint256 amount)" \
  "$STAKER" 5000000000000000000000 \
  --private-key "$CURATOR_OWNER" \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc

# 2) Check allowance ($STAKER -> $PRIMARY_ASSET)
cast call "$SAVAX" \
  "allowance(address,address)" \
  "$STAKER" $PRIMARY_ASSET \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc

# 3) Approve 5000 sAVAX to $PRIMARY_ASSET on behalf of $STAKER
cast send "$SAVAX" \
  "approve(address,uint256)" \
  $PRIMARY_ASSET \
  5000000000000000000000 \
  --private-key "$STAKER_OWNER" \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc

# 4) Call deposit(address,uint256) on the vault ($PRIMARY_ASSET)
#    deposit 5000 sAVAX into the vault on behalf of $STAKER
cast send $PRIMARY_ASSET \
  "deposit(address,uint256)" \
  "$STAKER" 300000000000000000000 \
  --private-key "$STAKER_OWNER" \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc

# cast send $SAVAX "mint(address to, uint256 amount)" $STAKER 5000000000000000000000 --private-key $CURATOR_OWNER --rpc-url http://127.0.0.1:8545 

# cast call $SAVAX "allowance(address,address)" $STAKER $PRIMARY_ASSET --rpc-url http://127.0.0.1:8545

# cast send $SAVAX "approve(address,uint256)" $PRIMARY_ASSET 5000000000000000000000 --private-key $CURATOR_OWNER --rpc-url http://127.0.0.1:8545

# cast send $PRIMARY_ASSET "deposit(address,uint256)" $STAKER 5000000000000000000000 --private-key $CURATOR_OWNER --rpc-url http://127.0.0.1:8545

# # Optional if whitelist not to false
# cast send $VAULT \
#     "setDepositorWhitelistStatus(address,bool)" \
#     $STAKER true \
#     --private-key $CURATOR_OWNER

python3 suzaku-cli.py --chain fuji deposit $VAULT 300 --private-key $STAKER_OWNER # 300 ETH
## Withdraw from the vault
python3 suzaku-cli.py --chain fuji withdraw $VAULT 100 --private-key $STAKER_OWNER # 100 ETH
## Claim a withdrawal for some epoch at the vault
python3 suzaku-cli.py --chain fuji claim $VAULT 100 --private-key $STAKER_OWNER # 100 ETH

python3 suzaku-cli.py --chain fuji opstakes $OPERATOR

python3 suzaku-cli.py --chain fuji l1stakes $VALIDATOR_MANAGER

python3 suzaku-cli.py --chain fuji middleware-get-current-epoch

python3 suzaku-cli.py --chain fuji middleware-register-operator $OPERATOR --private-key $L1_OWNER

python3 suzaku-cli.py --chain fuji middleware-operator-cache 2 1 --private-key $L1_OWNER # epoch asset-class

python3 suzaku-cli.py --chain fuji middleware-get-operator-stake $OPERATOR 2 1

python3 suzaku-cli.py --chain fuji balancer-set-up-security-module $MIDDLEWARE 1000000 --private-key $L1_OWNER

cast rpc evm_increaseTime 7200 
cast rpc evm_mine

python3 suzaku-cli.py --chain fuji middleware-get-current-epoch

python3 suzaku-cli.py --chain fuji middleware-operator-cache 2 1 --private-key $L1_OWNER

python3 suzaku-cli.py --chain fuji middleware-get-operator-stake $OPERATOR 2 1


printf "0x%s\n" "$(openssl rand -hex 32)"
#0x50afbbf944a2854fbe7c612fa0eff9f37eb2616f5b0dd8487335aa12e9b64561
printf "0x%s\n" "$(openssl rand -hex 48)"
#0x63e99393a216625bdd41034dd1ca1b959bb72232df952d53e842d57d2e6f455fd5053c8d4b12637c24cf802020aa4444
# Given MAXIMUM_REGISTRATION_EXPIRY_LENGTH = 2, we put 2 days - 10 min
echo $(( $(cast block latest --rpc-url https://api.avax-test.network/ext/bc/C/rpc --json | jq -r '.timestamp') + ((2 * 86400) - 600) ))



python3 suzaku-cli.py --chain fuji middleware-add-node \
  0x50afbbf944a2854fbe7c612fa0eff9f37eb2616f5b0dd8487335aa12e9b64561 \
  0x63e99393a216625bdd41034dd1ca1b959bb72232df952d53e842d57d2e6f455fd5053c8d4b12637c24cf802020aa4444 \
  1742671629 \
  1 \
  --pchain-address $OPERATOR \
  1 \
  --reward-address $OPERATOR \
  200000000000000000000 --private-key $OPERATOR_OWNER

# This last step should fail due to initializeValidatorSet() not being possible. Would require a mock BalancerValidatorManager.
# 100000000000000 0.0001 Primariy Asset Min stake Anvil
# 20000000000000000000 20 maxL1Limit - registerVault
# 10000000000000000000 10 l1Limit
# 5000000000000000000 5 holder collateral
# 1000000000000000000 1 holder in vault
# 1000000000000000000000 1_000 Primariy Asset Max stake Anvil
# 1000000 0.000000000001 initialSecurityModuleWeight
# 18000000000000000000 SetupSecurityModule 18000000000000000000

# FUJI
# 100000000000000000000 100 Primariy Asset Min stake fuji

# 200000000000000000000000 200_000 maxL1Limit fuji
# 100000000000000000000000 100_000 l1Limit / set-l1-limit fuji
# 300000000000000000000 300 holder collateral fuji
# 200000000000000000000 200 available vault
# 1000000000000000000000000 1_000_000 holder in vault fuji
# 10 Operator Shares

# 10000000000000000000000 10_000 Primariy Asset Max stake fuji
# 10000 initialSecurityModuleWeight
# 1000000000000000000000 1_000 eth collateral min mintable 
# "churnPeriodSeconds": 3600,
# "maximumChurnPercentage": 20
# 1000000 0.000000000001 initialSecurityModuleWeight
```
