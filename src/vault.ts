import { ExtendedWalletClient } from './client';
import { Config } from './config';
import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import { type Hex, type Account, parseUnits } from 'viem';
import { logger } from './lib/logger';

// deposit
export async function depositVault(
  config: Config<ExtendedWalletClient>,
  vaultAddress: Hex,
  onBehalfOf: Hex,
  amount: string,
) {
  logger.log("Depositing...");
  const client = config.client;
  // Get the collateral token address
  const vault = await config.contracts.VaultTokenized(vaultAddress);
  const collateralAddress = await vault.read.collateral();
  const collateral = await config.contracts.DefaultCollateral(collateralAddress);
  const decimals = await collateral.read.decimals();
  // Calculate human-readable amount
  const amountWei = parseUnits(amount, decimals)
  logger.log("\n=== Deposit Details ===");
  logger.log("Amount:", amount, "tokens");
  logger.log("Amount in wei:", amountWei.toString());
  logger.log("Decimals used:", decimals);

  logger.log("Collateral address:", collateralAddress);
  logger.log("Vault address:", vault.address);

  // Approve the vault to spend collateral tokens
  logger.log("\n=== Collateral Approval ===");
  logger.log("Approving:", amount, "tokens");
  logger.log("Approval amount in wei:", amountWei.toString());
  logger.log("Spender (vault):", vault.address);
  const approveTx = await collateral.safeWrite.approve([vault.address, amountWei]);
  logger.log("Approval tx hash:", approveTx);

  // Wait for the approval transaction to be mined
  logger.log("Waiting for approval confirmation...");
  const approvalReceipt = await client.waitForTransactionReceipt({ hash: approveTx });
  logger.log("Approval confirmed in block:", approvalReceipt.blockNumber);

  // === Existing deposit code (unchanged) ===
  logger.log("\n=== Executing Deposit ===");
  logger.log("Depositing:", amount, "tokens");
  logger.log("Deposit amount in wei:", amountWei.toString());
  logger.log("On behalf of:", onBehalfOf);
  const hash = await vault.safeWrite.deposit([onBehalfOf, amountWei]);
  logger.log("Deposit tx hash:", hash);

  // Wait for deposit confirmation
  logger.log("Waiting for deposit confirmation...");
  const depositReceipt = await client.waitForTransactionReceipt({ hash: hash });
  logger.log("Deposit confirmed in block:", depositReceipt.blockNumber);
  logger.log("✅ Deposit completed successfully!");

}

export async function withdrawVault(
  vault: SafeSuzakuContract['VaultTokenized'],
  claimer: Hex,
  amountWei: bigint
) {
  logger.log("Withdrawing...");

  const hash = await vault.safeWrite.withdraw([claimer, amountWei]);
  logger.log("Withdraw done, tx hash:", hash);
  logger.log("✅ Withdrawal completed successfully!");
}

// claim
export async function claimVault(
  vault: SafeSuzakuContract['VaultTokenized'],
  recipient: Hex,
  epoch: bigint
) {
  logger.log("Claiming...");

  const hash = await vault.safeWrite.claim([recipient, epoch]);
  logger.log("Claim done, tx hash:", hash);
  logger.log("✅ Claim completed successfully!");
}

export async function getVaultDelegator(
  vault: SuzakuContract['VaultTokenized']
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
  vault: SuzakuContract['VaultTokenized']
) {
  logger.log("Reading vault collateral...");

  const collateral = await vault.read.collateral();
  logger.log("Collateral token:", collateral);
  return collateral;

}

export async function getVaultBalanceOf(
  vault: SuzakuContract['VaultTokenized'],
  account: Hex
) {
  logger.log(`Reading vault balance for ${account}...`);

  const balance = await vault.read.balanceOf([account]);
  logger.log("Vault token balance:", balance.toString());
  return balance;
}

export async function getVaultActiveBalanceOf(
  vault: SuzakuContract['VaultTokenized'],
  account: Hex
) {
  logger.log(`Reading active vault balance for ${account}...`);

  const activeBalance = await vault.read.activeBalanceOf([account]);
  logger.log("Active vault balance:", activeBalance.toString());
  return activeBalance;
}

export async function getVaultTotalSupply(
  vault: SuzakuContract['VaultTokenized']
) {
  logger.log("Reading vault total supply...");

  const totalSupply = await vault.read.totalSupply();
  logger.log("Total supply:", totalSupply.toString());
  return totalSupply;
}

export async function getVaultWithdrawalSharesOf(
  vault: SuzakuContract['VaultTokenized'],
  epoch: bigint,
  account: Hex
) {
  logger.log(`Reading withdrawal shares for ${account} at epoch ${epoch}...`);

  const shares = await vault.read.withdrawalSharesOf([epoch, account]);
  logger.log("Withdrawal shares:", shares.toString());
  return shares;
}

export async function getVaultWithdrawalsOf(
  vault: SuzakuContract['VaultTokenized'],
  epoch: bigint,
  account: Hex
) {
  logger.log(`Reading withdrawals for ${account} at epoch ${epoch}...`);

  const withdrawalAmount = await vault.read.withdrawalsOf([epoch, account]);
  logger.log("Withdrawal amount:", withdrawalAmount.toString());
  return withdrawalAmount;
}

// Staker approve collateral and deposit tokens to collateral contract
export async function approveAndDepositCollateral(
  config: Config<ExtendedWalletClient>,
  collateralAddress: Hex,
  amount: string,
) {
  const client = config.client;
  logger.log("Approving collateral...");
  const account = client.account!

  const collateral = await config.contracts.DefaultCollateral(collateralAddress);
  const rewardTokenAddress = await collateral.read.asset();
  const rewardToken = await config.contracts.ERC20(rewardTokenAddress);
  const decimals = await collateral.read.decimals();
  const amountWei = parseUnits(amount, decimals)
  const hash = await rewardToken.safeWrite.approve([collateralAddress, amountWei]);
  await client.waitForTransactionReceipt({ hash })
  logger.log("Approval done, tx hash:", hash);
  const depositTx = await collateral.safeWrite.deposit([account.address, amountWei]);
  await client.waitForTransactionReceipt({ hash: depositTx })
  logger.log("Deposit to collateral done, tx hash:", depositTx);
}
