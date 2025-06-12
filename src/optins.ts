import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';

/**
 * Operator -> L1
 */
export async function optInL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account | undefined
) {
  console.log(`Opting in to L1: ${l1Address}`);
  try {
    if (!account) throw new Error('Client account is required');
    const hash = await service.safeWrite.optIn(
      [l1Address],
      { chain: null, account }
    );
    console.log("optInL1 successful! Tx hash:", hash);
  } catch (error) {
    console.error("optInL1 failed:", error);
  }
}

export async function optOutL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account | undefined
) {
  console.log(`Opting out from L1: ${l1Address}`);
  try {
    if (!account) throw new Error('Client account is required');
    const hash = await service.safeWrite.optOut(
      [l1Address],
      { chain: null, account }
    );
    console.log("optOutL1 successful! Tx hash:", hash);
  } catch (error) {
    console.error("optOutL1 failed:", error);
  }
}

export async function checkOptInL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  operator: Hex,
  l1Address: Hex
) {
  try {
    const isOptedIn = await service.read.isOptedIn(
      [operator, l1Address]
    );
    console.log(`Operator ${operator} isOptedIn for L1 ${l1Address}:`, isOptedIn);
  } catch (error) {
    console.error("checkOptInL1 failed:", error);
  }
}


/**
 * Operator -> Vault
 */
export async function optInVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account | undefined
) {
  console.log(`Opting in to Vault: ${vaultAddress}`);
  try {
    if (!account) throw new Error('Client account is required');
    const hash = await service.safeWrite.optIn(
      [vaultAddress],
      { chain: null, account }
    );
    console.log("optInVault successful! Tx hash:", hash);
  } catch (error) {
    console.error("optInVault failed:", error);
  }
}

export async function optOutVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account | undefined
) {
  console.log(`Opting out from Vault: ${vaultAddress}`);
  try {
    if (!account) throw new Error('Client account is required');
    const hash = await service.safeWrite.optOut(
      [vaultAddress],
      { chain: null, account }
    );
    console.log("optOutVault successful! Tx hash:", hash);
  } catch (error) {
    console.error("optOutVault failed:", error);
  }
}

export async function checkOptInVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  operator: Hex,
  vaultAddress: Hex
) {
  try {
    const isOptedIn = await service.read.isOptedIn(
      [operator, vaultAddress]
    );
    console.log(`Operator ${operator} isOptedIn for Vault ${vaultAddress}:`, isOptedIn);
  } catch (error) {
    console.error("checkOptInVault failed:", error);
  }
}
