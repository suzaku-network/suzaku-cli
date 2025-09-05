import { ExtendedPublicClient, ExtendedWalletClient } from './client';
import { SafeSuzakuContract } from './lib/viemUtils';
import { Hex } from 'viem';
import type { Account } from 'viem';

// L1 opt-in functionality
export async function optInL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account
) {
    const hash = await optInService.safeWrite.optIn(
      [l1Address],
      { chain: null, account }
    );
    console.log("L1 opt-in successful, tx hash:", hash);
}

export async function optOutL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account
) {

    const hash = await optInService.safeWrite.optOut(
      [l1Address],
      { chain: null, account }
    );
    console.log("L1 opt-out successful, tx hash:", hash);
}

export async function checkOptInL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  operator: Hex,
  l1Address: Hex
) {
    const result = await optInService.read.isOptedIn(
      [operator, l1Address]
    );
    console.log(`Operator ${operator} opt-in status for L1 ${l1Address}: ${result}`);
    return result;
}

// Vault opt-in functionality
export async function optInVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account
) {
    const hash = await optInService.safeWrite.optIn(
      [vaultAddress],
      { chain: null, account }
    );
    console.log("Vault opt-in successful, tx hash:", hash);
}

export async function optOutVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account
) {


  const hash = await optInService.safeWrite.optOut(
    [vaultAddress],
    { chain: null, account }
  );
  console.log("Vault opt-out successful, tx hash:", hash);
}

export async function checkOptInVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  operator: Hex,
  vaultAddress: Hex
) {
    const result = await optInService.read.isOptedIn(
      [operator, vaultAddress]
    );
    console.log(`Operator ${operator} opt-in status for vault ${vaultAddress}: ${result}`);
    return result;
}
