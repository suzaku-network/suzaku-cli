import { Config } from "./config";
import { WalletClient, PublicClient } from 'viem';

/**
 * Operator -> L1
 */
export async function optInL1(
  client: WalletClient,
  opL1OptInAddress: `0x${string}`,
  opL1OptInAbi: any,
  l1Address: `0x${string}`,
) {
  console.log(`Opting in to L1: ${l1Address}`);
  try {
    const hash = await client.writeContract({
      address: opL1OptInAddress,
      abi: opL1OptInAbi,
      functionName: 'optIn',
      args: [l1Address],
      chain: null,
      account: client.account ?? null,
    });
    console.log("optInL1 successful! Tx hash:", hash);
  } catch (error) {
    console.error("optInL1 failed:", error);
  }
}

export async function optOutL1(
  client: WalletClient,
  opL1OptInAddress: `0x${string}`,
  opL1OptInAbi: any,
  l1Address: `0x${string}`,
) {
  console.log(`Opting out from L1: ${l1Address}`);
  try {
    const hash = await client.writeContract({
      address: opL1OptInAddress,
      abi: opL1OptInAbi,
      functionName: 'optOut',
      args: [l1Address],
      chain: null,
      account: client.account ?? null,
    });
    console.log("optOutL1 successful! Tx hash:", hash);
  } catch (error) {
    console.error("optOutL1 failed:", error);
  }
}

export async function checkOptInL1(
  client: PublicClient,
  opL1OptInAddress: `0x${string}`,
  opL1OptInAbi: any,
  operator: `0x${string}`,
  l1Address: `0x${string}`,
) {
  try {
    const isOptedIn = await client.readContract({
      address: opL1OptInAddress,
      abi: opL1OptInAbi,
      functionName: 'isOptedIn',
      args: [operator, l1Address],
    });
    console.log(`Operator ${operator} isOptedIn for L1 ${l1Address}:`, isOptedIn);
  } catch (error) {
    console.error("checkOptInL1 failed:", error);
  }
}


/**
 * Operator -> Vault
 */
export async function optInVault(
  client: WalletClient,
  opVaultOptInAddress: `0x${string}`,
  opVaultOptInAbi: any,
  vaultAddress: `0x${string}`,
) {
  console.log(`Opting in to Vault: ${vaultAddress}`);
  try {
    const hash = await client.writeContract({
      address: opVaultOptInAddress,
      abi: opVaultOptInAbi,
      functionName: 'optIn',
      args: [vaultAddress],
      chain: null,
      account: client.account ?? null,
    });
    console.log("optInVault successful! Tx hash:", hash);
  } catch (error) {
    console.error("optInVault failed:", error);
  }
}

export async function optOutVault(
  client: WalletClient,
  opVaultOptInAddress: `0x${string}`,
  opVaultOptInAbi: any,
  vaultAddress: `0x${string}`,
) {
  console.log(`Opting out from Vault: ${vaultAddress}`);
  try {
    const hash = await client.writeContract({
      address: opVaultOptInAddress,
      abi: opVaultOptInAbi,
      functionName: 'optOut',
      args: [vaultAddress],
      chain: null,
      account: client.account ?? null,
    });
    console.log("optOutVault successful! Tx hash:", hash);
  } catch (error) {
    console.error("optOutVault failed:", error);
  }
}

export async function checkOptInVault(
  client: PublicClient,
  opVaultOptInAddress: `0x${string}`,
  opVaultOptInAbi: any,
  operator: `0x${string}`,
  vaultAddress: `0x${string}`,
) {
  try {
    const isOptedIn = await client.readContract({
      address: opVaultOptInAddress,
      abi: opVaultOptInAbi,
      functionName: 'isOptedIn',
      args: [operator, vaultAddress],
    });
    console.log(`Operator ${operator} isOptedIn for Vault ${vaultAddress}:`, isOptedIn);
  } catch (error) {
    console.error("checkOptInVault failed:", error);
  }
}
