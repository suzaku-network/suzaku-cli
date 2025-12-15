import { contractAbiValidation, SafeSuzakuContract } from './lib/viemUtils';
import type { Hex, Account, Address } from 'viem';
import { logger } from './lib/logger';
import { Config } from './config';

export async function detectRewardsContract(config: Config, address: Address): Promise<SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken']> {
  const rewardsContractName = (await contractAbiValidation(config.client, ['Rewards', 'RewardsNativeToken'], address))
      .filter(r => r.valid)
      .map(r => r.name)[0]
  const rewardsContract = await config.contracts[rewardsContractName](address);
  return rewardsContract;
}

/**
 * Distributes rewards for a specific epoch
 */
export async function distributeRewards(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  epoch: number,
  batchSize: number,
  account: Account
) {

  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const txHash = await rewards.safeWrite.distributeRewards(
    [epoch, batchSize],
    { chain: null, account }
  );
  return txHash;
}

export async function getRewardsClaimsCount(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
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
  return Math.floor((epoch - lastEpoch) / maxEpochPerClaim);
}

/**
 * Claims rewards for a staker
 */
export async function claimRewards(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  account: Account,
  recipient: Hex,
  rewardsToken?: Hex
) {
  
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const txHash = await rewards.safeWrite.claimRewards(
    rewardsToken ? [rewardsToken, recipient] : [recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims operator fees
 */
export async function claimOperatorFee(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  account: Account,
  recipient: Hex,
  rewardsToken?: Hex
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const txHash = await rewards.safeWrite.claimOperatorFee(
    rewardsToken ? [rewardsToken, recipient] : [recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims curator fees
 */
export async function claimCuratorFee(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  account: Account,
  recipient: Hex,
  rewardsToken?: Hex
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const txHash = await rewards.safeWrite.claimCuratorFee(
    rewardsToken ? [rewardsToken, recipient] : [recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims protocol fees
 */
export async function claimProtocolFee(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  account: Account,
  recipient: Hex,
  rewardsToken?: Hex
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const txHash = await rewards.safeWrite.claimProtocolFee(
    rewardsToken ? [rewardsToken, recipient] : [recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Claims undistributed rewards
 */
export async function claimUndistributedRewards(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  account: Account,
  epoch: number,
  recipient: Hex,
  rewardsToken?: Hex
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const txHash = await rewards.safeWrite.claimUndistributedRewards(
    rewardsToken ? [epoch, rewardsToken, recipient] : [epoch, recipient],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets rewards amount for epochs
 */
export async function setRewardsAmountForEpochs(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  account: Account,
  startEpoch: number,
  numberOfEpochs: number,
  rewardsAmount: bigint,
  rewardsToken?: Hex
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const txHash = await rewards.safeWrite.setRewardsAmountForEpochs(
    rewardsToken ? [startEpoch, numberOfEpochs, rewardsToken, rewardsAmount] : [startEpoch, numberOfEpochs, rewardsAmount],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets rewards share for collateral class
 */
export async function setRewardsShareForCollateralClass(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  collateralClass: bigint,
  share: number,
  account: Account
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
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
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  minUptime: bigint,
  account: Account
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const txHash = await rewards.safeWrite.setMinRequiredUptime(
    [minUptime],
    { chain: null, account }
  );
  return txHash;
}

/**
 * Sets protocol owner
 */
export async function setProtocolOwner(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  newOwner: Hex,
  account: Account
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
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
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  newFee: number,
  account: Account
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
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
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  newFee: number,
  account: Account
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
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
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  newFee: number,
  account: Account
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
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
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  newProtocolFee: number,
  newOperatorFee: number,
  newCuratorFee: number,
  account: Account
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
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

  logger.log(`Rewards amount per token for epoch ${epoch}:`);
  for (let i = 0; i < result[0].length; i++) {
    logger.log(`  Token: ${result[0][i]}, Amount: ${result[1][i].toString()}`);
  }

  return result;
}

/**
 * Gets rewards amount for a specific token from epoch
 */
export async function getRewardsAmountForTokenFromEpoch(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  epoch: number,
  token?: Hex
) {
  let amount;
  if ('getRewardsAmountPerTokenFromEpoch' in rewards.read) {
    amount = await rewards.read.getRewardsAmountPerTokenFromEpoch(
      [epoch, token!]
    ) as bigint;
    logger.log(`Rewards amount for token ${token} at epoch ${epoch}: ${amount.toString()}`);
  } else {
    amount = await rewards.read.getEpochRewards(
      [epoch]
    ) as bigint;
    logger.log(`Rewards amount at epoch ${epoch}: ${amount.toString()}`);
  }


  return amount;
}

/**
 * Gets operator shares for a specific epoch
 */
export async function getOperatorShares(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  epoch: number,
  operator: Hex
) {
  const share = await rewards.read.operatorShares(
    [epoch, operator]
  ) as bigint;

  logger.log(`Operator ${operator} shares for epoch ${epoch}: ${share.toString()}`);
  return share;
}

/**
 * Gets vault shares for a specific epoch
 */
export async function getVaultShares(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
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
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
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
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  token: Hex
) {
  const rewardsAmount = await rewards.read.protocolRewards(
    [token]
  ) as bigint;

  logger.log(`Protocol rewards for token ${token}: ${rewardsAmount.toString()}`);
  return rewardsAmount;
}

/**
 * Gets distribution batch status for an epoch
 */
export async function getDistributionBatch(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
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

  return { lastProcessedOperator, isComplete };
}

/**
 * Gets current fees configuration
 */
export async function getFeesConfiguration(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken']
) {
  const protocolFee = await rewards.read.protocolFee();
  const operatorFee = await rewards.read.operatorFee();
  const curatorFee = await rewards.read.curatorFee();

  logger.log("Fees configuration:");
  logger.log(`  Protocol fee: ${protocolFee}`);
  logger.log(`  Operator fee: ${operatorFee}`);
  logger.log(`  Curator fee: ${curatorFee}`);

  return { protocolFee, operatorFee, curatorFee };
}

/**
 * Gets rewards share for collateral class
 */
export async function getRewardsShareForCollateralClass(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  collateralClass: bigint
) {
  const share = await rewards.read.rewardsSharePerCollateralClass(
    [collateralClass]
  );

  logger.log(`Rewards share for collateral class ${collateralClass}: ${share}`);
  return share;
}

/**
 * Gets min required uptime
 */
export async function getMinRequiredUptime(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken']
) {
  const minUptime = await rewards.read.minRequiredUptime();

  logger.log(`Minimum required uptime: ${minUptime.toString()}`);
  return minUptime;
}

/**
 * Gets last claimed epoch for a staker
 */
export async function getLastEpochClaimedStaker(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  staker: Hex,
  rewardToken?: Hex
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const lastEpoch = await rewards.read.lastEpochClaimedStaker(rewardToken ? [staker, rewardToken] : [staker]);

  logger.log(`Last epoch claimed by staker ${staker} for ${rewardToken ? 'token' + rewardToken : 'the native token'}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for an operator
 */
export async function getLastEpochClaimedOperator(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  operator: Hex,
  rewardToken?: Hex
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const lastEpoch = await rewards.read.lastEpochClaimedOperator(rewardToken ? [operator, rewardToken] : [operator]);

  logger.log(`Last epoch claimed by operator ${operator} for ${rewardToken ? 'token' + rewardToken : 'the native token'}: ${lastEpoch.toString()}`);
  return lastEpoch;
}

/**
 * Gets last claimed epoch for a curator
 */
export async function getLastEpochClaimedCurator(
  rewards: SafeSuzakuContract['Rewards'] | SafeSuzakuContract['RewardsNativeToken'],
  curator: Hex,
  rewardToken?: Hex
) {
  //@ts-expect-error - Event both Rewards and RewardsNativeToken have this method but types are not aligned
  const lastEpoch = await rewards.read.lastEpochClaimedCurator(rewardToken ? [curator, rewardToken] : [curator]);

  logger.log(`Last epoch claimed by curator ${curator} for ${rewardToken ? 'token' + rewardToken : 'the native token'}: ${lastEpoch.toString()}`);
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

  logger.log(`Last epoch claimed by protocol owner ${protocolOwner} for ${rewardToken ? 'token' + rewardToken : 'the native token'}: ${lastEpoch.toString()}`);
  return lastEpoch;
}
