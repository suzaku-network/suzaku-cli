import { SafeSuzakuContract } from './lib/viemUtils';
import { Hex } from 'viem';
import { logger } from './lib/logger';

// L1 opt-in functionality
export async function optInL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex
) {
  logger.log("Opting in to L1...");
  const hash = await optInService.safeWrite.optIn([l1Address]);
  logger.log("L1 opt-in successful, tx hash:", hash);
}

export async function optOutL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  l1Address: Hex
) {
  const hash = await optInService.safeWrite.optOut([l1Address]);
  logger.log("L1 opt-out successful, tx hash:", hash);
}

export async function checkOptInL1(
  optInService: SafeSuzakuContract['OperatorL1OptInService'],
  operator: Hex,
  l1Address: Hex
) {
  const result = await optInService.read.isOptedIn(
    [operator, l1Address]
  );
  logger.log(`Operator ${operator} opt-in status for L1 ${l1Address}: ${result}`);
  return result;
}

// Vault opt-in functionality
export async function optInVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex
) {
  const hash = await optInService.safeWrite.optIn([vaultAddress]);
  logger.log("Vault opt-in successful, tx hash:", hash);
}

export async function optOutVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  vaultAddress: Hex
) {
  const hash = await optInService.safeWrite.optOut([vaultAddress]);
  logger.log("Vault opt-out successful, tx hash:", hash);
}

export async function checkOptInVault(
  optInService: SafeSuzakuContract['OperatorVaultOptInService'],
  operator: Hex,
  vaultAddress: Hex
) {
  const result = await optInService.read.isOptedIn(
    [operator, vaultAddress]
  );
  logger.log(`Operator ${operator} opt-in status for vault ${vaultAddress}: ${result}`);
  return result;
}
