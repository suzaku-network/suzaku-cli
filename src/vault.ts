import { ExtendedWalletClient } from './client';
import { Config } from './config';
import { SafeSuzakuContract } from './lib/viemUtils';
import { type Hex, type Account, parseUnits } from 'viem';

// deposit
export async function depositVault(
  client: ExtendedWalletClient,
  config: Config,
  vaultAddress: Hex,
  onBehalfOf: Hex,
  amount: string,
  account: Account | undefined
) {
  console.log("Depositing...");

  try {
    if (!account) throw new Error('Client account is required');

    // Get the collateral token address
    const vault = config.contracts.VaultTokenized(vaultAddress);
    const collateralAddress = await vault.read.collateral();
    const collateral = config.contracts.DefaultCollateral(collateralAddress);
    const decimals = await collateral.read.decimals();
    // Calculate human-readable amount
    const amountWei = parseUnits(amount, decimals)
    console.log("\n=== Deposit Details ===");
    console.log("Amount:", amount, "tokens");
    console.log("Amount in wei:", amountWei.toString());
    console.log("Decimals used:", decimals);
    
    console.log("Collateral address:", collateralAddress);
    console.log("Vault address:", vault.address);

    // Approve the vault to spend collateral tokens
    console.log("\n=== Collateral Approval ===");
    console.log("Approving:", amount, "tokens");
    console.log("Approval amount in wei:", amountWei.toString());
    console.log("Spender (vault):", vault.address);
    const approveTx = await collateral.safeWrite.approve(
      [vault.address, amountWei],
      { chain: null, account }
    );
    console.log("Approval tx hash:", approveTx);
    
    // Wait for the approval transaction to be mined
    console.log("Waiting for approval confirmation...");
    const approvalReceipt = await client.waitForTransactionReceipt({ hash: approveTx });
    console.log("Approval confirmed in block:", approvalReceipt.blockNumber);

    // === Existing deposit code (unchanged) ===
    console.log("\n=== Executing Deposit ===");
    console.log("Depositing:", amount, "tokens");
    console.log("Deposit amount in wei:", amountWei.toString());
    console.log("On behalf of:", onBehalfOf);
    const hash = await vault.safeWrite.deposit(
      [onBehalfOf, amountWei],
      { chain: null, account }
    );
    console.log("Deposit tx hash:", hash);
    
    // Wait for deposit confirmation
    console.log("Waiting for deposit confirmation...");
    const depositReceipt = await client.waitForTransactionReceipt({ hash: hash });
    console.log("Deposit confirmed in block:", depositReceipt.blockNumber);
    console.log("✅ Deposit completed successfully!");

  } catch (error) {
    console.error("❌ Deposit failed:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function withdrawVault(
  vault: SafeSuzakuContract['VaultTokenized'],
  claimer: Hex,
  amountWei: bigint,
  account: Account | undefined
) {
  console.log("Withdrawing...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await vault.safeWrite.withdraw(
      [claimer, amountWei],
      { chain: null, account }
    );
    console.log("Withdraw done, tx hash:", hash);
    console.log("✅ Withdrawal completed successfully!");
  } catch (error) {
    console.error("❌ Withdrawal failed:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

// claim
export async function claimVault(
  vault: SafeSuzakuContract['VaultTokenized'],
  recipient: Hex,
  epoch: bigint,
  account: Account | undefined
) {
  console.log("Claiming...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await vault.safeWrite.claim(
      [recipient, epoch],
      { chain: null, account }
    );
    console.log("Claim done, tx hash:", hash);
    console.log("✅ Claim completed successfully!");
  } catch (error) {
    console.error("❌ Claim failed:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function getVaultDelegator(
  vault: SafeSuzakuContract['VaultTokenized']
) {
  return await vault.read.delegator();
}

export async function getStake(
  delegator: SafeSuzakuContract['L1RestakeDelegator'],
  l1Address: Hex,
  collateralClass: bigint,
  operatorAddress: Hex
) {
  return await delegator.read.stake(
    [l1Address, collateralClass, operatorAddress]
  );
}

// New read functions for vault information
export async function getVaultCollateral(
  vault: SafeSuzakuContract['VaultTokenized']
) {
  console.log("Reading vault collateral...");
  try {
    const collateral = await vault.read.collateral();
    console.log("Collateral token:", collateral);
    return collateral;
  } catch (error) {
    console.error("Failed to read collateral:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function getVaultBalanceOf(
  vault: SafeSuzakuContract['VaultTokenized'],
  account: Hex
) {
  console.log(`Reading vault balance for ${account}...`);
  try {
    const balance = await vault.read.balanceOf([account]);
    console.log("Vault token balance:", balance.toString());
    return balance;
  } catch (error) {
    console.error("Failed to read balance:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function getVaultActiveBalanceOf(
  vault: SafeSuzakuContract['VaultTokenized'],
  account: Hex
) {
  console.log(`Reading active vault balance for ${account}...`);
  try {
    const activeBalance = await vault.read.activeBalanceOf([account]);
    console.log("Active vault balance:", activeBalance.toString());
    return activeBalance;
  } catch (error) {
    console.error("Failed to read active balance:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function getVaultTotalSupply(
  vault: SafeSuzakuContract['VaultTokenized']
) {
  console.log("Reading vault total supply...");
  try {
    const totalSupply = await vault.read.totalSupply();
    console.log("Total supply:", totalSupply.toString());
    return totalSupply;
  } catch (error) {
    console.error("Failed to read total supply:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function getVaultWithdrawalSharesOf(
  vault: SafeSuzakuContract['VaultTokenized'],
  epoch: bigint,
  account: Hex
) {
  console.log(`Reading withdrawal shares for ${account} at epoch ${epoch}...`);
  try {
    const shares = await vault.read.withdrawalSharesOf([epoch, account]);
    console.log("Withdrawal shares:", shares.toString());
    return shares;
  } catch (error) {
    console.error("Failed to read withdrawal shares:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function getVaultWithdrawalsOf(
  vault: SafeSuzakuContract['VaultTokenized'],
  epoch: bigint,
  account: Hex
) {
  console.log(`Reading withdrawals for ${account} at epoch ${epoch}...`);
  try {
    const withdrawalAmount = await vault.read.withdrawalsOf([epoch, account]);
    console.log("Withdrawal amount:", withdrawalAmount.toString());
    return withdrawalAmount;
  } catch (error) {
    console.error("Failed to read withdrawals:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

// Staker approve collateral and deposit tokens to collateral contract
export async function approveAndDepositCollateral(
  client: ExtendedWalletClient,
  config: Config,
  collateralAddress: Hex,
  amount: string,
) {
  console.log("Approving collateral...");
  const account = client.account
  try {
    if (!account) throw new Error('Client account is required');

    const collateral = config.contracts.DefaultCollateral(collateralAddress);
    const rewardTokenAddress = await collateral.read.asset();
    const rewardToken = config.contracts.ERC20(rewardTokenAddress);
    const decimals = await collateral.read.decimals();
    const amountWei = parseUnits(amount, decimals)
    const hash = await rewardToken.safeWrite.approve(
      [collateralAddress, amountWei],
      { chain: null, account }
    );
    await client.waitForTransactionReceipt({ hash })
    console.log("Approval done, tx hash:", hash);
    const depositTx = await collateral.write.deposit([account.address, amountWei], { chain: null, account });
    await client.waitForTransactionReceipt({ hash: depositTx })
    console.log("Deposit to collateral done, tx hash:", depositTx);
  } catch (error) {
    console.error("❌ Approval failed:", error);
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    
  }
}
