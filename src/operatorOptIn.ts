import { ExtendedPublicClient, ExtendedWalletClient } from './client';
import { TContract } from './config';
import { Hex } from 'viem';
import type { Account } from 'viem';

// L1 opt-in functionality
export async function optInL1(
  optInService: TContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  try {
    const hash = await optInService.write.optIn(
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
  optInService: TContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  try {
    const hash = await optInService.write.optOut(
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
  optInService: TContract['OperatorL1OptInService'],
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
  optInService: TContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  try {
    const hash = await optInService.write.optIn(
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
  optInService: TContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error('Client account is required');

  try {
    const hash = await optInService.write.optOut(
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
  optInService: TContract['OperatorVaultOptInService'],
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
