import { WalletClient, PublicClient } from 'viem';

export async function setL1Limit(
  client: WalletClient,
  l1RestakeDelegatorAddress: `0x${string}`,
  l1RestakeDelegatorAbi: any,
  l1Address: `0x${string}`,
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
  client: WalletClient,
  l1RestakeDelegatorAddress: `0x${string}`,
  l1RestakeDelegatorAbi: any,
  l1Address: `0x${string}`,
  assetClass: bigint,
  operatorAddress: `0x${string}`,
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
