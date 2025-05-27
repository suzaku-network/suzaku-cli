import { ExtendedPublicClient, ExtendedWalletClient } from './client';
import { Hex } from 'viem';

// L1 opt-in functionality
export async function optInL1(
  client: ExtendedWalletClient,
  optInServiceAddress: Hex,
  optInServiceAbi: any,
  l1Address: Hex
) {
  if (!client.account) {
    throw new Error('Client account is required');
  }

  try {
    const hash = await client.writeContract({
      address: optInServiceAddress,
      abi: optInServiceAbi,
      functionName: 'optIn',
      args: [l1Address],
      chain: null,
      account: client.account,
    });
    console.log("L1 opt-in successful, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function optOutL1(
  client: ExtendedWalletClient,
  optInServiceAddress: Hex,
  optInServiceAbi: any,
  l1Address: Hex
) {
  if (!client.account) {
    throw new Error('Client account is required');
  }

  try {
    const hash = await client.writeContract({
      address: optInServiceAddress,
      abi: optInServiceAbi,
      functionName: 'optOut',
      args: [l1Address],
      chain: null,
      account: client.account,
    });
    console.log("L1 opt-out successful, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function checkOptInL1(
  client: ExtendedPublicClient,
  optInServiceAddress: Hex,
  optInServiceAbi: any,
  operator: Hex,
  l1Address: Hex
) {
  try {
    const result = await client.readContract({
      address: optInServiceAddress,
      abi: optInServiceAbi,
      functionName: 'isOptedIn',
      args: [operator, l1Address],
    });
    console.log(`Operator ${operator} opt-in status for L1 ${l1Address}: ${result}`);
    return result;
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    return false;
  }
}

// Vault opt-in functionality
export async function optInVault(
  client: ExtendedWalletClient,
  optInServiceAddress: Hex,
  optInServiceAbi: any,
  vaultAddress: Hex
) {
  if (!client.account) {
    throw new Error('Client account is required');
  }

  try {
    const hash = await client.writeContract({
      address: optInServiceAddress,
      abi: optInServiceAbi,
      functionName: 'optIn',
      args: [vaultAddress],
      chain: null,
      account: client.account,
    });
    console.log("Vault opt-in successful, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function optOutVault(
  client: ExtendedWalletClient,
  optInServiceAddress: Hex,
  optInServiceAbi: any,
  vaultAddress: Hex
) {
  if (!client.account) {
    throw new Error('Client account is required');
  }

  try {
    const hash = await client.writeContract({
      address: optInServiceAddress,
      abi: optInServiceAbi,
      functionName: 'optOut',
      args: [vaultAddress],
      chain: null,
      account: client.account,
    });
    console.log("Vault opt-out successful, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function checkOptInVault(
  client: ExtendedPublicClient,
  optInServiceAddress: Hex,
  optInServiceAbi: any,
  operator: Hex,
  vaultAddress: Hex
) {
  try {
    const result = await client.readContract({
      address: optInServiceAddress,
      abi: optInServiceAbi,
      functionName: 'isOptedIn',
      args: [operator, vaultAddress],
    });
    console.log(`Operator ${operator} opt-in status for vault ${vaultAddress}: ${result}`);
    return result;
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    return false;
  }
} 
