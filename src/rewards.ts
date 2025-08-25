import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';

/**
 * Distributes rewards for a specific epoch
 */
export async function distributeRewards(
  rewards: SafeSuzakuContract['Rewards'],
  epoch: number,
  batchSize: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.distributeRewards(
    [epoch, batchSize],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims rewards for a staker
 */
export async function claimRewards(
  rewards: SafeSuzakuContract['Rewards'],
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.claimRewards(
    [rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims operator fees
 */
export async function claimOperatorFee(
  rewards: SafeSuzakuContract['Rewards'],
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.claimOperatorFee(
    [rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims curator fees
 */
export async function claimCuratorFee(
  rewards: SafeSuzakuContract['Rewards'],
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.claimCuratorFee(
    [rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims protocol fees
 */
export async function claimProtocolFee(
  rewards: SafeSuzakuContract['Rewards'],
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.claimProtocolFee(
    [rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims undistributed rewards
 */
export async function claimUndistributedRewards(
  rewards: SafeSuzakuContract['Rewards'],
  epoch: number,
  rewardsToken: Hex,
  recipient: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.claimUndistributedRewards(
    [epoch, rewardsToken, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets rewards amount for epochs
 */
export async function setRewardsAmountForEpochs(
  rewards: SafeSuzakuContract['Rewards'],
  startEpoch: number,
  numberOfEpochs: number,
  rewardsToken: Hex,
  rewardsAmount: bigint,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.setRewardsAmountForEpochs(
    [startEpoch, numberOfEpochs, rewardsToken, rewardsAmount],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets rewards share for collateral class
 */
export async function setRewardsShareForCollateralClass(
  rewards: SafeSuzakuContract['Rewards'],
  collateralClass: bigint,
  share: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.setRewardsShareForCollateralClass(
    [collateralClass, share],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets minimum required uptime
 */
export async function setMinRequiredUptime(
  rewards: SafeSuzakuContract['Rewards'],
  minUptime: bigint,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.setMinRequiredUptime(
    [minUptime],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets admin role
 */
export async function setAdminRole(
  rewards: SafeSuzakuContract['Rewards'],
  newAdmin: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  
  // Get the DEFAULT_ADMIN_ROLE constant
  const DEFAULT_ADMIN_ROLE = await rewards.read.DEFAULT_ADMIN_ROLE();
  
  // Grant admin role to the new admin
  const txHash = await rewards.safeWrite.grantRole(
    [DEFAULT_ADMIN_ROLE, newAdmin],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets protocol owner
 */
export async function setProtocolOwner(
  rewards: SafeSuzakuContract['Rewards'],
  newOwner: Hex,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.setProtocolOwner(
    [newOwner],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Updates protocol fee
 */
export async function updateProtocolFee(
  rewards: SafeSuzakuContract['Rewards'],
  newFee: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.updateProtocolFee(
    [newFee],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Updates operator fee
 */
export async function updateOperatorFee(
  rewards: SafeSuzakuContract['Rewards'],
  newFee: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  const txHash = await rewards.safeWrite.updateOperatorFee(
    [newFee],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Updates curator fee
 */
export async function updateCuratorFee(
  rewards: SafeSuzakuContract['Rewards'],
  newFee: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  
  const txHash = await rewards.safeWrite.updateCuratorFee(
    [newFee],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Updates all fees at once to avoid order dependency issues
 */
export async function updateAllFees(
  rewards: SafeSuzakuContract['Rewards'],
  newProtocolFee: number,
  newOperatorFee: number,
  newCuratorFee: number,
  account: Account | undefined
) {
  if (!account) throw new Error("No client account set.");
  
  const txHash = await rewards.safeWrite.updateAllFees(
    [newProtocolFee, newOperatorFee, newCuratorFee],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Gets rewards amount per token from epoch
 */
export async function getRewardsAmountPerTokenFromEpoch(
  rewards: SafeSuzakuContract['Rewards'],
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
  rewards: SafeSuzakuContract['Rewards'],
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
  rewards: SafeSuzakuContract['Rewards'],
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
  rewards: SafeSuzakuContract['Rewards'],
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
  rewards: SafeSuzakuContract['Rewards'],
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
  rewards: SafeSuzakuContract['Rewards'],
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
  rewards: SafeSuzakuContract['Rewards'],
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
  rewards: SafeSuzakuContract['Rewards']
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
 * Gets rewards share for collateral class
 */
export async function getRewardsShareForCollateralClass(
  rewards: SafeSuzakuContract['Rewards'],
  collateralClass: bigint
) {
  const share = await rewards.read.rewardsSharePerCollateralClass(
    [collateralClass]
  );

  console.log(`Rewards share for collateral class ${collateralClass}: ${share}`);
  return share;
}

/**
 * Gets min required uptime
 */
export async function getMinRequiredUptime(
  rewards: SafeSuzakuContract['Rewards']
) {
  const minUptime = await rewards.read.minRequiredUptime();

  console.log(`Minimum required uptime: ${minUptime.toString()}`);
  return minUptime;
}

/**
 * Gets last claimed epoch for a staker
 */
export async function getLastEpochClaimedStaker(
  rewards: SafeSuzakuContract['Rewards'],
  staker: Hex,
  rewardToken: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedStaker([staker, rewardToken]);

  console.log(`Last epoch claimed by staker ${staker} for token ${rewardToken}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for an operator
 */
export async function getLastEpochClaimedOperator(
  rewards: SafeSuzakuContract['Rewards'],
  operator: Hex,
  rewardToken: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedOperator([operator, rewardToken]);

  console.log(`Last epoch claimed by operator ${operator} for token ${rewardToken}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for a curator
 */
export async function getLastEpochClaimedCurator(
  rewards: SafeSuzakuContract['Rewards'],
  curator: Hex,
  rewardToken: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedCurator([curator, rewardToken]);

  console.log(`Last epoch claimed by curator ${curator} for token ${rewardToken}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for protocol
 */
export async function getLastEpochClaimedProtocol(
  rewards: SafeSuzakuContract['Rewards'],
  protocolOwner: Hex,
  rewardToken: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedProtocol([protocolOwner, rewardToken]);

  console.log(`Last epoch claimed by protocol owner ${protocolOwner} for token ${rewardToken}: ${lastEpoch.toString()}`);
  return lastEpoch;
}
