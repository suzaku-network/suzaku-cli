import { fromBytes, hexToBytes, bytesToHex, parseUnits, type Hex, type Address } from 'viem';
import { utils } from '@avalabs/avalanchejs';
import type { IContract, IReadContract } from '../client/contract';
import type { ExtendedClient, ExtendedWalletClient } from '../client/types';
import type { TL1MiddlewareABI } from './abi';
import L1MiddlewareABI from './abi';
import { getDefaultCollateral } from '../DefaultCollateral';
import { getBalancerValidatorManager } from '../BalancerValidatorManager';
import { ValidatorStatus } from '../BalancerValidatorManager/types';
import { parseNodeID, encodeNodeID, type NodeId } from '../lib/avalancheUtils';
import { blockAtTimestamp, collectEventsInRange } from '../lib/cChainUtils';
import { getCurrentValidators } from '../lib/pChainUtils';
import { completeValidatorRemoval } from '../securityModule';
import { logger } from '../logger';
import type { PChainOwnerOptions } from '../StakingVault/service';

export async function getCurrentEpoch(middleware: IContract<TL1MiddlewareABI, 'getCurrentEpoch'>) {
  return middleware.read.getCurrentEpoch();
}

export async function registerOperator(middleware: IContract<TL1MiddlewareABI, 'registerOperator'>, operator: Address) {
  return middleware.safeWrite.registerOperator([operator]);
}

export async function addNode(
  client: ExtendedWalletClient,
  middleware: IContract<TL1MiddlewareABI, 'addNode' | 'PRIMARY_ASSET'>,
  nodeId: NodeId,
  blsKey: Hex,
  initialStake: string,
  remainingBalanceOwner?: PChainOwnerOptions,
  disableOwner?: PChainOwnerOptions,
): Promise<Hex> {
  const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex') as Hex;
  const remainingBalanceAddresses = remainingBalanceOwner?.addresses?.length ? remainingBalanceOwner.addresses : [defaultOwnerAddress];
  const disableAddresses = disableOwner?.addresses?.length ? disableOwner.addresses : [defaultOwnerAddress];
  const primaryCollateral = await getDefaultCollateral(client, await middleware.read.PRIMARY_ASSET());
  const initialStakeWei = parseUnits(initialStake, await primaryCollateral.read.decimals());
  return middleware.safeWrite.addNode([
    parseNodeID(nodeId),
    blsKey,
    { threshold: remainingBalanceOwner?.threshold ?? 1, addresses: remainingBalanceAddresses },
    { threshold: disableOwner?.threshold ?? 1, addresses: disableAddresses },
    initialStakeWei,
  ]);
}

export async function initStakeUpdate(
  client: ExtendedClient,
  middleware: IContract<TL1MiddlewareABI, 'initializeValidatorStakeUpdate' | 'PRIMARY_ASSET'>,
  nodeId: NodeId,
  newStake: string,
): Promise<Hex> {
  const primaryCollateral = await getDefaultCollateral(client, await middleware.read.PRIMARY_ASSET());
  const newStakeWei = parseUnits(newStake, await primaryCollateral.read.decimals());
  return middleware.safeWrite.initializeValidatorStakeUpdate([parseNodeID(nodeId), newStakeWei]);
}

export async function processNodeStakeCache(
  middleware: IContract<TL1MiddlewareABI, 'manualProcessNodeStakeCache' | 'getCurrentEpoch' | 'lastGlobalNodeStakeUpdateEpoch'>,
  epochs?: number,
  loopEpochs?: number,
  delay?: number,
): Promise<void> {
  let epochsPerCall: number;
  let loopCount: number;
  if (epochs || loopEpochs) {
    epochsPerCall = epochs ?? 1;
    loopCount = loopEpochs ?? 1;
  } else {
    const diff = await middleware.read.getCurrentEpoch() - await middleware.read.lastGlobalNodeStakeUpdateEpoch();
    loopCount = diff > 50 ? Math.ceil(diff / 50) : 1;
    epochsPerCall = Math.ceil(diff / loopCount);
  }
  logger.log(`Processing node stake cache: ${loopCount} iterations of ${epochsPerCall} epoch(s) each`);
  for (let i = 0; i < loopCount; i++) {
    logger.log(`\nIteration ${i + 1}/${loopCount}`);
    const hash = await middleware.safeWrite.manualProcessNodeStakeCache([epochsPerCall]);
    logger.log("manualProcessNodeStakeCache done, tx hash:", hash);
    if (i < loopCount - 1 && delay && delay > 0) {
      logger.log(`Waiting ${delay}ms before next iteration...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  logger.log(`\nCompleted processing ${loopCount * epochsPerCall} total epochs`);
}

export type OperatorForceUpdatePrediction = {
  operator: Hex;
  willLoseWeight: boolean;
  currentTotalStake: bigint;
  cappedTotalStake: bigint;
  registeredStake: bigint;
  stakeDeficit: bigint;
  activeNodesCount: number;
};

export async function predictForceUpdateImpact(
  client: ExtendedClient,
  middleware: IReadContract<TL1MiddlewareABI,
    'getCurrentEpoch' | 'WEIGHT_SCALE_FACTOR' | 'BALANCER' | 'PRIMARY_ASSET_CLASS' |
    'getOperatorStake' | 'getOperatorUsedStakeCached' | 'operatorLockedStake' | 'getActiveNodesForEpoch'>,
  operators: Hex[],
): Promise<OperatorForceUpdatePrediction[]> {
  if (operators.length === 0) return [];
  const [currentEpoch, weightScaleFactor, balancerAddress, primaryAssetClass] = await middleware.multicall([
    'getCurrentEpoch', 'WEIGHT_SCALE_FACTOR', 'BALANCER', 'PRIMARY_ASSET_CLASS',
  ]) as [number, bigint, Hex, bigint];
  const balancer = await getBalancerValidatorManager(client, balancerAddress);
  const [, securityModuleMaxWeight] = await balancer.read.getSecurityModuleWeights([middleware.address]);
  const maxStakeCap = BigInt(securityModuleMaxWeight) * weightScaleFactor;
  const results = await middleware.multicall(operators.flatMap(op => [
    { name: 'getOperatorStake' as const, args: [op, currentEpoch, primaryAssetClass] as [Hex, number, bigint] },
    { name: 'getOperatorUsedStakeCached' as const, args: [op] as [Hex] },
    { name: 'operatorLockedStake' as const, args: [op] as [Hex] },
    { name: 'getActiveNodesForEpoch' as const, args: [op, currentEpoch] as [Hex, number] },
  ])) as (bigint | readonly Hex[])[];
  return operators.map((operator, i) => {
    const base = i * 4;
    const theoreticalStake = results[base] as bigint;
    const usedStake = results[base + 1] as bigint;
    const lockedStake = results[base + 2] as bigint;
    const activeNodes = results[base + 3] as readonly Hex[];
    const cappedStake = theoreticalStake > maxStakeCap ? maxStakeCap : theoreticalStake;
    const registeredStake = usedStake + lockedStake;
    const stakeDeficit = cappedStake < registeredStake ? registeredStake - cappedStake : 0n;
    const willLoseWeight = stakeDeficit >= weightScaleFactor && activeNodes.length > 0;
    return { operator, willLoseWeight, currentTotalStake: theoreticalStake, cappedTotalStake: cappedStake, registeredStake, stakeDeficit, activeNodesCount: activeNodes.length };
  });
}

export async function getLastNodeValidationId(
  client: ExtendedClient,
  middleware: IReadContract<TL1MiddlewareABI, 'balancerValidatorManager' | 'START_TIME'>,
  nodeId: NodeId,
): Promise<Hex> {
  const balancerAddress = await middleware.read.balancerValidatorManager();
  const balancerSvc = await getBalancerValidatorManager(client, balancerAddress);
  const nodeIdHex = parseNodeID(nodeId);
  const rawValidationId = await balancerSvc.read.getNodeValidationID([nodeIdHex]);
  if (parseInt(rawValidationId, 16) !== 0) return rawValidationId;
  const fromBlock = await client.getBlockNumber();
  const toBlock = await blockAtTimestamp(client, BigInt(await middleware.read.START_TIME()));
  const events = await collectEventsInRange(fromBlock, toBlock, 1, (opts) =>
    client.getContractEvents({ abi: L1MiddlewareABI, address: middleware.address, eventName: 'NodeAdded', args: { nodeId: nodeIdHex }, ...opts })
  );
  if (events.length === 0) throw new Error(`Node ID ${nodeId} never registered in the middleware`);
  return events[0].args.validationID!;
}

export type ValidatorTopUp = { validationId: Hex; topup: bigint };

export async function getValidatorsToTopUp(
  client: ExtendedClient,
  middleware: IReadContract<TL1MiddlewareABI, 'BALANCER' | 'getOperatorNodesLength' | 'operatorNodesArray'>,
  operator: Hex,
  targetBalanceWei: bigint,
): Promise<{ validatorsToTopUp: ValidatorTopUp[]; totalTopUp: bigint; nodeCount: bigint }> {
  const balancerAddress = await middleware.read.BALANCER();
  const balancer = await getBalancerValidatorManager(client, balancerAddress as Hex);
  const [nodeCount, subnetID] = await Promise.all([
    middleware.read.getOperatorNodesLength([operator]),
    balancer.read.subnetID(),
  ]);
  const validators = await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetID as Hex)));
  const nodeIds = await Promise.all(
    Array.from({ length: Number(nodeCount) }, (_, i) => middleware.read.operatorNodesArray([operator, BigInt(i)]))
  );
  const validatorsToTopUp = nodeIds.reduce((acc, nodeIdHex) => {
    const validator = validators.find(v => v.nodeID === encodeNodeID(nodeIdHex as Hex));
    if (validator && BigInt(validator.balance!) < targetBalanceWei - BigInt(1e7)) {
      acc.push({ validationId: validator.validationID! as Hex, topup: targetBalanceWei - BigInt(validator.balance!) });
    }
    return acc;
  }, [] as ValidatorTopUp[]);
  return { validatorsToTopUp, totalTopUp: validatorsToTopUp.reduce((acc, v) => acc + v.topup, 0n), nodeCount: nodeCount as bigint };
}

export async function weightSync(
  client: ExtendedWalletClient,
  middleware: IContract<TL1MiddlewareABI,
    'lastGlobalNodeStakeUpdateEpoch' | 'getCurrentEpoch' | 'UPDATE_WINDOW' | 'getEpochStartTs' |
    'manualProcessNodeStakeCache' | 'getCollateralClassIds' | 'getAllOperators' | 'calcAndCacheStakes' |
    'BALANCER' | 'forceUpdateNodes' | 'WEIGHT_SCALE_FACTOR' | 'PRIMARY_ASSET_CLASS' |
    'getOperatorStake' | 'getOperatorUsedStakeCached' | 'operatorLockedStake' | 'getActiveNodesForEpoch' |
    'completeValidatorRemoval'>,
  epochs?: number,
  loopEpochs?: number,
): Promise<string[]> {
  const [lastGlobalNodeStakeUpdateEpoch, currentEpoch, updateWindow] = await middleware.multicall([
    'lastGlobalNodeStakeUpdateEpoch', 'getCurrentEpoch', 'UPDATE_WINDOW',
  ]) as [number, number, number];

  let epochsPerCall: number;
  let loopCount: number;
  if (epochs || loopEpochs) {
    epochsPerCall = epochs ?? 1;
    loopCount = loopEpochs ?? 1;
  } else {
    const diff = currentEpoch - lastGlobalNodeStakeUpdateEpoch;
    loopCount = diff > 50 ? Math.ceil(diff / 50) : 1;
    epochsPerCall = Math.ceil(diff / loopCount);
  }

  const startEpochTs = await middleware.read.getEpochStartTs([currentEpoch]);
  if (Date.now() / 1000 < startEpochTs + updateWindow) {
    throw new Error(`Not enough time has passed since the start of the current epoch. Please wait until the update window has passed(${startEpochTs + updateWindow - Date.now() / 1000} seconds)`);
  }

  logger.log(`Processing node stake cache: ${loopCount} iterations of ${epochsPerCall} epoch(s) each`);
  for (let i = 0; i < loopCount; i++) {
    logger.log(`\nIteration ${i + 1}/${loopCount}`);
    const hash = await middleware.safeWrite.manualProcessNodeStakeCache([epochsPerCall]);
    logger.log("manualProcessNodeStakeCache done, tx hash:", hash);
  }

  const processedEpochs = Math.max(epochsPerCall * loopCount, currentEpoch - lastGlobalNodeStakeUpdateEpoch);
  const [collateralClasses, operators] = await middleware.multicall(['getCollateralClassIds', 'getAllOperators']) as [bigint[], Hex[]];

  for (let epoch = lastGlobalNodeStakeUpdateEpoch; epoch < lastGlobalNodeStakeUpdateEpoch + processedEpochs; epoch++) {
    for (const collateralClass of collateralClasses) {
      logger.log(`Processing epoch ${epoch} for collateral class ${collateralClass}`);
      await middleware.safeWrite.calcAndCacheStakes([epoch, collateralClass]);
    }
  }

  const predictions = await predictForceUpdateImpact(client, middleware, operators);
  for (const prediction of predictions) {
    if (prediction.willLoseWeight) {
      logger.log(`Operator ${prediction.operator} will lose weight`);
      logger.log(`Capped stake: ${prediction.cappedTotalStake}, registered: ${prediction.registeredStake}, deficit: ${prediction.stakeDeficit}`);
      const hash = await middleware.safeWrite.forceUpdateNodes([prediction.operator, 0n]);
      logger.addData('forceUpdateNodes', { operator: prediction.operator, stakeDeficit: prediction.stakeDeficit.toString(), txHash: hash });
    }
  }

  const balancerAddress = await middleware.read.BALANCER();
  const balancer = await getBalancerValidatorManager(client, balancerAddress as Hex);
  const nodesRemoved: string[] = [];

  if (operators.length > 0) {
    const subnetId = utils.base58check.encode(hexToBytes(await balancer.read.subnetID()));
    const validators = await getCurrentValidators(client, subnetId);
    const startBlock = await blockAtTimestamp(client, BigInt(await middleware.read.getEpochStartTs([currentEpoch - 2])));
    const nodeLogs = await client.getContractEvents({
      abi: L1MiddlewareABI,
      address: middleware.address,
      eventName: 'NodeRemoved',
      fromBlock: startBlock,
    });

    type PendingNode = { nodeID: Hex; validationID: Hex; txHash?: Hex };
    const seen = new Set<string>();
    const combinedNodes: PendingNode[] = [
      ...validators.map(v => ({
        nodeID: parseNodeID(v.nodeID as NodeId),
        validationID: bytesToHex(utils.base58check.decode(v.validationID!)),
      })),
      ...nodeLogs.map(l => ({
        nodeID: l.args.nodeId! as Hex,
        validationID: l.args.validationID! as Hex,
        txHash: l.transactionHash!,
      })),
    ].filter(n => {
      if (seen.has(n.validationID)) return false;
      seen.add(n.validationID);
      return true;
    });

    const statuses = await balancer.multicall(combinedNodes.map(v => ({ name: 'getValidator' as const, args: [v.validationID] as const })));
    statuses.forEach((status, i) => {
      logger.log(`Node ${combinedNodes[i].nodeID} status: ${(status as any).status}`);
    });
    const pendingRemovalNodes = combinedNodes.filter((_, i) => (statuses[i] as any).status === ValidatorStatus.PendingRemoved);

    if (pendingRemovalNodes.length > 0) {
      logger.log(`Found ${pendingRemovalNodes.length} nodes pending removal`);
      const processedTxHashes: Hex[] = [];
      for (const pendingNode of pendingRemovalNodes) {
        if (!pendingNode.txHash) {
          pendingNode.txHash = await balancer.safeWrite.resendValidatorRemovalMessage([pendingNode.validationID]);
          logger.log(`Resent validator removal message for node ${pendingNode.nodeID}, tx hash: ${pendingNode.txHash}`);
        }
        if (processedTxHashes.includes(pendingNode.txHash)) continue;
        processedTxHashes.push(pendingNode.txHash);
        logger.log(`Node pending removal found: ${pendingNode.nodeID}`);
        try {
          const { nodes } = await completeValidatorRemoval(client, middleware, balancer, client, pendingNode.txHash, false);
          nodesRemoved.push(...nodes);
        } catch (error) {
          logger.error(error);
        }
      }
    }
  }
  return nodesRemoved;
}
