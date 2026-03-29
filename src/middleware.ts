import { bytesToHex, Hex, hexToBytes } from 'viem';
import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import { ExtendedClient, ExtendedPublicClient, ExtendedWalletClient } from './client';
import { color } from 'console-log-colors';
import cliProgress from 'cli-progress';
import { Config } from './config';
import { encodeNodeID, NodeId, parseNodeID } from './lib/utils';
import { blockAtTimestamp, collectEventsInRange, DecodedEvent, fillEventsNodeId, GetContractEvents } from './lib/cChainUtils';
import { logger } from './lib/logger';
import { completeValidatorRemoval } from './securityModule';
import { Validator, ValidatorStatus, ValidatorStatusNames } from './balancer';
import { getCurrentValidators } from './lib/pChainUtils';
import { utils } from '@avalabs/avalanchejs';

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
  middleware: SuzakuContract['L1Middleware'],
  operator: Hex,
  epoch: number,
  collateralClass: bigint
) {
  logger.log("Reading operator stake...");

  const val = await middleware.read.getOperatorStake(
    [operator, epoch, collateralClass]
  );
  logger.log(val);
}

// getCurrentEpoch
export async function middlewareGetCurrentEpoch(
  middleware: SuzakuContract['L1Middleware']
) {
  logger.log("Reading current epoch...");
  const val = await middleware.read.getCurrentEpoch();
  logger.log(val);
}

// getEpochStartTs
export async function middlewareGetEpochStartTs(
  middleware: SuzakuContract['L1Middleware'],
  epoch: number
) {
  logger.log("Reading epoch start timestamp...");

  const val = await middleware.read.getEpochStartTs(
    [epoch]
  );
  logger.log(val);
}

// getActiveNodesForEpoch
export async function middlewareGetActiveNodesForEpoch(
  middleware: SuzakuContract['L1Middleware'],
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
  middleware: SuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Reading operator nodes length...");

  const length = await middleware.read.getOperatorNodesLength([operator]);
  logger.log(length);

}

// nodeStakeCache
export async function middlewareGetNodeStakeCache(
  middleware: SuzakuContract['L1Middleware'],
  epoch: number,
  validationId: Hex
) {
  logger.log("Reading node stake cache...");

  const val = await middleware.read.nodeStakeCache([epoch, validationId]);
  logger.log(val);

}

// operatorLockedStake
export async function middlewareGetOperatorLockedStake(
  middleware: SuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Reading operator locked stake...");

  const val = await middleware.read.operatorLockedStake([operator]);
  logger.log(val);

}

// nodePendingRemoval
export async function middlewareNodePendingRemoval(
  middleware: SuzakuContract['L1Middleware'],
  validatorId: Hex
) {
  logger.log("Reading nodePendingRemoval...");

  const val = await middleware.read.nodePendingRemoval([validatorId]);
  logger.log(val);

}

// nodePendingUpdate - Note: This function is not available in the current contract
export async function middlewareNodePendingUpdate(
  middleware: SuzakuContract['L1Middleware'],
  validatorId: Hex
) {
  logger.log("Node pending update check is not available in the current contract version");
  logger.log(`ValidatorId: ${validatorId}`);
  logger.log("This functionality may be available through other contract methods or in future versions");
}

// getOperatorUsedStakeCached
export async function middlewareGetOperatorUsedStake(
  middleware: SuzakuContract['L1Middleware'],
  operator: Hex
) {
  logger.log("Reading operator used stake cached...");

  const val = await middleware.read.getOperatorUsedStakeCached([operator]);
  logger.log(val);

}

// getAllOperators
export async function middlewareGetAllOperators(
  middleware: SuzakuContract['L1Middleware']
) {
  logger.log("Reading all operators from middleware...");

  const operators = await middleware.read.getAllOperators();
  logger.log(operators);

}

/**
 * Gets all operator nodes
 */
export async function getAllOperators(
  middleware: SuzakuContract['L1Middleware']
) {
  const operators = await middleware.read.getAllOperators();
  logger.log("All operators:", operators);
  return operators;
}

/**
 * Gets all collateral class IDs
 */
export async function getCollateralClassIds(
  middleware: SuzakuContract['L1Middleware']
) {
  const collateralClassIds = await middleware.read.getCollateralClassIds();
  logger.log("Collateral class IDs:", collateralClassIds);
  return collateralClassIds;
}

/**
 * Gets active collateral classes (primary and secondary)
 */
export async function getActiveCollateralClasses(
  middleware: SuzakuContract['L1Middleware']
) {
  const result = await middleware.read.getActiveCollateralClasses();
  logger.log("Active collateral classes - Primary:", result[0], "Secondaries:", result[1]);
  return result;
}

export async function middlewareGetNodeLogs(
  client: ExtendedClient,
  middleware: SuzakuContract['L1Middleware'],
  config: Config<ExtendedPublicClient>,
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
  middleware: SuzakuContract['L1Middleware'],
  balancer: SuzakuContract['BalancerValidatorManager'],
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


export async function weightSync(
  middleware: SafeSuzakuContract['L1Middleware'],
  config: Config<ExtendedWalletClient>,
  options: {
    epochs?: number;
    loopEpochs?: number;
  }
) {

  // middlewareManualProcessNodeStakeCache configuration
  const [lastGlobalNodeStakeUpdateEpoch, currentEpoch, updateWindow] = await middleware.multicall(['lastGlobalNodeStakeUpdateEpoch', 'getCurrentEpoch', 'UPDATE_WINDOW']);
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

  const startEpoch = await middleware.read.getEpochStartTs([currentEpoch]);
  const now = Date.now() / 1000;

  if (now < startEpoch + updateWindow) {
    throw new Error(`Not enough time has passed since the start of the current epoch. Please wait until the update window has passed(${startEpoch + updateWindow - now} seconds)`);
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
  // TODO: fix type (too complex for now)
  const predictions = await predictForceUpdateImpact(config as any, middleware, operators as Hex[]);

  for (const prediction of predictions) {
    if (prediction.willLoseWeight) {
      logger.log(`Operator ${prediction.operator} will ${prediction.willLoseWeight ? 'lose' : 'gain'} weight`);
      logger.log(`Current total stake: ${prediction.currentTotalStake}`);
      logger.log(`Capped total stake: ${prediction.cappedTotalStake}`);
      logger.log(`Registered stake: ${prediction.registeredStake}`);
      logger.log(`Stake deficit: ${prediction.stakeDeficit}`);
      logger.log(`Active nodes count: ${prediction.activeNodesCount}`);
      const hash = await middleware.safeWrite.forceUpdateNodes([prediction.operator, 0n]);
      logger.addData('forceUpdateNodes', { operator: prediction.operator, stakeDeficit: prediction.stakeDeficit.toString(), txHash: hash });
    } else {
      logger.log(`Operator ${prediction.operator} will not lose weight`);
    }
  }
  const balancerAddress = await middleware.read.BALANCER();
  const balancer = await config.contracts.BalancerValidatorManager(balancerAddress);

  let pendingRemovalNodes: { nodeID: Hex, validationID: Hex, txHash?: Hex }[] = [];

  if (operators.length > 0) {
    // Combine validators and logs to get removed from the two last epochs and check if p-chain registered nodes are still registered.
    // If there are validator already removed from the p-chain (or disabled) but still registered in the middleware, and their init removal tx is older than 2 epochs, they will !!! NOT !!! be removed from the middleware by this function!!!
    const subnetId = utils.base58check.encode(hexToBytes(await balancer.read.subnetID()));
    const validators = await getCurrentValidators(config.client, subnetId);
    const startBlock = await blockAtTimestamp(config.client, BigInt(await middleware.read.getEpochStartTs([currentEpoch - 2])));
    const logs = await middleware.getLogs({ event: "NodeRemoved", fromBlock: startBlock });
    
    const combinedNodes = Array.from(new Set([...validators.map(v => ({ nodeID: parseNodeID(v.nodeID as NodeId), validationID: bytesToHex(utils.base58check.decode(v.validationID!))  })), ...logs.map(l => ({ nodeID: l.args.nodeId!, validationID: l.args.validationID!, txHash: l.transactionHash! }))]));

    const statuses = await balancer.multicall(combinedNodes.map((v, i) => {
      return {
        name: 'getValidator',
        args: [v.validationID]
      }
    }));
    statuses.forEach((status, i) => {
      logger.log(`Node ${combinedNodes[i].nodeID} status: ${status.status}`);
    });
    // Filter out nodes that are not pending removal
    pendingRemovalNodes = combinedNodes.filter((_, i) => statuses[i].status === ValidatorStatus.PendingRemoved);
  }
  const nodesRemoved = []
  if (pendingRemovalNodes.length > 0) {
    logger.log(`Found ${pendingRemovalNodes.length} nodes pending removal`);
    const processedTxHashes: Hex[] = [];
    
    for (const pendingNode of pendingRemovalNodes) {
      if (!pendingNode.txHash) {
        pendingNode.txHash = await balancer.safeWrite.resendValidatorRemovalMessage([pendingNode.validationID]);
        logger.log(`Resent validator removal message for node ${pendingNode.nodeID}, tx hash: ${pendingNode.txHash}`);
      }
      if (processedTxHashes.includes(pendingNode.txHash)) {
        continue;
      }
      processedTxHashes.push(pendingNode.txHash);
      logger.log(`Node pending removal found: ${pendingNode.nodeID}`);
      try {
          const { nodes, txHash } = await completeValidatorRemoval(
            config.client,
            middleware,
            balancer,
            config,
            pendingNode.txHash,
            false // waitValidatorVisible
          );
          nodesRemoved.push(...nodes);
        } catch (error) {
          logger.error(error);
        }
    }
  }
  logger.log(nodesRemoved)
  logger.addData("nodesRemoved", nodesRemoved)
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
  config: Config<ExtendedClient>,
  middleware: SafeSuzakuContract['L1Middleware'],
  operators: Hex[]
): Promise<OperatorForceUpdatePrediction[]> {
  // Replicate the calculation in the smart contract
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
    // If the stake is above the max cap, cap it
    if (cappedStake > maxStakeCap) {
      cappedStake = maxStakeCap;
    }

    const registeredStake = usedStake + lockedStake;
    let stakeDeficit = 0n;
    let willLoseWeight = false;
    // If the stake is below the registered stake, check if the operator will lose weight
    if (cappedStake < registeredStake) {
      stakeDeficit = registeredStake - cappedStake;

      // If the stake deficit is behind the weight scale factor, the operator will lose weight
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

export async function middlewareInfo(
  middleware: SuzakuContract['L1Middleware']
) {
  logger.log("Fetching middleware information...");

  const results = await middleware.multicall([
    'owner',
    'BALANCER',
    'PRIMARY_ASSET_CLASS',
    'PRIMARY_ASSET',
    'WEIGHT_SCALE_FACTOR',
    'UPDATE_WINDOW',
    'START_TIME',
    'getCurrentEpoch',
    'getAllOperators',
    'getCollateralClassIds',
    'lastGlobalNodeStakeUpdateEpoch',
    'getVaultManager'
  ]);

  const info = {
    middlewareAddress: middleware.address,
    owner: results[0] as Hex,
    balancerValidatorManager: results[1] as Hex,
    primaryAssetClass: results[2]?.toString(),
    primaryAsset: results[3] as Hex,
    weightScaleFactor: results[4]?.toString(),
    updateWindow: results[5]?.toString(),
    startTime: new Date(Number(results[6]) * 1000).toLocaleString(),
    currentEpoch: results[7]?.toString(),
    operatorsCount: (results[8] as Hex[]).length,
    collateralClassIds: (results[9] as bigint[])?.map(id => id.toString()),
    lastGlobalNodeStakeUpdateEpoch: results[10]?.toString(),
    vaultManager: results[11] as Hex,
  };

  logger.logJsonTree(info);
  logger.addData('middlewareInfo', info);
  return info;
}

export async function operatorsInfo(
  middleware: SuzakuContract['L1Middleware'],
  balancer: SuzakuContract['BalancerValidatorManager'],
) {
  logger.log("Fetching operators information...");

  const results = await middleware.multicall([
    'getCurrentEpoch',
    'getAllOperators',
    'lastGlobalNodeStakeUpdateEpoch',
    'getVaultManager',
    'PRIMARY_ASSET_CLASS',
    "WEIGHT_SCALE_FACTOR"
  ]);

  const operatorsInfoFlaten = await middleware.multicall(results[1].flatMap(operator => {
    return [
      {
        name: 'getOperatorStake',
        args: [operator, results[0], results[4]]
      },
      {
        name: 'getOperatorUsedStakeCached',
        args: [operator]
      },
      {
        name: 'operatorLockedStake',
        args: [operator]
      },
      {
        name: 'getActiveNodesForEpoch',
        args: [operator, results[0]]
      }
    ]
  }))

  const operatorValidatorsValidationIDs = await balancer.multicall(operatorsInfoFlaten.filter(info => Array.isArray(info)).flatMap((activeNodes: Hex[]) => {
    return activeNodes.map((nodeId) => {
      return {
        name: 'getNodeValidationID',
        args: [nodeId.replace("000000000000000000000000", "") as Hex]
      }
    })
  }))

  const operatorValidators = await balancer.multicall(operatorValidatorsValidationIDs.map((validationID: Hex) => {
    return {
      name: 'getValidator',
      args: [validationID]
    }
  }))

  const operatorNodesStake = await middleware.multicall(operatorValidatorsValidationIDs.flatMap((validationID: Hex) => {
    return [
      {
        name: 'getNodeStake',
        args: [results[2], validationID]
      }
    ]
  }))

  const reducedOperatorValidators = operatorValidators.reduce((acc, validator, index) => {
    acc[validator.nodeID] = {...validator, validationID: operatorValidatorsValidationIDs[index], stake: Number(operatorNodesStake[index])};
    return acc;
  }, {} as Record<Hex, Validator & { validationID: Hex, stake: Number }>);

  const operatorsInfo = results[1].map((operator, index) => {
    return {
      operator,
      stake: Number(operatorsInfoFlaten[index * 4]),
      usedStake: Number(operatorsInfoFlaten[index * 4 + 1]),
      lockedStake: Number(operatorsInfoFlaten[index * 4 + 2]),
      acitveNodes: (operatorsInfoFlaten[index * 4 + 3] as Hex[]).map((nodeId, nodeIndex) => {
        nodeId = nodeId.replace("000000000000000000000000", "") as Hex;
        return {
          nodeID: encodeNodeID(reducedOperatorValidators[nodeId].nodeID),
          validationID: reducedOperatorValidators[nodeId].validationID,
          status: ValidatorStatusNames[Number(reducedOperatorValidators[nodeId].status)],
          startingWeight: Number(reducedOperatorValidators[nodeId].startingWeight),
          weight: Number(reducedOperatorValidators[nodeId].weight),
          stake: Number(reducedOperatorValidators[nodeId].weight) * Number(results[5]),
          startTime: new Date(Number(reducedOperatorValidators[nodeId].startTime) * 1000).toLocaleString()
        }
      })
    }
  })
  
  return {...operatorsInfo, currentEpoch: results[0], lastGlobalNodeStakeUpdateEpoch: results[2], needsStakeUpdate: results[2] !== results[0]};
}
