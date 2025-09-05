import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';

/**
 * Operator -> L1
 */
export async function optInL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account
) {
  console.log(`Opting in to L1: ${l1Address}`);

    const hash = await service.safeWrite.optIn(
      [l1Address],
      { chain: null, account }
    );
    console.log("optInL1 successful! Tx hash:", hash);

}

export async function optOutL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account
) {
  console.log(`Opting out from L1: ${l1Address}`);

    const hash = await service.safeWrite.optOut(
      [l1Address],
      { chain: null, account }
    );
    console.log("optOutL1 successful! Tx hash:", hash);

}

export async function checkOptInL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  operator: Hex,
  l1Address: Hex
) {
    const isOptedIn = await service.read.isOptedIn(
      [operator, l1Address]
    );
    console.log(`Operator ${operator} isOptedIn for L1 ${l1Address}:`, isOptedIn);

}


/**
 * Operator -> Vault
 */
export async function optInVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account
) {
  console.log(`Opting in to Vault: ${vaultAddress}`);

    const hash = await service.safeWrite.optIn(
      [vaultAddress],
      { chain: null, account }
    );
    console.log("optInVault successful! Tx hash:", hash);

}

export async function optOutVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account
) {
  console.log(`Opting out from Vault: ${vaultAddress}`);

    const hash = await service.safeWrite.optOut(
      [vaultAddress],
      { chain: null, account }
    );
    console.log("optOutVault successful! Tx hash:", hash);
}

export async function checkOptInVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  operator: Hex,
  vaultAddress: Hex
) {
    const isOptedIn = await service.read.isOptedIn(
      [operator, vaultAddress]
    );
    console.log(`Operator ${operator} isOptedIn for Vault ${vaultAddress}:`, isOptedIn);
}
