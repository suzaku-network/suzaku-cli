import { WalletClient, PublicClient } from 'viem';
import { ExtendedWalletClient } from './client';

// deposit
export async function depositVault(
  client: ExtendedWalletClient,
  vaultAddress: `0x${string}`,
  vaultAbi: any,
  onBehalfOf: `0x${string}`,
  amountWei: bigint
) {
  console.log("Depositing...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Get collateralAddress by calling function "collateral" on vaultAddress
    const collateralAddress = await client.readContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'collateral',
      args: [],
    });

    console.log("Approving collateral token for vault deposit...");
    const approveTx = await client.writeContract({
      address: collateralAddress as `0x${string}`,
      // minimal ABI for 'approve'
      abi: [
        {
          "name": "approve",
          "type": "function",
          "stateMutability": "nonpayable",
          "inputs": [
            { "name": "spender", "type": "address" },
            { "name": "amount", "type": "uint256" }
          ],
          "outputs": [{ "name": "", "type": "bool" }]
        }
      ],
      functionName: 'approve',
      args: [vaultAddress, amountWei],
      chain: null,
      account: client.account,
    });
    // Wait for the approval transaction to be mined
    await client.waitForTransactionReceipt({ hash: approveTx });

    // === Existing deposit code (unchanged) ===
    const hash = await client.writeContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'deposit',
      args: [onBehalfOf, amountWei],
      chain: null,
      account: client.account,
    });
    console.log("Deposit done, tx hash:", hash);

  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// withdraw
export async function withdrawVault(
  client: WalletClient,
  vaultAddress: `0x${string}`,
  vaultAbi: any,
  claimer: `0x${string}`,
  amountWei: bigint
) {
  console.log("Withdrawing...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'withdraw',
      args: [claimer, amountWei],
      chain: null,
      account: client.account,
    });
    console.log("Withdraw done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// claim
export async function claimVault(
  client: WalletClient,
  vaultAddress: `0x${string}`,
  vaultAbi: any,
  recipient: `0x${string}`,
  epoch: bigint
) {
  console.log("Claiming...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'claim',
      args: [recipient, epoch],
      chain: null,
      account: client.account,
    });
    console.log("Claim done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

/**
 * Reads the `delegator` address from a vault (VaultTokenized).
 * This assumes your `VaultTokenized` contract has a public `delegator()` method.
 */
export async function getVaultDelegator(
  client: PublicClient,
  vaultAddress: `0x${string}`,
  vaultAbi: any
): Promise<`0x${string}`> {
  return await client.readContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: 'delegator',
    args: [],
  }) as `0x${string}`;
}

/**
 * Reads stake for an operator in a given L1, from a L1RestakeDelegator-based contract.
 */
export async function getStake(
  client: PublicClient,
  delegatorAddress: `0x${string}`,
  delegatorAbi: any,
  l1Address: `0x${string}`,
  assetClass: bigint,
  operatorAddress: `0x${string}`
): Promise<bigint> {
  return await client.readContract({
    address: delegatorAddress,
    abi: delegatorAbi,
    functionName: 'stake',
    args: [l1Address, assetClass, operatorAddress],
  }) as bigint;
}
