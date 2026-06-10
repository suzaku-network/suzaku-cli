import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import type { Hex, Account } from 'viem';
import { logger } from './lib/logger';
import { Config } from './config';
import { ExtendedPublicClient } from './client';
import { blockAtTimestamp, collectEventsInRange, DecodedEvent, GetContractEvents } from './lib/cChainUtils';

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
  rewards: SuzakuContract['RewardsNativeToken'],
  config: Config<ExtendedPublicClient>,
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
  rewards: SuzakuContract['RewardsNativeToken'],
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
  rewards: SuzakuContract['RewardsNativeToken'],
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
  rewards: SuzakuContract['RewardsNativeToken'],
  epoch: number,
  vault: Hex
) {
  const share = await rewards.read.vaultShares(
    [epoch, vault]
  ) as bigint;

  logger.log(`Vault ${vault} shares for epoch ${epoch}: ${share.toString()}`);
  logger.addData('vaultShares', share.toString());
  return share;
}

/**
 * Gets curator shares for a specific epoch
 */
export async function getCuratorShares(
  rewards: SuzakuContract['RewardsNativeToken'],
  epoch: number,
  curator: Hex
) {
  const share = await rewards.read.curatorShares(
    [epoch, curator]
  ) as bigint;

  logger.log(`Curator ${curator} shares for epoch ${epoch}: ${share.toString()}`);
  logger.addData('curatorShares', share.toString());
  return share;
}

/**
 * Gets protocol rewards for a token
 */
export async function getProtocolRewards(
  rewards: SuzakuContract['RewardsNativeToken']
) {
  const rewardsAmount = await rewards.read.protocolRewards();

  logger.log(`Protocol rewards: ${rewardsAmount.toString()}`);
  return rewardsAmount;
}

/**
 * Gets distribution batch status for an epoch
 */
export async function getDistributionBatch(
  rewards: SuzakuContract['RewardsNativeToken'],
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
  rewards: SuzakuContract['RewardsNativeToken']
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
  rewards: SuzakuContract['RewardsNativeToken'],
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
  rewards: SuzakuContract['RewardsNativeToken']
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
  rewards: SuzakuContract['RewardsNativeToken'],
  staker: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedStaker([staker]);

  logger.log(`Last epoch claimed by staker ${staker}: ${lastEpoch.toString()}`);
  logger.addData('lastClaimedEpoch', lastEpoch.toString());
  return lastEpoch;
}

/**
 * Gets last claimed epoch for an operator
 */
export async function getLastEpochClaimedOperator(
  rewards: SuzakuContract['RewardsNativeToken'],
  operator: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedOperator([operator]);

  logger.log(`Last epoch claimed by operator ${operator}: ${lastEpoch.toString()}`);
  logger.addData('lastClaimedEpoch', lastEpoch.toString());
  return lastEpoch;
}

/**
 * Gets last claimed epoch for a curator
 */
export async function getLastEpochClaimedCurator(
  rewards: SuzakuContract['RewardsNativeToken'],
  curator: Hex
) {
  const lastEpoch = await rewards.read.lastEpochClaimedCurator([curator]);

  logger.log(`Last epoch claimed by curator ${curator}: ${lastEpoch.toString()}`);
  logger.addData('lastClaimedEpoch', lastEpoch.toString());
  return lastEpoch;
}

/**
 * Lists every RewardsAmountSet event that covers a given epoch —
 * diagnoses repeated set-amount calls, whose amounts accumulate on-chain.
 */
export async function getRewardsAmountSetEvents(
  rewards: SuzakuContract['RewardsNativeToken'],
  config: Config<ExtendedPublicClient>,
  epoch: number,
  options: {
    middlewareAddress?: Hex;
    fromBlock?: bigint;
    toBlock?: bigint;
  }
) {
  const client = config.client;
  let fromBlock: bigint;
  if (options.fromBlock !== undefined) {
    fromBlock = options.fromBlock;
  } else if (options.middlewareAddress) {
    const middleware = await config.contracts.L1Middleware(options.middlewareAddress);
    const lookbackEpoch = Math.max(epoch - 2, 0);
    const epochStartTs = await middleware.read.getEpochStartTs([lookbackEpoch]);
    fromBlock = await blockAtTimestamp(client, BigInt(epochStartTs));
  } else {
    throw new Error('Either --from-block or --middleware must be provided');
  }

  const toBlock = options.toBlock ?? (await client.getBlockNumber());

  const events = await collectEventsInRange(
    fromBlock,
    toBlock,
    -1,
    (opts) => client.getContractEvents({
      address: rewards.address as Hex,
      abi: rewards.abi,
      eventName: 'RewardsAmountSet',
      fromBlock: opts.fromBlock,
      toBlock: opts.toBlock,
    })
  );

  const matching = events.filter((e) => {
    const startEpoch = Number(e.args.startEpoch);
    const numberOfEpochs = Number(e.args.numberOfEpochs);
    return startEpoch <= epoch && epoch < startEpoch + numberOfEpochs;
  });

  const blockTimestampCache: Record<number, number> = {};
  const getBlockTimestamp = async (blockNumber: bigint): Promise<number> => {
    const n = Number(blockNumber);
    if (blockTimestampCache[n] !== undefined) return blockTimestampCache[n];
    const block = await client.getBlock({ blockNumber, includeTransactions: false });
    blockTimestampCache[n] = Number(block.timestamp);
    return blockTimestampCache[n];
  };

  const formattedEvents = await Promise.all(matching.map(async (e) => {
    const ts = await getBlockTimestamp(e.blockNumber);
    return {
      txHash: e.transactionHash,
      blockNumber: e.blockNumber.toString(),
      timestamp: new Date(ts * 1000).toISOString(),
      startEpoch: Number(e.args.startEpoch),
      numberOfEpochs: Number(e.args.numberOfEpochs),
      rewardsToken: e.args.rewardsToken as string,
      rewardsAmount: (e.args.rewardsAmount as bigint).toString(),
    };
  }));

  const totalAmount = formattedEvents.reduce((acc, e) => acc + BigInt(e.rewardsAmount), 0n);
  const currentEpochRewards = (await rewards.read.getEpochRewards([epoch]) as bigint).toString();

  logger.log(`RewardsAmountSet events covering epoch ${epoch}: ${formattedEvents.length}`);
  for (const ev of formattedEvents) {
    logger.log(`  tx: ${ev.txHash} block: ${ev.blockNumber} (${ev.timestamp})`);
    logger.log(`    startEpoch=${ev.startEpoch} numberOfEpochs=${ev.numberOfEpochs} rewardsToken=${ev.rewardsToken} rewardsAmount=${ev.rewardsAmount} (raw wei)`);
  }
  logger.log(`Total rewardsAmount across matched events: ${totalAmount.toString()} (raw wei)`);
  logger.log(`Current getEpochRewards(${epoch}): ${currentEpochRewards} (raw wei)`);

  logger.addData('rewardsAmountSetEvents', {
    epoch,
    eventCount: formattedEvents.length,
    totalAmount: totalAmount.toString(),
    currentEpochRewards,
    events: formattedEvents,
  });

  return { epoch, eventCount: formattedEvents.length, totalAmount, currentEpochRewards, events: formattedEvents };
}

/**
 * Reads funded/distribution status and the set rewards amount for a range of epochs —
 * epochStatus(epoch) is otherwise not exposed by any command.
 */
export async function getRewardsEpochStatus(
  rewards: SuzakuContract['RewardsNativeToken'],
  fromEpoch: number,
  toEpoch: number
) {
  if (toEpoch < fromEpoch) {
    throw new Error(`--to-epoch (${toEpoch}) must be >= epoch (${fromEpoch})`);
  }
  if (toEpoch - fromEpoch + 1 > 100) {
    throw new Error(`Epoch range too large (${toEpoch - fromEpoch + 1}); maximum is 100 epochs per call`);
  }
  const epochs = Array.from({ length: toEpoch - fromEpoch + 1 }, (_, i) => fromEpoch + i);

  const [fundingDeadlineOffset, distributionEarliestOffset, claimGracePeriodEpochs, statuses, amounts] = await Promise.all([
    rewards.read.FUNDING_DEADLINE_OFFSET(),
    rewards.read.DISTRIBUTION_EARLIEST_OFFSET(),
    rewards.read.CLAIM_GRACE_PERIOD_EPOCHS(),
    Promise.all(epochs.map((e) => rewards.read.epochStatus([e]))),
    Promise.all(epochs.map((e) => rewards.read.getEpochRewards([e]))),
  ]);

  const epochRows = epochs.map((epoch, i) => {
    const [funded, distributionComplete] = statuses[i] as [boolean, boolean];
    return {
      epoch,
      epochRewards: (amounts[i] as bigint).toString(),
      funded,
      distributionComplete,
    };
  });

  logger.log(`Epoch status for epochs ${fromEpoch}..${toEpoch}:`);
  for (const row of epochRows) {
    logger.log(`  epoch ${row.epoch}: rewards=${row.epochRewards} (raw wei) funded=${row.funded} distributionComplete=${row.distributionComplete}`);
  }

  logger.addData('epochStatusTable', {
    fromEpoch,
    toEpoch,
    constants: {
      fundingDeadlineOffset: Number(fundingDeadlineOffset),
      distributionEarliestOffset: Number(distributionEarliestOffset),
      claimGracePeriodEpochs: Number(claimGracePeriodEpochs),
    },
    epochs: epochRows,
  });

  return { fromEpoch, toEpoch, epochs: epochRows };
}

export const REWARDS_LIFECYCLE_EVENTS = [
  'RewardsAmountSet',
  'RewardsDistributed',
  'RewardsClaimed',
  'UndistributedRewardsClaimed',
  'OperatorFeeClaimed',
  'CuratorFeeClaimed',
  'ProtocolFeeClaimed',
  'ZeroRewardsClaim',
] as const;

/**
 * Scans rewards contract lifecycle events over a block or epoch range —
 * one source for "what happened in rewards" instead of one scan per event type.
 */
export async function getRewardsLifecycleEvents(
  rewards: SuzakuContract['RewardsNativeToken'],
  config: Config<ExtendedPublicClient>,
  options: {
    middlewareAddress?: Hex;
    fromEpoch?: number;
    toEpoch?: number;
    fromBlock?: bigint;
    toBlock?: bigint;
    events?: string[];
    snowscanApiKey?: string;
  }
) {
  const client = config.client;
  const eventNames = options.events ?? [...REWARDS_LIFECYCLE_EVENTS];
  const unknown = eventNames.filter((e) => !(REWARDS_LIFECYCLE_EVENTS as readonly string[]).includes(e));
  if (unknown.length > 0) {
    throw new Error(`Unknown event name(s): ${unknown.join(', ')}. Valid: ${REWARDS_LIFECYCLE_EVENTS.join(', ')}`);
  }

  const middleware = options.middlewareAddress
    ? await config.contracts.L1Middleware(options.middlewareAddress)
    : undefined;

  let fromBlock: bigint;
  if (options.fromBlock !== undefined) {
    fromBlock = options.fromBlock;
  } else if (options.fromEpoch !== undefined) {
    if (!middleware) throw new Error('--middleware is required when using --from-epoch');
    const epochStartTs = await middleware.read.getEpochStartTs([options.fromEpoch]);
    fromBlock = await blockAtTimestamp(client, BigInt(epochStartTs));
  } else {
    throw new Error('Either --from-block or --from-epoch (with --middleware) must be provided');
  }

  const latestBlock = await client.getBlock({ includeTransactions: false });
  let toBlock: bigint;
  if (options.toBlock !== undefined) {
    toBlock = options.toBlock;
  } else if (options.toEpoch !== undefined) {
    if (!middleware) throw new Error('--middleware is required when using --to-epoch');
    const nextEpochStartTs = BigInt(await middleware.read.getEpochStartTs([options.toEpoch + 1]));
    toBlock = nextEpochStartTs > latestBlock.timestamp
      ? latestBlock.number
      : await blockAtTimestamp(client, nextEpochStartTs);
  } else {
    toBlock = latestBlock.number;
  }

  const events = await GetContractEvents(
    client,
    rewards.address as Hex,
    Number(fromBlock),
    Number(toBlock),
    rewards.abi,
    eventNames,
    options.snowscanApiKey || undefined
  );
  events.sort((a, b) => Number(a.blockNumber - b.blockNumber));

  const countsByType = Object.fromEntries(eventNames.map((name) => [name, 0])) as Record<string, number>;
  const formattedEvents = events.map((e: DecodedEvent) => {
    countsByType[e.eventName] = (countsByType[e.eventName] ?? 0) + 1;
    return {
      eventName: e.eventName,
      blockNumber: e.blockNumber.toString(),
      transactionHash: e.transactionHash,
      timestamp: new Date(e.timestamp * 1000).toISOString(),
      args: Object.fromEntries(Object.entries(e.args).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])),
    };
  });

  logger.log(`Rewards lifecycle events in blocks ${fromBlock}..${toBlock}: ${formattedEvents.length}`);
  for (const [name, count] of Object.entries(countsByType)) {
    if (count > 0) logger.log(`  ${name}: ${count}`);
  }
  for (const ev of formattedEvents) {
    logger.log(`  ${ev.eventName} tx: ${ev.transactionHash} block: ${ev.blockNumber} (${ev.timestamp})`);
  }

  logger.addData('rewardsLifecycleEvents', {
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    ...(options.fromEpoch !== undefined ? { fromEpoch: options.fromEpoch } : {}),
    ...(options.toEpoch !== undefined ? { toEpoch: options.toEpoch } : {}),
    totalEventCount: formattedEvents.length,
    countsByType,
    events: formattedEvents,
  });

  return { fromBlock, toBlock, totalEventCount: formattedEvents.length, countsByType, events: formattedEvents };
}
