import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';
import { logger } from './lib/logger';

/**
 * Operator -> L1
 */
export async function optInL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account
) {
  logger.log(`Opting in to L1: ${l1Address}`);

  const hash = await service.safeWrite.optIn(
    [l1Address],
    { chain: null, account }
  );
  logger.log("optInL1 successful! Tx hash:", hash);

}

export async function optOutL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex,
  account: Account
) {
  logger.log(`Opting out from L1: ${l1Address}`);

  const hash = await service.safeWrite.optOut(
    [l1Address],
    { chain: null, account }
  );
  logger.log("optOutL1 successful! Tx hash:", hash);

}

export async function checkOptInL1(
  service: SafeSuzakuContract['OperatorL1OptInService'],
  operator: Hex,
  l1Address: Hex
) {
  const isOptedIn = await service.read.isOptedIn(
    [operator, l1Address]
  );
  logger.log(`Operator ${operator} isOptedIn for L1 ${l1Address}:`, isOptedIn);

}


/**
 * Operator -> Vault
 */
export async function optInVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account
) {
  logger.log(`Opting in to Vault: ${vaultAddress}`);

  const hash = await service.safeWrite.optIn(
    [vaultAddress],
    { chain: null, account }
  );
  logger.log("optInVault successful! Tx hash:", hash);

}

export async function optOutVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex,
  account: Account
) {
  logger.log(`Opting out from Vault: ${vaultAddress}`);

  const hash = await service.safeWrite.optOut(
    [vaultAddress],
    { chain: null, account }
  );
  logger.log("optOutVault successful! Tx hash:", hash);
}

export async function checkOptInVault(
  service: SafeSuzakuContract['OperatorVaultOptInService'],
  operator: Hex,
  vaultAddress: Hex
) {
  const isOptedIn = await service.read.isOptedIn(
    [operator, vaultAddress]
  );
  logger.log(`Operator ${operator} isOptedIn for Vault ${vaultAddress}:`, isOptedIn);
}
