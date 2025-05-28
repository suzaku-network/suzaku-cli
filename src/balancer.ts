import { ExtendedPublicClient, ExtendedWalletClient } from './client';
import { Hex, Abi } from 'viem';

export async function setUpSecurityModule(
  client: ExtendedWalletClient,
  balancerAddress: Hex,
  balancerAbi: Abi,
  securityModule: Hex,
  maxWeight: bigint
) {
  console.log("Setting up security module...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: balancerAddress,
      abi: balancerAbi,
      functionName: 'setUpSecurityModule',
      args: [securityModule, maxWeight],
      chain: null,
      account: client.account,
    });
    console.log("Security module updated, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function getSecurityModules(
  client: ExtendedPublicClient,
  balancerAddress: Hex,
  balancerAbi: Abi
) {
  console.log("Getting security modules...");

  try {
    const modules = await client.readContract({
      address: balancerAddress,
      abi: balancerAbi,
      functionName: 'getSecurityModules',
      args: []
    });
    console.log(modules);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function getSecurityModuleWeights(
  client: ExtendedPublicClient,
  balancerAddress: Hex,
  balancerAbi: Abi,
  securityModule: Hex
) {
  console.log("Getting security module weights...");

  try {
    const val = await client.readContract({
      address: balancerAddress,
      abi: balancerAbi,
      functionName: 'getSecurityModuleWeights',
      args: [securityModule],
    });
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}
