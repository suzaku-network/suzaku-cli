import { ExtendedWalletClient } from './client';
import { Hex, Abi } from 'viem';

export async function setL1Limit(
  client: ExtendedWalletClient,
  l1RestakeDelegatorAddress: Hex,
  l1RestakeDelegatorAbi: Abi,
  l1Address: Hex,
  assetClass: bigint,
  limit: bigint
) {
  console.log("Setting L1 limit...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: l1RestakeDelegatorAddress,
      abi: l1RestakeDelegatorAbi,
      functionName: 'setL1Limit',
      args: [l1Address, assetClass, limit],
      chain: null,
      account: client.account,
    });
    console.log("setL1Limit done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function setOperatorL1Shares(
  client: ExtendedWalletClient,
  l1RestakeDelegatorAddress: Hex,
  l1RestakeDelegatorAbi: Abi,
  l1Address: Hex,
  assetClass: bigint,
  operatorAddress: Hex,
  shares: bigint
) {
  console.log("Setting operator L1 shares...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: l1RestakeDelegatorAddress,
      abi: l1RestakeDelegatorAbi,
      functionName: 'setOperatorL1Shares',
      args: [l1Address, assetClass, operatorAddress, shares],
      chain: null,
      account: client.account,
    });
    console.log("setOperatorL1Shares done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}
