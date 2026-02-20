import { SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';
import { logger } from './lib/logger';
import { Config } from './config';

/**
 * Distributes rewards for a specific epoch
 */
export async function distributeRewards(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  epoch: number,
  batchSize: number
) {

  const txHash = await rewards.safeWrite.distributeRewards([epoch, batchSize]);
  return txHash;
}

export async function getRewardsClaimsCount(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  config: Config,
  role: 'Staker' | 'Operator' | 'Curator',
  account: Account
) {
  const [lastEpoch, middlewareAddress, maxEpochPerClaim] = await Promise.all([
    rewards.read[`lastEpochClaimed${role}`]([account.address!] as never),
    rewards.read.middleware(),
    rewards.read.MAX_EPOCHS_PER_CLAIM()
  ]);
  const middleware = await config.contracts.L1Middleware(middlewareAddress);
  const epoch = await middleware.read.getCurrentEpoch();
  return Math.ceil((epoch - lastEpoch) / maxEpochPerClaim);
}

/**
 * Claims rewards for a staker
 */
export async function claimRewards(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  recipient: Hex
) {

  const txHash = await rewards.safeWrite.claimRewards([recipient]);
  return txHash;
}

/**
 * Claims operator fees
 */
export async function claimOperatorFee(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  recipient: Hex
) {
  const txHash = await rewards.safeWrite.claimOperatorFee([recipient]);
  return txHash;
}

/**
 * Claims curator fees
 */
export async function claimCuratorFee(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  recipient: Hex
) {
  const txHash = await rewards.safeWrite.claimCuratorFee([recipient]);
  return txHash;
}

/**
 * Claims protocol fees
 */
export async function claimProtocolFee(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  recipient: Hex
) {
  const txHash = await rewards.safeWrite.claimProtocolFee([recipient]);
  return txHash;
}

/**
 * Claims undistributed rewards
 */
export async function claimUndistributedRewards(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  epoch: number,
  recipient: Hex
) {
  const txHash = await rewards.safeWrite.claimUndistributedRewards([epoch, recipient]);
  return txHash;
}

/**
 * Sets rewards amount for epochs
 */
export async function setRewardsAmountForEpochs(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  startEpoch: number,
  numberOfEpochs: number,
  rewardsAmount: bigint
) {
  const txHash = await rewards.safeWrite.setRewardsAmountForEpochs([startEpoch, numberOfEpochs, rewardsAmount]);
  return txHash;
}

/**
 * Sets rewards share for collateral class
 */
export async function setRewardsBipsForCollateralClass(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  collateralClass: bigint,
  bips: number
) {
  const txHash = await rewards.safeWrite.setRewardsBipsForCollateralClass([collateralClass, bips]);
  return txHash;
}

/**
 * Sets minimum required uptime
 */
export async function setMinRequiredUptime(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  minUptime: bigint
) {
  const txHash = await rewards.safeWrite.setMinRequiredUptime([minUptime]);
  return txHash;
}

/**
 * Sets protocol owner
 */
export async function setProtocolOwner(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  newOwner: Hex
) {
  const txHash = await rewards.safeWrite.setProtocolOwner([newOwner]);
  return txHash;
}

/**
 * Updates protocol fee
 */
export async function updateProtocolFee(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  newFee: number
) {
  const txHash = await rewards.safeWrite.updateProtocolFee([newFee]);
  return txHash;
}

/**
 * Updates operator fee
 */
export async function updateOperatorFee(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  newFee: number
) {
  const txHash = await rewards.safeWrite.updateOperatorFee([newFee]);
  return txHash;
}

/**
 * Updates curator fee
 */
export async function updateCuratorFee(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  newFee: number
) {
  const txHash = await rewards.safeWrite.updateCuratorFee([newFee]);
  return txHash;
}

/**
 * Updates all fees at once to avoid order dependency issues
 */
export async function updateAllFees(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  newProtocolFee: number,
  newOperatorFee: number,
  newCuratorFee: number
) {
  const txHash = await rewards.safeWrite.updateAllFees([newProtocolFee, newOperatorFee, newCuratorFee]);
  return txHash;
}

/**
 * Gets rewards amount for a specific token from epoch
 */
export async function getEpochRewards(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  epoch: number
) {
  const amount = await rewards.read.getEpochRewards(
    [epoch]
  ) as bigint;
  logger.log(`Rewards amount at epoch ${epoch}: ${amount.toString()}`);
  logger.addData('epochRewards', amount.toString());
  return amount;
}

/**
 * Gets operator shares for a specific epoch
 */
export async function getOperatorShares(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  epoch: number,
  operator: Hex
) {
  const share = await rewards.read.operatorShares(
    [epoch, operator]
  ) as bigint;

  logger.log(`Operator ${operator} shares for epoch ${epoch}: ${share.toString()}`);
  logger.addData('operatorShares', share.toString());
  return share;
}

/**
 * Gets vault shares for a specific epoch
 */
export async function getVaultShares(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  epoch: number,
  vault: Hex
) {
  const share = await rewards.read.vaultShares(
    [epoch, vault]
  ) as bigint;

  logger.log(`Vault ${vault} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets curator shares for a specific epoch
 */
export async function getCuratorShares(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  epoch: number,
  curator: Hex
) {
  const share = await rewards.read.curatorShares(
    [epoch, curator]
  ) as bigint;

  logger.log(`Curator ${curator} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets protocol rewards for a token
 */
export async function getProtocolRewards(
  rewards: SafeSuzakuContract['RewardsNativeToken']
) {
  const rewardsAmount = await rewards.read.protocolRewards();

  logger.log(`Protocol rewards: ${rewardsAmount.toString()}`);
  return rewardsAmount;
}

/**
 * Gets distribution batch status for an epoch
 */
export async function getDistributionBatch(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  epoch: number
) {
  const result = await rewards.read.distributionBatches(
    [epoch]
  ) as [bigint, boolean];

  logger.log(`Distribution batch for epoch ${epoch}:`);
  const lastProcessedOperator = result[0];
  const isComplete = result[1];

  logger.log(`  Last processed operator: ${lastProcessedOperator.toString()}`);
  logger.log(`  Is complete: ${isComplete}`);

  logger.addData('distributionBatch', { lastProcessedOperator: lastProcessedOperator.toString(), isComplete });
  return { lastProcessedOperator, isComplete };
}

/**
 * Gets current fees configuration
 */
export async function getFeesConfiguration(
  rewards: SafeSuzakuContract['RewardsNativeToken']
) {
  const protocolFee = await rewards.read.protocolFee();
  const operatorFee = await rewards.read.operatorFee();
  const curatorFee = await rewards.read.curatorFee();

  logger.log("Fees configuration:");
  logger.log(`  Protocol fee: ${protocolFee}`);
  logger.log(`  Operator fee: ${operatorFee}`);
  logger.log(`  Curator fee: ${curatorFee}`);

  logger.addData('feesConfig', { protocolFee: Number(protocolFee), operatorFee: Number(operatorFee), curatorFee: Number(curatorFee) });
  return { protocolFee, operatorFee, curatorFee };
}

/**
 * Gets rewards bips for collateral class
 */
export async function getRewardsBipsForCollateralClass(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  collateralClass: bigint
) {
  const bips = await rewards.read.rewardsBipsPerCollateralClass(
    [collateralClass]
  );

  logger.log(`Rewards bips for collateral class ${collateralClass}: ${bips}`);
  logger.addData('rewardsBips', Number(bips));
  return bips;
}

/**
 * Gets min required uptime
 */
export async function getMinRequiredUptime(
  rewards: SafeSuzakuContract['RewardsNativeToken']
) {
  const minUptime = await rewards.read.minRequiredUptime();

  logger.log(`Minimum required uptime: ${minUptime.toString()}`);
  logger.addData('minRequiredUptime', minUptime.toString());
  return minUptime;
}

/**
 * Gets last claimed epoch for a staker
 */
export async function getLastEpochClaimedStaker(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  staker: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedStaker([staker]);

  logger.log(`Last epoch claimed by staker ${staker}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for an operator
 */
export async function getLastEpochClaimedOperator(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  operator: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedOperator([operator]);

  logger.log(`Last epoch claimed by operator ${operator}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for a curator
 */
export async function getLastEpochClaimedCurator(
  rewards: SafeSuzakuContract['RewardsNativeToken'],
  curator: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedCurator([curator]);

  logger.log(`Last epoch claimed by curator ${curator}: ${lastEpoch.toString()}`);
  return lastEpoch;
}
