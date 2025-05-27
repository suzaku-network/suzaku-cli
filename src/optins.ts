import { Config } from "./config";
import { ExtendedPublicClient, ExtendedWalletClient } from './client';
import { Hex } from 'viem';
/**
 * Operator -> L1
 */
export async function optInL1(
  client: ExtendedWalletClient,
  opL1OptInAddress: Hex,
  opL1OptInAbi: any,
  l1Address: Hex,
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
  client: ExtendedWalletClient,
  opL1OptInAddress: Hex,
  opL1OptInAbi: any,
  l1Address: Hex,
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
  client: ExtendedPublicClient,
  opL1OptInAddress: Hex,
  opL1OptInAbi: any,
  operator: Hex,
  l1Address: Hex,
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
  client: ExtendedWalletClient,
  opVaultOptInAddress: Hex,
  opVaultOptInAbi: any,
  vaultAddress: Hex,
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
  client: ExtendedWalletClient,
  opVaultOptInAddress: Hex,
  opVaultOptInAbi: any,
  vaultAddress: Hex,
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
  client: ExtendedPublicClient,
  opVaultOptInAddress: Hex,
  opVaultOptInAbi: any,
  operator: Hex,
  vaultAddress: Hex,
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
