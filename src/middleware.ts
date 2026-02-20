import { Hex, Account, getAbiItem, decodeEventLog, Abi, parseAbi } from 'viem';
import { SafeSuzakuContract } from './lib/viemUtils';
import { ExtendedClient, ExtendedPublicClient } from './client';
import { color } from 'console-log-colors';
import cliProgress from 'cli-progress';
import { Config } from './config';
import { encodeNodeID, NodeId, parseNodeID } from './lib/utils';
import { blockAtTimestamp, collectEventsInRange, DecodedEvent, fillEventsNodeId, GetContractEvents } from './lib/cChainUtils';
import { logger } from './lib/logger';

export async function middlewareRegisterOperator(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Registering operator...");

  const hash = await middleware.safeWrite.registerOperator([operator]);
  logger.log("registerOperator done, tx hash:", hash);
}

export async function middlewareDisableOperator(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Disabling operator...");

  const hash = await middleware.safeWrite.disableOperator([operator]);
  logger.log("disableOperator done, tx hash:", hash);
}

export async function middlewareRemoveOperator(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Removing operator...");

  const hash = await middleware.safeWrite.removeOperator([operator]);
  logger.log("removeOperator done, tx hash:", hash);
}

// addNode
export async function middlewareAddNode(
  middleware: SafeSuzakuContract['L1Middleware'],
  nodeId: NodeId,
  blsKey: Hex,
  remainingBalanceOwner: [number, `0x${string}`[]],
  disableOwner: [number, `0x${string}`[]],
  initialStake: bigint
) {
  logger.log("Calling function addNode...");

  // Parse NodeID to bytes32 format
  const nodeIdHex32 = parseNodeID(nodeId)

  const hash = await middleware.safeWrite.addNode([nodeIdHex32, blsKey, { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] }, { threshold: disableOwner[0], addresses: disableOwner[1] }, initialStake]);
  logger.log("addNode executed successfully, tx hash:", hash);
  return hash;
}

// removeNode
export async function middlewareRemoveNode(
  middleware: SafeSuzakuContract['L1Middleware'],
  nodeId: NodeId
) {
  logger.log("Calling function removeNode...");

  // Parse NodeID to bytes32 format
  const nodeIdHex32 = parseNodeID(nodeId)

  const hash = await middleware.safeWrite.removeNode([nodeIdHex32]);
  logger.log("removeNode executed successfully, tx hash:", hash);
  return hash;
}

// initializeValidatorWeightUpdate
export async function middlewareInitStakeUpdate(
  middleware: SafeSuzakuContract['L1Middleware'],
  nodeId: NodeId,
  newStake: bigint
) {
  logger.log("Calling function initializeValidatorStakeUpdate...");

  // Parse NodeID to bytes32 format
  const nodeIdHex32 = parseNodeID(nodeId)

  const hash = await middleware.safeWrite.initializeValidatorStakeUpdate([nodeIdHex32, newStake]);
  logger.log("initializeValidatorStakeUpdate executed successfully, tx hash:", hash);
  return hash;
}

// calcAndCacheNodeStakeForAllOperators
export async function middlewareCalcNodeStakes(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  logger.log("Calculating node stakes for all operators...");

  const hash = await middleware.safeWrite.calcAndCacheNodeStakeForAllOperators();
  logger.log("calcAndCacheNodeStakeForAllOperators done, tx hash:", hash);
}

// forceUpdateNodes
export async function middlewareForceUpdateNodes(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  limitStake: bigint
) {
  logger.log("Calling forceUpdateNodes...");

  const hash = await middleware.safeWrite.forceUpdateNodes([operator, limitStake]);
  logger.log("forceUpdateNodes executed successfully");
  logger.log("tx hash:", hash);
}

// getOperatorStake
export async function middlewareGetOperatorStake(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  epoch: number,
  collateralClass: bigint
) {
  logger.log("Reading operator stake...");

  const val = await middleware.read.getOperatorStake(
    [operator, epoch, collateralClass]
  );
  logger.log(val);
  logger.addData('operatorStake', val.toString());
}

// getCurrentEpoch
export async function middlewareGetCurrentEpoch(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  logger.log("Reading current epoch...");
  const val = await middleware.read.getCurrentEpoch();
  logger.log(val);
  logger.addData('epoch', Number(val));
}

// getEpochStartTs
export async function middlewareGetEpochStartTs(
  middleware: SafeSuzakuContract['L1Middleware'],
  epoch: number
) {
  logger.log("Reading epoch start timestamp...");

  const val = await middleware.read.getEpochStartTs(
    [epoch]
  );
  logger.log(val);
  logger.addData('epochStartTs', Number(val));
}

// getActiveNodesForEpoch
export async function middlewareGetActiveNodesForEpoch(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  epoch: number
) {
  logger.log("Reading active nodes for epoch...");

  const nodeIds = (await middleware.read.getActiveNodesForEpoch(
    [operator, epoch]
  ) as Hex[]).map((b: Hex) => encodeNodeID(b));
  logger.log(nodeIds);
  logger.addData('nodeIds', nodeIds);
}

// getOperatorNodesLength
export async function middlewareGetOperatorNodesLength(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Reading operator nodes length...");

  const length = await middleware.read.getOperatorNodesLength([operator]);
  logger.log(length);
  logger.addData('nodesLength', Number(length));
}

// nodeStakeCache
export async function middlewareGetNodeStakeCache(
  middleware: SafeSuzakuContract['L1Middleware'],
  epoch: number,
  validationId: Hex
) {
  logger.log("Reading node stake cache...");

  const val = await middleware.read.nodeStakeCache([epoch, validationId]);
  logger.log(val);
  logger.addData('nodeStakeCache', val.toString());
}

// operatorLockedStake
export async function middlewareGetOperatorLockedStake(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Reading operator locked stake...");

  const val = await middleware.read.operatorLockedStake([operator]);
  logger.log(val);
  logger.addData('lockedStake', val.toString());
}

// nodePendingRemoval
export async function middlewareNodePendingRemoval(
  middleware: SafeSuzakuContract['L1Middleware'],
  validatorId: Hex
) {
  logger.log("Reading nodePendingRemoval...");

  const val = await middleware.read.nodePendingRemoval([validatorId]);
  logger.log(val);
  logger.addData('pendingRemoval', val);
}

// nodePendingUpdate - Note: This function is not available in the current contract
export async function middlewareNodePendingUpdate(
  middleware: SafeSuzakuContract['L1Middleware'],
  validatorId: Hex
) {
  logger.log("Node pending update check is not available in the current contract version");
  logger.log(`ValidatorId: ${validatorId}`);
  logger.log("This functionality may be available through other contract methods or in future versions");
}

// getOperatorUsedStakeCached
export async function middlewareGetOperatorUsedStake(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Reading operator used stake cached...");

  const val = await middleware.read.getOperatorUsedStakeCached([operator]);
  logger.log(val);
  logger.addData('usedStake', val.toString());
}

// getAllOperators
export async function middlewareGetAllOperators(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  logger.log("Reading all operators from middleware...");

  const operators = await middleware.read.getAllOperators();
  logger.log(operators);
  logger.addData('operators', operators);
}

/**
 * Gets all operator nodes
 */
export async function getAllOperators(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  const operators = await middleware.read.getAllOperators();
  logger.log("All operators:", operators);
  return operators;
}

/**
 * Gets all collateral class IDs
 */
export async function getCollateralClassIds(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  const collateralClassIds = await middleware.read.getCollateralClassIds();
  logger.log("Collateral class IDs:", collateralClassIds);
  logger.addData('collateralClassIds', collateralClassIds.map(id => id.toString()));
  return collateralClassIds;
}

/**
 * Gets active collateral classes (primary and secondary)
 */
export async function getActiveCollateralClasses(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  const result = await middleware.read.getActiveCollateralClasses();
  logger.log("Active collateral classes - Primary:", result[0], "Secondaries:", result[1]);
  logger.addData('activeCollateralClasses', { primary: result[0].toString(), secondaries: result[1].map((s: bigint) => s.toString()) });
  return result;
}

export async function middlewareGetNodeLogs(
  client: ExtendedClient,
  middleware: SafeSuzakuContract['L1Middleware'],
  config: Config,
  nodeId?: NodeId,
  snowscanApiKey?: string,
  quiet?: boolean
) {
  logger.log("Reading logs from middleware and balancer...");

  const to = await client.getBlockNumber();

  const from = await blockAtTimestamp(client, BigInt(await middleware.read.START_TIME()));

  const bar = snowscanApiKey ? undefined : new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  if (bar) bar.start(0, 0);

  const logsProm: Promise<DecodedEvent[]>[] = []

  logsProm.push(GetContractEvents(
    client,
    middleware.address,
    Number(from),
    Number(to),
    config.abis.L1Middleware,
    ["NodeAdded", "NodeRemoved", "NodeStakeUpdated"],
    snowscanApiKey,
    snowscanApiKey ? false : true,
    bar
  ));

  const [l1ValidatorManagerAddress, balancerAddress] = await middleware.multicall(['BALANCER', 'balancerValidatorManager'])

  const completeEventsContractAddress = l1ValidatorManagerAddress as Hex || balancerAddress as Hex;

  if (completeEventsContractAddress) {
    logsProm.push(GetContractEvents(
      client,
      completeEventsContractAddress,
      Number(from),
      Number(to),
      config.abis.BalancerValidatorManager,
      undefined,
      snowscanApiKey,
      snowscanApiKey ? false : true,
      bar
    ));
  }
  const balancer = await config.contracts.BalancerValidatorManager(balancerAddress as Hex);

  const allLogs = await Promise.all(logsProm);
  let logs = allLogs.flat().sort((a, b) => Number(a.blockNumber - b.blockNumber));
  logs = await fillEventsNodeId(balancer, logs);
  if (quiet) {
    return logs;
  }
  // Human readable addresses and structured logs
  logger.addData('nodeLogs', logs.map((log: DecodedEvent) => ({
    blockNumber: log.blockNumber.toString(),
    transactionHash: log.transactionHash,
    eventName: log.eventName,
    address: log.address,
    args: Object.fromEntries(Object.entries(log.args).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])),
    timestamp: log.timestamp,
  })));
  const logOfInterest = groupEventsByNodeId(logs.map((log: DecodedEvent) => {
    log.address = log.address.toLowerCase() === middleware.address.toLowerCase() ? "Middleware" : "ValidatorManager";
    return log;
  }))

  if (nodeId != undefined) {
    const nodeIdHex32 = parseNodeID(nodeId);
    logger.log('\t\t\t' + color.blue(nodeId));
    logger.table(logOfInterest[nodeIdHex32] || []);
  } else {
    for (const [key, value] of Object.entries(logOfInterest)) {
      const nodeId = encodeNodeID(key as Hex);
      logger.log('\t\t\t\t\t\t' + color.blue(nodeId));
      logger.table(value);
    }
  }

}

export function groupEventsByNodeId(events: DecodedEvent[]): Record<string, { source: string; event: string; hash: string; executionTime: string/*args: string*/ }[]> {
  return events.reduce((acc, log) => {
    if (log.args.nodeId) {
      const key = log.args.nodeId;

      if (!acc[key]) {
        acc[key] = [];
      }
      const same = acc[key].some((l) => l.hash === log.transactionHash);
      const hash = same ? "↑same↑" : log.transactionHash;
      const executionTime = log.timestamp ? same ? "↑same↑" : new Date(Number(log.timestamp) * 1000).toLocaleString() : 'N/A';

      acc[key].push({
        source: log.address,
        event: log.eventName,
        // args: JSON.stringify(log.args, (key, value) => 
        //   typeof value === 'bigint'
        //     ? value.toString()
        //     : value // return everything else unchanged
        // ),// Too long in the table TODO: use a custom formatter
        executionTime,
        hash: hash,
      });
    }

    return acc;
  }, {} as Record<string, { source: string; event: string; hash: string; executionTime: string;/*args: string*/ }[]>);
}

export async function middlewareManualProcessNodeStakeCache(
  middleware: SafeSuzakuContract['L1Middleware'],
  numEpochsToProcess: number
) {
  logger.log("Processing node stake cache...");

  const hash = await middleware.safeWrite.manualProcessNodeStakeCache([numEpochsToProcess]);
  logger.log("manualProcessNodeStakeCache done, tx hash:", hash);
}

export async function middlewareLastValidationId(
  client: ExtendedClient,
  middleware: SafeSuzakuContract['L1Middleware'],
  balancer: SafeSuzakuContract['BalancerValidatorManager'],
  nodeId: NodeId,
): Promise<Hex> {
  const nodeIdHex = parseNodeID(nodeId)
  //  If already registered
  const validationId = await balancer.read.getNodeValidationID([nodeIdHex]);

  if (parseInt(validationId, 16) === 0) {
    const toBlock = await blockAtTimestamp(client, BigInt(await middleware.read.START_TIME()))
    const fromBlock = await client.getBlockNumber();
    const event = await collectEventsInRange(fromBlock, toBlock, 1, (opts) => middleware.getEvents.NodeAdded({ nodeId: nodeIdHex }, opts));
    if (event.length === 0) {
      throw new Error(`Node ID ${nodeId} never registered in the middleware`);
    } else {
      return event[0].args.validationID!;
    }
  } else {
    return validationId;
  }
}


export async function weightWatcher(
  middleware: SafeSuzakuContract['L1Middleware'],
  config: Config,
  options: {
    epochs?: number;
    loopEpochs?: number;
  }
) {

  // middlewareManualProcessNodeStakeCache configuration
  const [lastGlobalNodeStakeUpdateEpoch, currentEpoch] = await middleware.multicall(['lastGlobalNodeStakeUpdateEpoch', 'getCurrentEpoch']);
  let epochsPerCall;
  let loopCount;
  if (options.epochs || options.loopEpochs) { // Fully specified by user
    epochsPerCall = options.epochs || 1;
    loopCount = options.loopEpochs || 1;
  } else { // Automatic calculation
    epochsPerCall = currentEpoch - lastGlobalNodeStakeUpdateEpoch;
    loopCount = epochsPerCall > 50 ? Math.ceil(epochsPerCall / 50) : 1; // Limit number of epochs processed in a single call to avoid gas issues
    epochsPerCall = Math.ceil(epochsPerCall / loopCount);
  }

  logger.log(`Processing node stake cache: ${loopCount} iterations of ${epochsPerCall} epoch(s) each`);

  for (let i = 0; i < loopCount; i++) {
    logger.log(`\nIteration ${i + 1}/${loopCount}`);
    const hash = await middleware.safeWrite.manualProcessNodeStakeCache([epochsPerCall]);
    logger.log("manualProcessNodeStakeCache done, tx hash:", hash);
  }

  const processedEpochs = Math.max(epochsPerCall * loopCount, currentEpoch - lastGlobalNodeStakeUpdateEpoch);

  // process stake cache for operators
  const [collateralClasses, operators] = await middleware.multicall(['getCollateralClassIds', 'getAllOperators']);

  const processedEpochsRange: number[] = Array.from({ length: processedEpochs }, (_, i) => i + lastGlobalNodeStakeUpdateEpoch)
  for (const epoch of processedEpochsRange) {
    for (const collateralClass of collateralClasses) {
      logger.log(`Processing epoch ${epoch} for collateral class ${collateralClass}`);
      await middleware.safeWrite.calcAndCacheStakes([epoch, collateralClass]);
    }
  }

  const predictions = await predictForceUpdateImpact(config, middleware, operators as Hex[]);

  for (const prediction of predictions) {
    if (prediction.willLoseWeight) {
      logger.log(`Operator ${prediction.operator} will ${prediction.willLoseWeight ? 'lose' : 'gain'} weight`);
      logger.log(`Current total stake: ${prediction.currentTotalStake}`);
      logger.log(`Capped total stake: ${prediction.cappedTotalStake}`);
      logger.log(`Registered stake: ${prediction.registeredStake}`);
      logger.log(`Stake deficit: ${prediction.stakeDeficit}`);
      logger.log(`Active nodes count: ${prediction.activeNodesCount}`);
      await middleware.safeWrite.forceUpdateNodes([prediction.operator, 0n]);
    }
  }
}

export interface OperatorForceUpdatePrediction {
  operator: Hex;
  willLoseWeight: boolean;
  currentTotalStake: bigint;
  cappedTotalStake: bigint;
  registeredStake: bigint;
  stakeDeficit: bigint;
  activeNodesCount: number;
}

export async function predictForceUpdateImpact(
  config: Config,
  middleware: SafeSuzakuContract['L1Middleware'],
  operators: Hex[]
): Promise<OperatorForceUpdatePrediction[]> {
  if (operators.length === 0) return [];

  const [
    currentEpoch,
    weightScaleFactor,
    balancerAddress,
    primaryAssetClass
  ] = await middleware.multicall([
    'getCurrentEpoch',
    'WEIGHT_SCALE_FACTOR',
    'BALANCER',
    'PRIMARY_ASSET_CLASS'
  ]);

  const balancer = await config.contracts.BalancerValidatorManager(balancerAddress)

  const [, securityModuleMaxWeight] = await balancer.read.getSecurityModuleWeights([middleware.address])


  const maxStakeCap = BigInt(securityModuleMaxWeight) * weightScaleFactor;


  const results = await middleware.multicall(operators.flatMap(op => [
    {
      name: 'getOperatorStake',
      args: [op, currentEpoch, primaryAssetClass]
    },
    {
      name: 'getOperatorUsedStakeCached',
      args: [op]
    },
    {
      name: 'operatorLockedStake',
      args: [op]
    },
    {
      name: 'getActiveNodesForEpoch',
      args: [op, currentEpoch]
    }
  ]));

  const predictions: OperatorForceUpdatePrediction[] = [];

  for (let i = 0; i < operators.length; i++) {
    const baseIndex = i * 4;
    const operator = operators[i];

    const theoreticalStake = results[baseIndex] as bigint;
    const usedStake = results[baseIndex + 1] as bigint;
    const lockedStake = results[baseIndex + 2] as bigint;
    const activeNodes = results[baseIndex + 3] as readonly `0x${string}`[];

    let cappedStake = theoreticalStake;
    if (cappedStake > maxStakeCap) {
      cappedStake = maxStakeCap;
    }

    const registeredStake = usedStake + lockedStake;
    let stakeDeficit = 0n;
    let willLoseWeight = false;
    if (cappedStake < registeredStake) {
      stakeDeficit = registeredStake - cappedStake;

      if (stakeDeficit >= weightScaleFactor) {
        if (activeNodes.length > 0) {
          willLoseWeight = true;
        }
      }
    }

    predictions.push({
      operator,
      willLoseWeight,
      currentTotalStake: theoreticalStake,
      cappedTotalStake: cappedStake,
      registeredStake,
      stakeDeficit,
      activeNodesCount: activeNodes.length
    });
  }

  return predictions;
}
