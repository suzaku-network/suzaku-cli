import { ExtendedPublicClient, ExtendedWalletClient } from './client';
import { SafeSuzakuContract } from './lib/viemUtils';
import { Hex } from 'viem';
import type { Account } from 'viem';

// L1 opt-in functionality
export async function optInL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  try {
    const hash = await optInService.safeWrite.optIn(
      [l1Address],
      { chain: null, account }
    );
    console.log("L1 opt-in successful, tx hash:", hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

export async function optOutL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  try {
    const hash = await optInService.safeWrite.optOut(
      [l1Address],
      { chain: null, account }
    );
    console.log("L1 opt-out successful, tx hash:", hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

export async function checkOptInL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  operator: Hex,
  l1Address: Hex
) {
  try {
    const result = await optInService.read.isOptedIn(
      [operator, l1Address]
    );
    console.log(`Operator ${operator} opt-in status for L1 ${l1Address}: ${result}`);
    return result;
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error(error.message);
    }
    return false;
  }
}

// Vault opt-in functionality
export async function optInVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  try {
    const hash = await optInService.safeWrite.optIn(
      [vaultAddress],
      { chain: null, account }
    );
    console.log("Vault opt-in successful, tx hash:", hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

export async function optOutVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  try {
    const hash = await optInService.safeWrite.optOut(
      [vaultAddress],
      { chain: null, account }
    );
    console.log("Vault opt-out successful, tx hash:", hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

export async function checkOptInVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  operator: Hex,
  vaultAddress: Hex
) {
  try {
    const result = await optInService.read.isOptedIn(
      [operator, vaultAddress]
    );
    console.log(`Operator ${operator} opt-in status for vault ${vaultAddress}: ${result}`);
    return result;
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error(error.message);
    }
    return false;
  }
}
