import { generateClient, Network } from './client';
import { getConfig } from './config';
import { Hex } from 'viem';

/**
 * Distributes rewards for a specific epoch
 */
export async function distributeRewards(
  rewardsAddress: Hex,
  epoch: number,
  batchSize: number,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'distributeRewards',
    args: [BigInt(epoch), BigInt(batchSize)],
    account: client.account,
    chain: null
  });

  console.log(`distributeRewards for epoch ${epoch} with batch size ${batchSize} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Claims rewards for a staker
 */
export async function claimRewards(
  rewardsAddress: Hex,
  rewardsToken: Hex,
  recipient: Hex,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'claimRewards',
    args: [rewardsToken, recipient],
    account: client.account,
    chain: null
  });

  console.log(`claimRewards completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Claims operator fees
 */
export async function claimOperatorFee(
  rewardsAddress: Hex,
  rewardsToken: Hex,
  recipient: Hex,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'claimOperatorFee',
    args: [rewardsToken, recipient],
    account: client.account,
    chain: null
  });

  console.log(`claimOperatorFee completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Claims curator fees
 */
export async function claimCuratorFee(
  rewardsAddress: Hex,
  rewardsToken: Hex,
  recipient: Hex,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'claimCuratorFee',
    args: [rewardsToken, recipient],
    account: client.account,
    chain: null
  });

  console.log(`claimCuratorFee completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Claims protocol fees
 */
export async function claimProtocolFee(
  rewardsAddress: Hex,
  rewardsToken: Hex,
  recipient: Hex,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'claimProtocolFee',
    args: [rewardsToken, recipient],
    account: client.account,
    chain: null
  });

  console.log(`claimProtocolFee completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Claims undistributed rewards
 */
export async function claimUndistributedRewards(
  rewardsAddress: Hex,
  epoch: number,
  rewardsToken: Hex,
  recipient: Hex,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'claimUndistributedRewards',
    args: [BigInt(epoch), rewardsToken, recipient],
    account: client.account,
    chain: null
  });

  console.log(`claimUndistributedRewards for epoch ${epoch} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Sets rewards amount for epochs
 */
export async function setRewardsAmountForEpochs(
  rewardsAddress: Hex,
  startEpoch: number,
  numberOfEpochs: number,
  rewardsToken: Hex,
  rewardsAmount: bigint,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'setRewardsAmountForEpochs',
    args: [BigInt(startEpoch), BigInt(numberOfEpochs), rewardsToken, rewardsAmount],
    account: client.account,
    chain: null
  });

  console.log(`setRewardsAmountForEpochs starting at epoch ${startEpoch} for ${numberOfEpochs} epochs completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Sets rewards share for asset class
 */
export async function setRewardsShareForAssetClass(
  rewardsAddress: Hex,
  assetClass: bigint,
  share: number,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'setRewardsShareForAssetClass',
    args: [assetClass, share],
    account: client.account,
    chain: null
  });

  console.log(`setRewardsShareForAssetClass for asset class ${assetClass} with share ${share} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Sets minimum required uptime
 */
export async function setMinRequiredUptime(
  rewardsAddress: Hex,
  minUptime: bigint,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'setMinRequiredUptime',
    args: [minUptime],
    account: client.account,
    chain: null
  });

  console.log(`setMinRequiredUptime to ${minUptime} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Sets admin role
 */
export async function setAdminRole(
  rewardsAddress: Hex,
  newAdmin: Hex,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'setAdminRole',
    args: [newAdmin],
    account: client.account,
    chain: null
  });

  console.log(`setAdminRole to ${newAdmin} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Sets protocol owner
 */
export async function setProtocolOwner(
  rewardsAddress: Hex,
  newOwner: Hex,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'setProtocolOwner',
    args: [newOwner],
    account: client.account,
    chain: null
  });

  console.log(`setProtocolOwner to ${newOwner} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Updates protocol fee
 */
export async function updateProtocolFee(
  rewardsAddress: Hex,
  newFee: number,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'updateProtocolFee',
    args: [newFee],
    account: client.account,
    chain: null
  });

  console.log(`updateProtocolFee to ${newFee} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Updates operator fee
 */
export async function updateOperatorFee(
  rewardsAddress: Hex,
  newFee: number,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'updateOperatorFee',
    args: [newFee],
    account: client.account,
    chain: null
  });

  console.log(`updateOperatorFee to ${newFee} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Updates curator fee
 */
export async function updateCuratorFee(
  rewardsAddress: Hex,
  newFee: number,
  privateKey: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network, privateKey);

  if (!client.account) {
    throw new Error("No client account set.");
  }

  const txHash = await client.writeContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'updateCuratorFee',
    args: [newFee],
    account: client.account,
    chain: null
  });

  console.log(`updateCuratorFee to ${newFee} completed, tx hash: ${txHash}`);
  return txHash;
}

/**
 * Gets rewards amount per token from epoch
 */
export async function getRewardsAmountPerTokenFromEpoch(
  rewardsAddress: Hex,
  epoch: number,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const result = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'getRewardsAmountPerTokenFromEpoch',
    args: [BigInt(epoch)]
  }) as [string[], bigint[]];

  console.log(`Rewards amount per token for epoch ${epoch}:`);
  for (let i = 0; i < result[0].length; i++) {
    console.log(`  Token: ${result[0][i]}, Amount: ${result[1][i].toString()}`);
  }

  return result;
}

/**
 * Gets rewards amount for a specific token from epoch
 */
export async function getRewardsAmountForTokenFromEpoch(
  rewardsAddress: Hex,
  epoch: number,
  token: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const amount = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'getRewardsAmountPerTokenFromEpoch',
    args: [BigInt(epoch), token]
  }) as bigint;

  console.log(`Rewards amount for token ${token} at epoch ${epoch}: ${amount.toString()}`);
  return amount;
}

/**
 * Gets operator shares for a specific epoch
 */
export async function getOperatorShares(
  rewardsAddress: Hex,
  epoch: number,
  operator: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const share = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'operatorShares',
    args: [BigInt(epoch), operator]
  }) as bigint;

  console.log(`Operator ${operator} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets vault shares for a specific epoch
 */
export async function getVaultShares(
  rewardsAddress: Hex,
  epoch: number,
  vault: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const share = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'vaultShares',
    args: [BigInt(epoch), vault]
  }) as bigint;

  console.log(`Vault ${vault} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets curator shares for a specific epoch
 */
export async function getCuratorShares(
  rewardsAddress: Hex,
  epoch: number,
  curator: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const share = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'curatorShares',
    args: [BigInt(epoch), curator]
  }) as bigint;

  console.log(`Curator ${curator} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets protocol rewards for a token
 */
export async function getProtocolRewards(
  rewardsAddress: Hex,
  token: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const rewards = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'protocolRewards',
    args: [token]
  }) as bigint;

  console.log(`Protocol rewards for token ${token}: ${rewards.toString()}`);
  return rewards;
}

/**
 * Gets distribution batch status for an epoch
 */
export async function getDistributionBatch(
  rewardsAddress: Hex,
  epoch: number,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const result = await client.readContract({ // Changed variable name for clarity
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'distributionBatches',
    args: [BigInt(epoch)]
  }) as [bigint, boolean]; // Assert as a tuple (array with specific types)

  console.log(`Distribution batch for epoch ${epoch}:`);
  // Access elements by index
  const lastProcessedOperator = result[0];
  const isComplete = result[1];

  console.log(`  Last processed operator: ${lastProcessedOperator.toString()}`);
  console.log(`  Is complete: ${isComplete}`);

  return { lastProcessedOperator, isComplete }; // Return as an object if preferred downstream
}

/**
 * Gets current fees configuration
 */
export async function getFeesConfiguration(
  rewardsAddress: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const protocolFee = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'protocolFee',
    args: []
  }) as number;

  const operatorFee = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'operatorFee',
    args: []
  }) as number;

  const curatorFee = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'curatorFee',
    args: []
  }) as number;

  console.log("Fees configuration:");
  console.log(`  Protocol fee: ${protocolFee}`);
  console.log(`  Operator fee: ${operatorFee}`);
  console.log(`  Curator fee: ${curatorFee}`);

  return { protocolFee, operatorFee, curatorFee };
}

/**
 * Gets rewards share for asset class
 */
export async function getRewardsShareForAssetClass(
  rewardsAddress: Hex,
  assetClass: bigint,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const share = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'rewardsSharePerAssetClass',
    args: [assetClass]
  }) as number;

  console.log(`Rewards share for asset class ${assetClass}: ${share}`);
  return share;
}

/**
 * Gets min required uptime
 */
export async function getMinRequiredUptime(
  rewardsAddress: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const minUptime = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'minRequiredUptime',
    args: []
  }) as bigint;

  console.log(`Minimum required uptime: ${minUptime.toString()}`);
  return minUptime;
}

/**
 * Gets last claimed epoch for a staker
 */
export async function getLastEpochClaimedStaker(
  rewardsAddress: Hex,
  staker: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const lastEpoch = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'lastEpochClaimedStaker',
    args: [staker]
  }) as bigint;

  console.log(`Last epoch claimed by staker ${staker}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for an operator
 */
export async function getLastEpochClaimedOperator(
  rewardsAddress: Hex,
  operator: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const lastEpoch = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'lastEpochClaimedOperator',
    args: [operator]
  }) as bigint;

  console.log(`Last epoch claimed by operator ${operator}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for a curator
 */
export async function getLastEpochClaimedCurator(
  rewardsAddress: Hex,
  curator: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const lastEpoch = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'lastEpochClaimedCurator',
    args: [curator]
  }) as bigint;

  console.log(`Last epoch claimed by curator ${curator}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for protocol
 */
export async function getLastEpochClaimedProtocol(
  rewardsAddress: Hex,
  protocolOwner: Hex,
  network: Network
) {
  const config = getConfig(network);
  const client = generateClient(network);

  const lastEpoch = await client.readContract({
    address: rewardsAddress,
    abi: config.abis.Rewards,
    functionName: 'lastEpochClaimedProtocol',
    args: [protocolOwner]
  }) as bigint;

  console.log(`Last epoch claimed by protocol owner ${protocolOwner}: ${lastEpoch.toString()}`);
  return lastEpoch;
} 
