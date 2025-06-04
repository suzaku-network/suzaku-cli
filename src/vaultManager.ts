import { ExtendedPublicClient, ExtendedWalletClient } from './client';
import { Hex, Abi } from 'viem';

export async function registerVaultL1(
    client: ExtendedWalletClient,
    vaultManagerAddress: Hex,
    vaultManagerAbi: Abi,
    vaultAddress: Hex,
    assetClass: bigint,
    maxLimit: bigint
) {
    console.log("Registering Vault L1...");

    try {
        // @ts-ignore - Client has hoisted account but TypeScript doesn't recognize it
        const hash = await client.writeContract({
            address: vaultManagerAddress,
            abi: vaultManagerAbi,
            functionName: 'registerVault',
            args: [vaultAddress, assetClass, maxLimit],
            chain: null,
            account: client.account || null,
        });
        console.log("Vault registered, tx hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function updateVaultMaxL1Limit(
    client: ExtendedWalletClient,
    vaultManagerAddress: Hex,
    vaultManagerAbi: Abi,
    vaultAddress: Hex,
    assetClass: bigint,
    maxLimit: bigint
) {
    console.log("Updating Vault Max L1 limit...");

    try {
        // @ts-ignore - Client has hoisted account but TypeScript doesn't recognize it
        const hash = await client.writeContract({
            address: vaultManagerAddress,
            abi: vaultManagerAbi,
            functionName: 'updateVaultMaxL1Limit',
            args: [vaultAddress, assetClass, maxLimit],
            chain: null,
            account: client.account || null,
        });
        console.log("Max L1 limit updated, tx hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function removeVault(
    client: ExtendedWalletClient,
    vaultManagerAddress: Hex,
    vaultManagerAbi: Abi,
    vaultAddress: Hex
) {
    console.log("Removing vault...");

    try {
        // @ts-ignore - Client has hoisted account but TypeScript doesn't recognize it
        const hash = await client.writeContract({
            address: vaultManagerAddress,
            abi: vaultManagerAbi,
            functionName: 'removeVault',
            args: [vaultAddress],
            chain: null,
            account: client.account || null,
        });
        console.log("Vault removed, tx hash:", hash);
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function getVaultCount(
    client: ExtendedPublicClient,
    vaultManagerAddress: Hex,
    vaultManagerAbi: Abi
) {
    console.log("Getting vault count...");

    try {
        const val = await client.readContract({
            address: vaultManagerAddress,
            abi: vaultManagerAbi,
            functionName: 'getVaultCount',
            args: [],
        });
        console.log("Vault count:", val);
    } catch (error) {
        console.error("Read contract failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function getVaultAtWithTimes(
    client: ExtendedPublicClient,
    vaultManagerAddress: Hex,
    vaultManagerAbi: Abi,
    index: bigint
) {
    console.log("Getting vault at index with times...");

    try {
        const val = await client.readContract({
            address: vaultManagerAddress,
            abi: vaultManagerAbi,
            functionName: 'getVaultAtWithTimes',
            args: [index],
        });
        console.log("Vault at index with times:", val);
    } catch (error) {
        console.error("Read contract failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}

export async function getVaultAssetClass(
    client: ExtendedPublicClient,
    vaultManagerAddress: Hex,
    vaultManagerAbi: Abi,
    vaultAddress: Hex
) {
    console.log("Getting vault asset class...");

    try {
        const val = await client.readContract({
            address: vaultManagerAddress,
            abi: vaultManagerAbi,
            functionName: 'getVaultAssetClass',
            args: [vaultAddress],
        });
        console.log("Vault asset class:", val);
    } catch (error) {
        console.error("Read contract failed:", error);
        if (error instanceof Error) {
            console.error("Error message:", error.message);
        }
    }
}
