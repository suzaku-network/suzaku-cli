import { WalletClient, PublicClient } from 'viem';

export async function setUpSecurityModule(
  client: WalletClient,
  balancerAddress: `0x${string}`,
  balancerAbi: any,
  securityModule: `0x${string}`,
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
  client: PublicClient,
  balancerAddress: `0x${string}`,
  balancerAbi: any
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
  client: PublicClient,
  balancerAddress: `0x${string}`,
  balancerAbi: any,
  securityModule: `0x${string}`
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
