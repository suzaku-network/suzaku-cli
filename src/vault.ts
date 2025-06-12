import { ExtendedWalletClient } from './client';
import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';

// deposit
export async function depositVault(
  client: ExtendedWalletClient,
  vault: SafeSuzakuContract['VaultTokenized'],
  onBehalfOf: Hex,
  amountWei: bigint,
  account: Account | undefined
) {
  console.log("Depositing...");

  try {
    if (!account) throw new Error('Client account is required');

    const collateralAddress = await vault.read.collateral();

    console.log("Approving collateral token for vault deposit...");
    const approveTx = await vault.safeWrite.approve(
      [vault.address, amountWei],
      { chain: null, account }
    );
    // Wait for the approval transaction to be mined
    await client.waitForTransactionReceipt({ hash: approveTx });

    // === Existing deposit code (unchanged) ===
    const hash = await vault.safeWrite.deposit(
      [onBehalfOf, amountWei],
      { chain: null, account }
    );
    console.log("Deposit done, tx hash:", hash);

  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
  assetClass: bigint,
  operatorAddress: Hex
) {
  return await delegator.read.stake(
    [l1Address, assetClass, operatorAddress]
  );
}
