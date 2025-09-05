import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';

export async function registerVaultL1(
    vaultManager: SafeSuzakuContract['VaultManager'],
    vaultAddress: Hex,
    collateralClass: bigint,
    maxLimit: bigint,
    account: Account
) {
    console.log("Registering Vault L1...");

        const hash = await vaultManager.safeWrite.registerVault(
            [vaultAddress, collateralClass, maxLimit],
            { chain: null, account }
        );
        console.log("Vault registered, tx hash:", hash);
}

export async function updateVaultMaxL1Limit(
    vaultManager: SafeSuzakuContract['VaultManager'],
    vaultAddress: Hex,
    collateralClass: bigint,
    maxLimit: bigint,
    account: Account
) {
    console.log("Updating Vault Max L1 limit...");

        const hash = await vaultManager.safeWrite.updateVaultMaxL1Limit(
            [vaultAddress, collateralClass, maxLimit],
            { chain: null, account }
        );
        console.log("Max L1 limit updated, tx hash:", hash);
}

export async function removeVault(
    vaultManager: SafeSuzakuContract['VaultManager'],
    vaultAddress: Hex,
    account: Account
) {
    console.log("Removing vault...");

        const hash = await vaultManager.safeWrite.removeVault(
            [vaultAddress],
            { chain: null, account }
        );
        console.log("Vault removed, tx hash:", hash);
}

export async function getVaultCount(
    vaultManager: SafeSuzakuContract['VaultManager']
) {
    console.log("Getting vault count...");

        const val = await vaultManager.read.getVaultCount();
        console.log("Vault count:", val);
}

export async function getVaultAtWithTimes(
    vaultManager: SafeSuzakuContract['VaultManager'],
    index: bigint
) {
    console.log("Getting vault at index with times...");

        const val = await vaultManager.read.getVaultAtWithTimes([index]);
        console.log("Vault at index with times:", val);
}

export async function getVaultCollateralClass(
    vaultManager: SafeSuzakuContract['VaultManager'],
    vaultAddress: Hex
) {
    console.log("Getting vault collateral class...");

        const val = await vaultManager.read.getVaultCollateralClass([vaultAddress]);
        console.log("Vault collateral class:", val);
}
