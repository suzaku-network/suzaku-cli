
Steps to launch on anvil

```bash

git clone git@github.com:suzaku-network/suzaku-deployments.git
cd suzaku-deployments/suzaku-protocol
forge install
# launch anvil in an other terminal
./anvil.sh
# Check deployments in suzaku-deployments//suzaku-protocol/deployments/31337

export PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d # Anvil #1
python3 suzaku-cli.py register-l1 0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F 0x05Aa229Aec102f78CE0E852A812a388F076Aa555 https://l1.com
python3 suzaku-cli.py register-vault-l1 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944 1 20000000000000000000 # 20 ETH


# As an Operator
export PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a # Anvil #2
## Register the Operator in the OperatorRegistry
python3 suzaku-cli.py register-operator https://operator1.com
## Opt-in to the L1 via the OperatorL1OptInService
python3 suzaku-cli.py opt-in-l1 0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F
## Verify the opt-in via the OperatorL1OptInService
python3 suzaku-cli.py check-opt-in-l1 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F
## Opt-in to the Vault via the OperatorVaultOptInService. Vault deployed by FullLocalDeploymentScript
python3 suzaku-cli.py opt-in-vault 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944
## Verify the opt-in via the OperatorVaultOptInService
python3 suzaku-cli.py check-opt-in-vault 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944


export PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d # Anvil #1
or
export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # Anvil #0
## Set the limit for the L1 at the vault's delegator
python3 suzaku-cli.py set-l1-limit 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944 0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F 10000000000000000000 1 # 10 ETH
## check
cast call 0xb99306F46e859A524bE419907B4a0572B368241E "l1Limit(address,uint96)(uint256)" \
  0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F 1

python3 suzaku-cli.py set-operator-l1-shares 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944 0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 10


export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # Anvil #0

cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 "mint(address to, uint256 amount)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 5000000000000000000 --private-key $PK --rpc-url http://127.0.0.1:8545

cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 "allowance(address,address)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0x9f1ac54BEF0DD2f6f3462EA0fa94fC62300d3a8e --rpc-url http://127.0.0.1:8545

cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 "approve(address,uint256)" 0x9f1ac54BEF0DD2f6f3462EA0fa94fC62300d3a8e 5000000000000000000 --private-key $PK --rpc-url http://127.0.0.1:8545

cast send 0x9f1ac54BEF0DD2f6f3462EA0fa94fC62300d3a8e "deposit(address,uint256)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 5000000000000000000 --private-key $PK --rpc-url http://127.0.0.1:8545

# Optional if whitelist not to false
cast send 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944 \
    "setDepositorWhitelistStatus(address,bool)" \
    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 true \
    --private-key $PK

python3 suzaku-cli.py deposit 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944 2 # 2 ETH
## Withdraw from the vault
python3 suzaku-cli.py withdraw 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944 1
## Claim a withdrawal for some epoch at the vault
python3 suzaku-cli.py claim 0xb0e39dbeB9Fe12Da8c92Dbe7FEf12298b5813944 1

python3 suzaku-cli.py opstakes 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

python3 suzaku-cli.py l1stakes 0x948B3c65b89DF0B4894ABE91E6D02FE579834F8F

export PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d # Anvil #1

python3 suzaku-cli.py middleware-get-current-epoch

python3 suzaku-cli.py middleware-register-operator 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

python3 suzaku-cli.py middleware-operator-cache 0 1 # epoch asset-class

python3 suzaku-cli.py middleware-get-operator-stake 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 1 1

python3 suzaku-cli.py balancer-set-up-security-module 0x1275D096B9DBf2347bD2a131Fb6BDaB0B4882487 18000000000000000000

cast rpc evm_increaseTime 7200
cast rpc evm_mine

python3 suzaku-cli.py middleware-get-current-epoch

python3 suzaku-cli.py middleware-operator-cache 2 1

python3 suzaku-cli.py middleware-get-operator-stake 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 2 1


printf "0x%s\n" "$(openssl rand -hex 32)"
#0x50afbbf944a2854fbe7c612fa0eff9f37eb2616f5b0dd8487335aa12e9b64561
printf "0x%s\n" "$(openssl rand -hex 48)"
#0x63e99393a216625bdd41034dd1ca1b959bb72232df952d53e842d57d2e6f455fd5053c8d4b12637c24cf802020aa4444
# 30 days example
echo $((16#$(cast block --json | jq -r '.timestamp' | sed 's/^0x//') + 30 * 86400))

export PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a # Anvil #2
python3 suzaku-cli.py middleware-add-node \
  0x50afbbf944a2854fbe7c612fa0eff9f37eb2616f5b0dd8487335aa12e9b64561 \
  0x63e99393a216625bdd41034dd1ca1b959bb72232df952d53e842d57d2e6f455fd5053c8d4b12637c24cf802020aa4444 \
  1745070827 \
  1 \
  --pchain-address 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  1 \
  --reward-address 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  500000000000000000

# This last step should fail due to initializeValidatorSet() not being possible. Would require a mock BalancerValidatorManager.
# 100000000000000 min-node
# 20000000000000000000 max-vault-l1-limit
# 10000000000000000000 set-l1-limit
# 5000000000000000000 holder collateral
# 1000000000000000000 holder in vault
# 1000000000000000000000 max-node

```
