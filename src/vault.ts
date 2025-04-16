import { WalletClient, PublicClient } from 'viem';

// deposit
export async function depositVault(
  client: WalletClient,
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

    // -- Added code: read collateral from env var, then approve vault for that collateral
    const collateralAddress = process.env.COLLATERAL as `0x${string}`; 
    if (!collateralAddress) {
      throw new Error("Missing COLLATERAL environment variable");
    }

    console.log("Approving collateral token for vault deposit...");
    await client.writeContract({
      address: collateralAddress,
      // minimal ABI for 'approve'
      abi: [
        {
          "name": "approve",
          "type": "function",
          "stateMutability": "nonpayable",
          "inputs": [
            { "name": "spender", "type": "address" },
            { "name": "amount",  "type": "uint256" }
          ],
          "outputs": [{ "name": "", "type": "bool" }]
        }
      ],
      functionName: 'approve',
      args: [vaultAddress, amountWei],
      chain: null,
      account: client.account,
    });
    console.log("Approval done.");

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