import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';
import { logger } from './lib/logger';
import { Config } from './config';
import { ExtendedClient, ExtendedPublicClient } from './client';
import { info as vaultInfo } from './vault';

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
    vaultManager: SuzakuContract['VaultManager']
) {
    logger.log("Getting vault count...");

    const val = await vaultManager.read.getVaultCount();
    logger.log("Vault count:", val);
}

export async function getVaultAtWithTimes(
    vaultManager: SuzakuContract['VaultManager'],
    index: bigint
) {
    logger.log("Getting vault at index with times...");

    const val = await vaultManager.read.getVaultAtWithTimes([index]);
    logger.log("Vault at index with times:", val);
}

export async function getVaultCollateralClass(
    vaultManager: SuzakuContract['VaultManager'],
    vaultAddress: Hex
) {
    logger.log("Getting vault collateral class...");

    const val = await vaultManager.read.getVaultCollateralClass([vaultAddress]);
    logger.log("Vault collateral class:", val);
}

// info: list all vaults and show its collateral class, max limit, and times. Show the l1 stakes
export async function info(vaultManager: SuzakuContract['VaultManager'], config: Config<ExtendedPublicClient>) {

    const [vaultCount, middlewareAddress] = await vaultManager.multicall(['getVaultCount', "middleware"]);

    const vaults = await vaultManager.multicall(Array.from({ length: Number(vaultCount) }).map((_, i) => ({ name: 'getVaultAtWithTimes', args: [BigInt(i)] })));

    let vaultsWithInfo = [];
    for (const [addr, enableTime, disableTime] of vaults) {
        const vault = await config.contracts.VaultTokenized(addr);
        vaultsWithInfo.push({
            enableTime: enableTime === 0 ? "Never" : new Date(enableTime * 1000).toLocaleString(),
            disableTime: disableTime === 0 ? "Never" : new Date(disableTime * 1000).toLocaleString(),
            ...await vaultInfo(vault, config, await config.contracts.L1Middleware(middlewareAddress))
        });
    }
    return { middleware: middlewareAddress, vaults: vaultsWithInfo };
}
