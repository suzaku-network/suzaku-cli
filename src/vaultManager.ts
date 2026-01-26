import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';
import { logger } from './lib/logger';

export async function registerVaultL1(
    vaultManager: SafeSuzakuContract['VaultManager'],
    vaultAddress: Hex,
    collateralClass: bigint,
    maxLimit: bigint,
    account: Account
) {
    logger.log("Registering Vault L1...");

    const hash = await vaultManager.safeWrite.registerVault([vaultAddress, collateralClass, maxLimit]);
    logger.log("Vault registered, tx hash:", hash);
}

export async function updateVaultMaxL1Limit(
    vaultManager: SafeSuzakuContract['VaultManager'],
    vaultAddress: Hex,
    collateralClass: bigint,
    maxLimit: bigint,
    account: Account
) {
    logger.log("Updating Vault Max L1 limit...");

    const hash = await vaultManager.safeWrite.updateVaultMaxL1Limit([vaultAddress, collateralClass, maxLimit]);
    logger.log("Max L1 limit updated, tx hash:", hash);
}

export async function removeVault(
    vaultManager: SafeSuzakuContract['VaultManager'],
    vaultAddress: Hex,
    account: Account
) {
    logger.log("Removing vault...");

    const hash = await vaultManager.safeWrite.removeVault([vaultAddress]);
    logger.log("Vault removed, tx hash:", hash);
}

export async function getVaultCount(
    vaultManager: SafeSuzakuContract['VaultManager']
) {
    logger.log("Getting vault count...");

    const val = await vaultManager.read.getVaultCount();
    logger.log("Vault count:", val);
}

export async function getVaultAtWithTimes(
    vaultManager: SafeSuzakuContract['VaultManager'],
    index: bigint
) {
    logger.log("Getting vault at index with times...");

    const val = await vaultManager.read.getVaultAtWithTimes([index]);
    logger.log("Vault at index with times:", val);
}

export async function getVaultCollateralClass(
    vaultManager: SafeSuzakuContract['VaultManager'],
    vaultAddress: Hex
) {
    logger.log("Getting vault collateral class...");

    const val = await vaultManager.read.getVaultCollateralClass([vaultAddress]);
    logger.log("Vault collateral class:", val);
}
