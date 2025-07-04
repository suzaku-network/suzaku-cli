import { ExtendedWalletClient } from './client';
import { TContract } from './config';
import type { Hex, Account } from 'viem';

// deposit
export async function depositVault(
  client: ExtendedWalletClient,
  vault: TContract['VaultTokenized'],
  onBehalfOf: Hex,
  amountWei: bigint,
  account: Account | undefined
) {
  console.log("Depositing...");

  try {
    if (!account) throw new Error('Client account is required');

    const collateralAddress = await vault.read.collateral();

    console.log("Approving collateral token for vault deposit...");
    const approveTx = await vault.write.approve(
      [vault.address, amountWei],
      { chain: null, account }
    );
    // Wait for the approval transaction to be mined
    await client.waitForTransactionReceipt({ hash: approveTx });

    // === Existing deposit code (unchanged) ===
    const hash = await vault.write.deposit(
      [onBehalfOf, amountWei],
      { chain: null, account }
    );
    console.log("Deposit done, tx hash:", hash);

  } catch (error) {
    console.error("Transaction failed:", error);
  }
}

export async function withdrawVault(
  vault: TContract['VaultTokenized'],
  claimer: Hex,
  amountWei: bigint,
  account: Account | undefined
) {
  console.log("Withdrawing...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await vault.write.withdraw(
      [claimer, amountWei],
      { chain: null, account }
    );
    console.log("Withdraw done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
  }
}

// claim
export async function claimVault(
  vault: TContract['VaultTokenized'],
  recipient: Hex,
  epoch: bigint,
  account: Account | undefined
) {
  console.log("Claiming...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await vault.write.claim(
      [recipient, epoch],
      { chain: null, account }
    );
    console.log("Claim done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
  }
}

export async function getVaultDelegator(
  vault: TContract['VaultTokenized']
) {
  return await vault.read.delegator();
}

export async function getStake(
  delegator: TContract['L1RestakeDelegator'],
  l1Address: Hex,
  assetClass: bigint,
  operatorAddress: Hex
) {
  return await delegator.read.stake(
    [l1Address, assetClass, operatorAddress]
  );
}
