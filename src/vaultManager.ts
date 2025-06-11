import { TContract } from './config';
import type { Hex, Account } from 'viem';

export async function registerVaultL1(
    vaultManager: TContract['VaultManager'],
    vaultAddress: Hex,
    assetClass: bigint,
    maxLimit: bigint,
    account: Account | undefined
) {
    console.log("Registering Vault L1...");

    try {
        if (!account) throw new Error('Client account is required');
        const hash = await vaultManager.write.registerVault(
            [vaultAddress, assetClass, maxLimit],
            { chain: null, account }
        );
        console.log("Vault registered, tx hash:", hash);
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
}

export async function updateVaultMaxL1Limit(
    vaultManager: TContract['VaultManager'],
    vaultAddress: Hex,
    assetClass: bigint,
    maxLimit: bigint,
    account: Account | undefined
) {
    console.log("Updating Vault Max L1 limit...");

    try {
        if (!account) throw new Error('Client account is required');
        const hash = await vaultManager.write.updateVaultMaxL1Limit(
            [vaultAddress, assetClass, maxLimit],
            { chain: null, account }
        );
        console.log("Max L1 limit updated, tx hash:", hash);
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
}

export async function removeVault(
    vaultManager: TContract['VaultManager'],
    vaultAddress: Hex,
    account: Account | undefined
) {
    console.log("Removing vault...");

    try {
        if (!account) throw new Error('Client account is required');
        const hash = await vaultManager.write.removeVault(
            [vaultAddress],
            { chain: null, account }
        );
        console.log("Vault removed, tx hash:", hash);
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
}

export async function getVaultCount(
    vaultManager: TContract['VaultManager']
) {
    console.log("Getting vault count...");

    try {
        const val = await vaultManager.read.getVaultCount();
        console.log("Vault count:", val);
    } catch (error) {
        console.error("Read contract failed:", error);
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
}

export async function getVaultAtWithTimes(
    vaultManager: TContract['VaultManager'],
    index: bigint
) {
    console.log("Getting vault at index with times...");

    try {
        const val = await vaultManager.read.getVaultAtWithTimes([index]);
        console.log("Vault at index with times:", val);
    } catch (error) {
        console.error("Read contract failed:", error);
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
}

export async function getVaultAssetClass(
    vaultManager: TContract['VaultManager'],
    vaultAddress: Hex
) {
    console.log("Getting vault asset class...");

    try {
        const val = await vaultManager.read.getVaultAssetClass([vaultAddress]);
        console.log("Vault asset class:", val);
    } catch (error) {
        console.error("Read contract failed:", error);
        if (error instanceof Error) {
            console.error(error.message);
        }
    }
}
