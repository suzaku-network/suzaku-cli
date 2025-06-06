import { TContract } from './config';
import type { Hex, Account } from 'viem';

/**
 * Distributes rewards for a specific epoch
 */
export async function distributeRewards(
  rewards: TContract['Rewards'],
  epoch: number,
  batchSize: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.distributeRewards(
    [epoch, batchSize],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims rewards for a staker
 */
export async function claimRewards(
  rewards: TContract['Rewards'],
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.claimRewards(
    [rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims operator fees
 */
export async function claimOperatorFee(
  rewards: TContract['Rewards'],
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.claimOperatorFee(
    [rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims curator fees
 */
export async function claimCuratorFee(
  rewards: TContract['Rewards'],
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.claimCuratorFee(
    [rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims protocol fees
 */
export async function claimProtocolFee(
  rewards: TContract['Rewards'],
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.claimProtocolFee(
    [rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims undistributed rewards
 */
export async function claimUndistributedRewards(
  rewards: TContract['Rewards'],
  epoch: number,
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.claimUndistributedRewards(
    [epoch, rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets rewards amount for epochs
 */
export async function setRewardsAmountForEpochs(
  rewards: TContract['Rewards'],
  startEpoch: number,
  numberOfEpochs: number,
  rewardsToken: Hex,
  rewardsAmount: bigint,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.setRewardsAmountForEpochs(
    [startEpoch,numberOfEpochs, rewardsToken, rewardsAmount],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets rewards share for asset class
 */
export async function setRewardsShareForAssetClass(
  rewards: TContract['Rewards'],
  assetClass: bigint,
  share: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.setRewardsShareForAssetClass(
    [assetClass, share],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets minimum required uptime
 */
export async function setMinRequiredUptime(
  rewards: TContract['Rewards'],
  minUptime: bigint,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.setMinRequiredUptime(
    [minUptime],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets admin role
 */
export async function setAdminRole(
  rewards: TContract['Rewards'],
  newAdmin: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.setAdminRole(
    [newAdmin],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets protocol owner
 */
export async function setProtocolOwner(
  rewards: TContract['Rewards'],
  newOwner: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.setProtocolOwner(
    [newOwner],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Updates protocol fee
 */
export async function updateProtocolFee(
  rewards: TContract['Rewards'],
  newFee: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.updateProtocolFee(
    [newFee],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Updates operator fee
 */
export async function updateOperatorFee(
  rewards: TContract['Rewards'],
  newFee: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.updateOperatorFee(
    [newFee],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Updates curator fee
 */
export async function updateCuratorFee(
  rewards: TContract['Rewards'],
  newFee: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.write.updateCuratorFee(
    [newFee],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Gets rewards amount per token from epoch
 */
export async function getRewardsAmountPerTokenFromEpoch(
  rewards: TContract['Rewards'],
  epoch: number
) {
  const result = await rewards.read.getRewardsAmountPerTokenFromEpoch(
    [epoch]
  ) as [string[], bigint[]];

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
  rewards: TContract['Rewards'],
  epoch: number,
  token: Hex
) {
  const amount = await rewards.read.getRewardsAmountPerTokenFromEpoch(
    [epoch, token]
  ) as bigint;

  console.log(`Rewards amount for token ${token} at epoch ${epoch}: ${amount.toString()}`);
  return amount;
}

/**
 * Gets operator shares for a specific epoch
 */
export async function getOperatorShares(
  rewards: TContract['Rewards'],
  epoch: number,
  operator: Hex
) {
  const share = await rewards.read.operatorShares(
    [epoch, operator]
  ) as bigint;

  console.log(`Operator ${operator} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets vault shares for a specific epoch
 */
export async function getVaultShares(
  rewards: TContract['Rewards'],
  epoch: number,
  vault: Hex
) {
  const share = await rewards.read.vaultShares(
    [epoch, vault]
  ) as bigint;

  console.log(`Vault ${vault} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets curator shares for a specific epoch
 */
export async function getCuratorShares(
  rewards: TContract['Rewards'],
  epoch: number,
  curator: Hex
) {
  const share = await rewards.read.curatorShares(
    [epoch, curator]
  ) as bigint;

  console.log(`Curator ${curator} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets protocol rewards for a token
 */
export async function getProtocolRewards(
  rewards: TContract['Rewards'],
  token: Hex
) {
  const rewardsAmount = await rewards.read.protocolRewards(
    [token]
  ) as bigint;

  console.log(`Protocol rewards for token ${token}: ${rewardsAmount.toString()}`);
  return rewardsAmount;
}

/**
 * Gets distribution batch status for an epoch
 */
export async function getDistributionBatch(
  rewards: TContract['Rewards'],
  epoch: number
) {
  const result = await rewards.read.distributionBatches(
    [epoch]
  ) as [bigint, boolean];

  console.log(`Distribution batch for epoch ${epoch}:`);
  const lastProcessedOperator = result[0];
  const isComplete = result[1];

  console.log(`  Last processed operator: ${lastProcessedOperator.toString()}`);
  console.log(`  Is complete: ${isComplete}`);

  return { lastProcessedOperator, isComplete };
}

/**
 * Gets current fees configuration
 */
export async function getFeesConfiguration(
  rewards: TContract['Rewards']
) {
  const protocolFee = await rewards.read.protocolFee();
  const operatorFee = await rewards.read.operatorFee();
  const curatorFee = await rewards.read.curatorFee();

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
  rewards: TContract['Rewards'],
  assetClass: bigint
) {
  const share = await rewards.read.rewardsSharePerAssetClass(
    [assetClass]
  ) as number;

  console.log(`Rewards share for asset class ${assetClass}: ${share}`);
  return share;
}

/**
 * Gets min required uptime
 */
export async function getMinRequiredUptime(
  rewards: TContract['Rewards']
) {
  const minUptime = await rewards.read.minRequiredUptime();

  console.log(`Minimum required uptime: ${minUptime.toString()}`);
  return minUptime;
}

/**
 * Gets last claimed epoch for a staker
 */
export async function getLastEpochClaimedStaker(
  rewards: TContract['Rewards'],
  staker: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedStaker(
    [staker]
  );

  console.log(`Last epoch claimed by staker ${staker}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for an operator
 */
export async function getLastEpochClaimedOperator(
  rewards: TContract['Rewards'],
  operator: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedOperator(
    [operator]
  );

  console.log(`Last epoch claimed by operator ${operator}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for a curator
 */
export async function getLastEpochClaimedCurator(
  rewards: TContract['Rewards'],
  curator: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedCurator(
    [curator]
  );

  console.log(`Last epoch claimed by curator ${curator}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for protocol
 */
export async function getLastEpochClaimedProtocol(
  rewards: TContract['Rewards'],
  protocolOwner: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedProtocol(
    [protocolOwner]
  );

  console.log(`Last epoch claimed by protocol owner ${protocolOwner}: ${lastEpoch.toString()}`);
  return lastEpoch;
}
