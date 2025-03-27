Below is a suggested sequence of commands (with minimal commentary) that covers L1 registration, vault setup, operator registration, deposits/withdrawals, and node registration.

---

1. **Set Environment**
   - Fill your `.env` with `CURATOR_OWNER`, `L1_OWNER` and other variables you can find in .env.example.

2. **Register L1 + Vault on L1 Manager + set maxL1Limit**
   - ```bash
     python3 suzaku-cli.py --chain fuji register-l1 $VALIDATOR_MANAGER $VAULT_MANAGER https://l1.com --private-key $L1_OWNER
     python3 suzaku-cli.py --chain fuji vault-manager-register-vault-l1 $VAULT 1 200000000000000000000000 --private-key $L1_OWNER # 200_000 ETH
     ```
   
3. **Operator Setup**
   1. Register the operator:
      ```bash
      python3 suzaku-cli.py --chain fuji register-operator https://operator1.com --private-key $OPERATOR_OWNER
      ```
   2. Opt-in to L1:
      ```bash
      python3 suzaku-cli.py --chain fuji opt-in-l1 $VALIDATOR_MANAGER --private-key $OPERATOR_OWNER
      python3 suzaku-cli.py --chain fuji check-opt-in-l1 $OPERATOR $VALIDATOR_MANAGER
      ```
   3. Opt-in to the Vault:
      ```bash
      python3 suzaku-cli.py --chain fuji opt-in-vault $VAULT --private-key $OPERATOR_OWNER
      python3 suzaku-cli.py --chain fuji check-opt-in-vault $OPERATOR $VAULT
      ```

4. **Vault Limits & Operator Shares**
   - ```bash
     python3 suzaku-cli.py --chain fuji set-l1-limit $VAULT $VALIDATOR_MANAGER 100000000000000000000000 1 --private-key $L1_OWNER # 100_000 ETH
     python3 suzaku-cli.py --chain fuji set-operator-l1-shares $VAULT $VALIDATOR_MANAGER $OPERATOR 10 --private-key $L1_OWNER
     ```

5. **(Optional) Mint & Approve sAVAX, Then Deposit via `cast`**
   1. Mint:
      ```bash
      cast send "$SAVAX" "mint(address,uint256)" "$STAKER" 50000000000000000000000 \
        --private-key "$CURATOR_OWNER"
      ```
   2. Check allowance:
      ```bash
      cast call "$SAVAX" "allowance(address,address)" "$STAKER" "$PRIMARY_ASSET"
      ```
   3. Approve:
      ```bash
      cast send "$SAVAX" "approve(address,uint256)" "$PRIMARY_ASSET" 5000000000000000000000 \
        --private-key "$STAKER_OWNER"
      ```
   4. Deposit on Vault’s `deposit(address,uint256)`:
      ```bash
      cast send $PRIMARY_ASSET "deposit(address,uint256)" "$STAKER" 300000000000000000000 \
        --private-key "$STAKER_OWNER"
      ```

6. **Deposit / Withdraw / Claim via `suzaku-cli`**
   ```bash
   python3 suzaku-cli.py --chain fuji deposit $VAULT 300 --private-key $STAKER_OWNER
   python3 suzaku-cli.py --chain fuji withdraw $VAULT 100 --private-key $STAKER_OWNER
   python3 suzaku-cli.py --chain fuji claim $VAULT 100 --private-key $STAKER_OWNER
   ```

7. **Check Stakes & Epochs**
   ```bash
   python3 suzaku-cli.py --chain fuji opstakes $OPERATOR
   python3 suzaku-cli.py --chain fuji l1stakes $VALIDATOR_MANAGER
   python3 suzaku-cli.py --chain fuji middleware-get-current-epoch
   python3 suzaku-cli.py --chain fuji middleware-register-operator $OPERATOR --private-key $L1_OWNER
   python3 suzaku-cli.py --chain fuji middleware-operator-cache <current-epoch> 1 --private-key $L1_OWNER
   python3 suzaku-cli.py --chain fuji middleware-get-operator-stake $OPERATOR <current-epoch> 1
   ```

8. **Balancer / Security Module Setup**

Ensure the new module’s `maxWeight` roughly matches existing modules and aligns with your `WEIGHT_SCALE_FACTOR` set in the Middleware and the Churn rates set inthe Balancer.  
If it’s too large, you risk exceeding churn limits when adding stake. If too small, you can’t accommodate enough stake.
   ```bash
   python3 suzaku-cli.py --chain fuji balancer-set-up-security-module $MIDDLEWARE 1000000 --private-key $L1_OWNER
   python3 suzaku-cli.py --chain fuji balancer-get-security-modules
   ```

9.  **Simulate Time & Mine a Block**
evm_mine
   ```
   ```bash
   python3 suzaku-cli.py --chain fuji middleware-get-current-epoch
   python3 suzaku-cli.py --chain fuji middleware-operator-cache <current-epoch> 1 --private-key $L1_OWNER
   python3 suzaku-cli.py --chain fuji middleware-get-operator-stake $OPERATOR <next-epoch> 1
   ```

10. **Generate Random Keys (if needed)**

Generate a noed and their BLS keys, these will be added to the `L1` through the Middleware.

11. **Add Nodes**
Consider the amount of stake you will add to comply with the 
    ```bash
    python3 suzaku-cli.py --chain fuji middleware-add-node \
      0x... # NodeID \
      0x... # BLS Key \
      <expiry> # Timestamp completition expiration \
      1 \
      --pchain-address $OPERATOR \
      1 \
      --reward-address $OPERATOR \
      100000000000000000000 --private-key $OPERATOR_OWNER # 100 ETH
    ```
    - Repeat for additional nodes.

12. **Complete Validator Registration**
    ```bash
    python3 suzaku-cli.py --chain fuji middleware-complete-validator-registration \
      $OPERATOR \
      0x0... \
      0 \
      --private-key $OPERATOR_OWNER
    ```

13. **Adjust Security Module (if needed)**
    ```bash
    cast send $VALIDATOR_MANAGER "setUpSecurityModule(address,uint256)" \
      <SECURITY_MODULE> <NEW_MAX_WEIGHT> \
      --private-key <PRIVATE_KEY>
    ```

14. **Calculate & Check Node Weights**
    ```bash
    python3 suzaku-cli.py --chain fuji middleware-calc-node-weights --private-key $OPERATOR_OWNER
    python3 suzaku-cli.py --chain fuji middleware-get-active-nodes-for-epoch $OPERATOR <epoch> --private-key $OPERATOR_OWNER
    ```

---

Use this checklist in sequence to stand up the contracts on a local or test environment (Fuji).