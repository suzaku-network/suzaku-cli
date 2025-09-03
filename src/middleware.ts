import { bytesToHex, hexToBytes, fromBytes, pad, parseAbiItem, decodeEventLog, Hex, Account, Abi } from 'viem';
import { SafeSuzakuContract } from './lib/viemUtils';
import { utils } from '@avalabs/avalanchejs';
import { GetRegistrationJustification, hexToUint8Array } from './lib/justification';
import { ExtendedClient, ExtendedPublicClient, ExtendedWalletClient } from './client';
import { color } from 'console-log-colors';
import cliProgress from 'cli-progress';
import { Config, pChainChainID } from './config';
import { bytesToCB58, NodeId, parseNodeID } from './lib/utils';
import { blockAtTimestamp, collectEventsInRange, DecodedEvent, fillEventsNodeId, GetContractEvents } from './lib/cChainUtils';
import { collectSignatures, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from './lib/warpUtils';
import { getValidatorsAt, registerL1Validator, setValidatorWeight, getCurrentValidators } from './lib/pChainUtils';
import { base58 } from '@scure/base';

// @ts-ignore - Wrapping in try/catch for minimal changes

export async function middlewareRegisterOperator(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  account: Account
) {
  console.log("Registering operator...");

    const hash = await middleware.safeWrite.registerOperator(
      [operator],
      { chain: null, account }
    );
    console.log("registerOperator done, tx hash:", hash);
}

export async function middlewareDisableOperator(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  account: Account
) {
  console.log("Disabling operator...");

    const hash = await middleware.safeWrite.disableOperator(
      [operator],
      { chain: null, account }
    );
    console.log("disableOperator done, tx hash:", hash);
}

export async function middlewareRemoveOperator(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  account: Account
) {
  console.log("Removing operator...");

    const hash = await middleware.safeWrite.removeOperator(
      [operator],
      { chain: null, account }
    );
    console.log("removeOperator done, tx hash:", hash);
}

// addNode
export async function middlewareAddNode(
  middleware: SafeSuzakuContract['L1Middleware'],
  nodeId: NodeId,
  blsKey: Hex,
  remainingBalanceOwner: [number, `0x${string}`[]],
  disableOwner: [number, `0x${string}`[]],
  initialStake: bigint,
  account: Account
) {
  console.log("Calling function addNode...");

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await middleware.safeWrite.addNode(
      [nodeIdHex32, blsKey, { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] }, { threshold: disableOwner[0], addresses: disableOwner[1] }, initialStake],
      { chain: null, account }
    );
    console.log("addNode executed successfully, tx hash:", hash);
}

// completeValidatorRegistration
export async function middlewareCompleteValidatorRegistration(
  client: ExtendedWalletClient,
  middleware: SafeSuzakuContract['L1Middleware'],
  balancer: SafeSuzakuContract['BalancerValidatorManager'],
  nodeId: NodeId,
  pChainTxPrivateKey: string,
  blsProofOfPossession: string,
  addNodeTxHash: Hex,
  initialBalance: number
) {
  console.log("Completing validator registration...");

    // Wait for transaction receipt to extract warp message and validation ID
    // TODO: find a better wat to get the addNode tx hash, probably by parsing the middlewareAddress events?
  const receipt = await client.waitForTransactionReceipt({ hash: addNodeTxHash });

  // Check if the node is still registered as a validator on the P-Chain
  const subnetIDHex = await balancer.read.subnetID();
  const isValidator = (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeId);
    if (isValidator) {
      console.log(color.yellow("Node is already registered as a validator on the P-Chain, skipping registerL1Validator call."));
    } else {
      // Get the unsigned warp message from the receipt
      const RegisterL1ValidatorUnsignedWarpMsg = receipt.logs[0].data ?? '';

      // Collect signatures for the warp message
      console.log("\nAggregating signatures for the RegisterL1ValidatorMessage from the Validator Manager chain...");
      const signedMessage = await collectSignatures(client.network, RegisterL1ValidatorUnsignedWarpMsg);
      console.log("Aggregated signatures for the RegisterL1ValidatorMessage from the Validator Manager chain");

      // Register validator on P-Chain
      console.log("\nRegistering validator on P-Chain...");
      const pChainTxId = await registerL1Validator({
        privateKeyHex: pChainTxPrivateKey,
        client,
        blsProofOfPossession: blsProofOfPossession,
        signedMessage,
        initialBalance: initialBalance
      });
      console.log("RegisterL1ValidatorTx executed on P-Chain:", pChainTxId);
    }

    // Get the validation ID from the receipt logs
    const validationIDHex = receipt.logs[1].topics[1] ?? '';
    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationIDHex as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, 5, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    console.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex, unsignedPChainWarpMsgHex);
    console.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    console.log("\nCalling function completeValidatorRegistration...");
    const hash = await middleware.safeWrite.completeValidatorRegistration(
      [0],
      { chain: null, account: client.account!, accessList }
    );
    console.log("completeValidatorRegistration executed successfully, tx hash:", hash);
}

// removeNode
export async function middlewareRemoveNode(
  middleware: SafeSuzakuContract['L1Middleware'],
  nodeId: NodeId,
  account: Account
) {
  console.log("Calling function removeNode...");

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await middleware.safeWrite.removeNode(
      [nodeIdHex32],
      { chain: null, account }
    );
    console.log("removeNode executed successfully, tx hash:", hash);
}

// completeValidatorRemoval
export async function middlewareCompleteValidatorRemoval(
  client: ExtendedWalletClient,
  middleware: SafeSuzakuContract['L1Middleware'],
  balancerValidatorManager: SafeSuzakuContract['BalancerValidatorManager'],
  nodeID: string,
  initializeEndValidationTxHash: Hex,
  pChainTxPrivateKey: string,
  pChainTxAddress: string,
) {
  console.log("Completing validator removal...");

    // Wait for the removeNode transaction to be confirmed to extract the unsigned L1ValidatorWeightMessage and validationID from the receipt
    const receipt = await client.waitForTransactionReceipt({ hash: initializeEndValidationTxHash })
    const validationID = receipt.logs[2].topics[1] ?? '';

    // Check if the node is still registered as a validator on the P-Chain
  const subnetIDHex = await balancerValidatorManager.read.subnetID();
  const isValidator = (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeID);
    if (!isValidator) {
      console.log(color.yellow("Node is not registered as a validator on the P-Chain, skipping setValidatorWeight call."));
    } else {
      // Get the unsigned L1ValidatorWeightMessage with weight=0 generated by the ValidatorManager from the receipt
      const unsignedL1ValidatorWeightMessage = receipt.logs[0].data ?? '';
      console.log("Initialize End Validation Warp Msg: ", unsignedL1ValidatorWeightMessage)

      // Aggregate signatures from validators
      // console.log("\nAggregating signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
      const signedL1ValidatorWeightMessage = await collectSignatures(client.network, unsignedL1ValidatorWeightMessage);
      console.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

      // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
      const pChainSetWeightTxId = await setValidatorWeight({
        privateKeyHex: pChainTxPrivateKey,
        client,
        validationID: validationID,
        message: signedL1ValidatorWeightMessage
      });
      console.log("SetL1ValidatorWeightTx executed on P-Chain:", pChainSetWeightTxId);
    }

    // get justification for original register validator tx (the unsigned warp msg emitted)
    const justification = await GetRegistrationJustification(nodeID, validationID, pChainChainID, client);

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationID as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, 5, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    // console.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex, bytesToHex(justification as Uint8Array));
    console.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    // Execute completeEndValidation transaction
    console.log("Executing completeEndValidation transaction...");
    const completeHash = await middleware.safeWrite.completeValidatorRemoval([0],
      {
        account: client.account!,
        chain: null,
        accessList
      });

    console.log("completeValidatorRemoval executed successfully, tx hash:", completeHash);
}

// initializeValidatorWeightUpdate
export async function middlewareInitStakeUpdate(
  middleware: SafeSuzakuContract['L1Middleware'],
  nodeId: NodeId,
  newStake: bigint,
  account: Account
) {
  console.log("Calling function initializeValidatorStakeUpdate...");

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await middleware.safeWrite.initializeValidatorStakeUpdate(
      [nodeIdHex32, newStake],
      { chain: null, account }
    );
    console.log("initializeValidatorStakeUpdate executed successfully, tx hash:", hash);
}

// completeStakeUpdate
export async function middlewareCompleteStakeUpdate(
  client: ExtendedWalletClient,
  middleware: SafeSuzakuContract['L1Middleware'],
  validatorStakeUpdateTxHash: Hex,
  pChainTxPrivateKey: string,
  account: Account
) {
  console.log("Completing node stake update...");

    // Wait for the removeNode transaction to be confirmed to extract the unsigned L1ValidatorWeightMessage and validationID from the receipt
    const receipt = await client.waitForTransactionReceipt({ hash: validatorStakeUpdateTxHash })
    const validationIDHex = receipt.logs[1].topics[1] ?? '';

    // Get the unsigned L1ValidatorWeightMessage with new weight generated by the ValidatorManager from the receipt
    const unsignedL1ValidatorWeightMessage = receipt.logs[0].data ?? '';
    console.log("L1ValidatorWeight Warp Msg: ", unsignedL1ValidatorWeightMessage)

    // Get the ValidatorWeightUpdate nonce from the receipt
    const nonce = receipt.logs[1].topics[2] ?? '';

    // Decode the weight from the log data using the event ABI
    const validatorWeightUpdateEventAbi = parseAbiItem(
      'event ValidatorWeightUpdate(bytes32 indexed validationID, uint64 indexed nonce, uint64 weight, bytes32 setWeightMessageID)'
    );
    const log = receipt.logs[1];
    const decoded = decodeEventLog({
      abi: [validatorWeightUpdateEventAbi],
      data: log.data,
      topics: log.topics,
    });
    const weight = decoded.args.weight;

    // Aggregate signatures from validators
    // console.log("\nAggregating signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
    const signedL1ValidatorWeightMessage = await collectSignatures(client.network, unsignedL1ValidatorWeightMessage);
    console.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

    // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
    const pChainSetWeightTxId = await setValidatorWeight({
      privateKeyHex: pChainTxPrivateKey,
      client,
      validationID: validationIDHex,
      message: signedL1ValidatorWeightMessage
    });
    console.log("SetL1ValidatorWeightTx executed on P-Chain:", pChainSetWeightTxId);

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationIDHex as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), 5, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    // console.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex, unsignedPChainWarpMsgHex);
    console.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    const hash = await middleware.safeWrite.completeStakeUpdate(
      [0],
      { chain: null, account, accessList }
    );
    console.log("completeStakeUpdate done, tx hash:", hash);
}

// calcAndCacheNodeStakeForAllOperators
export async function middlewareCalcNodeStakes(
  middleware: SafeSuzakuContract['L1Middleware'],
  account: Account
) {
  console.log("Calculating node stakes for all operators...");

    const hash = await middleware.safeWrite.calcAndCacheNodeStakeForAllOperators(
      { chain: null, account }
    );
    console.log("calcAndCacheNodeStakeForAllOperators done, tx hash:", hash);
}

// forceUpdateNodes
export async function middlewareForceUpdateNodes(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  limitStake: bigint,
  account: Account
) {
  console.log("Calling forceUpdateNodes...");

    const hash = await middleware.safeWrite.forceUpdateNodes(
      [operator, limitStake],
      { chain: null, account }
    );
    console.log("forceUpdateNodes executed successfully, tx hash:", hash);
}

// getOperatorStake
export async function middlewareGetOperatorStake(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  epoch: number,
  collateralClass: bigint
) {
  console.log("Reading operator stake...");

    const val = await middleware.read.getOperatorStake(
      [operator, epoch, collateralClass]
    );
    console.log(val);
}

// getCurrentEpoch
export async function middlewareGetCurrentEpoch(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  console.log("Reading current epoch...");
    const val = await middleware.read.getCurrentEpoch();
    console.log(val);
}

// getEpochStartTs
export async function middlewareGetEpochStartTs(
  middleware: SafeSuzakuContract['L1Middleware'],
  epoch: number
) {
  console.log("Reading epoch start timestamp...");

    const val = await middleware.read.getEpochStartTs(
      [epoch]
    );
    console.log(val);
}

// getActiveNodesForEpoch
export async function middlewareGetActiveNodesForEpoch(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex,
  epoch: number
) {
  console.log("Reading active nodes for epoch...");

    const nodeIds = await middleware.read.getActiveNodesForEpoch(
      [operator, epoch]
    ) as Hex[];
    console.log(nodeIds.map((b: Hex) => b));
}

// getOperatorNodesLength
export async function middlewareGetOperatorNodesLength(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  console.log("Reading operator nodes length...");

    const length = await middleware.read.getOperatorNodesLength([operator]);
    console.log(length);

}

// nodeStakeCache
export async function middlewareGetNodeStakeCache(
  middleware: SafeSuzakuContract['L1Middleware'],
  epoch: number,
  validationId: Hex
) {
  console.log("Reading node stake cache...");

  const val = await middleware.read.nodeStakeCache([epoch, validationId]);
    console.log(val);

}

// operatorLockedStake
export async function middlewareGetOperatorLockedStake(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  console.log("Reading operator locked stake...");

    const val = await middleware.read.operatorLockedStake([operator]);
    console.log(val);

}

// nodePendingRemoval
export async function middlewareNodePendingRemoval(
  middleware: SafeSuzakuContract['L1Middleware'],
  validatorId: Hex
) {
  console.log("Reading nodePendingRemoval...");

    const val = await middleware.read.nodePendingRemoval([validatorId]);
    console.log(val);

}

// nodePendingUpdate - Note: This function is not available in the current contract
export async function middlewareNodePendingUpdate(
  middleware: SafeSuzakuContract['L1Middleware'],
  validatorId: Hex
) {
  console.log("Node pending update check is not available in the current contract version");
  console.log(`ValidatorId: ${validatorId}`);
  console.log("This functionality may be available through other contract methods or in future versions");
}

// getOperatorUsedStakeCached
export async function middlewareGetOperatorUsedStake(
  middleware: SafeSuzakuContract['L1Middleware'],
  operator: Hex
) {
  console.log("Reading operator used stake cached...");

    const val = await middleware.read.getOperatorUsedStakeCached([operator]);
    console.log(val);

}

// getAllOperators
export async function middlewareGetAllOperators(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  console.log("Reading all operators from middleware...");

    const operators = await middleware.read.getAllOperators();
    console.log(operators);

}

/**
 * Gets all operator nodes
 */
export async function getAllOperators(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  const operators = await middleware.read.getAllOperators();
  console.log("All operators:", operators);
  return operators;
}

/**
 * Gets all collateral class IDs
 */
export async function getCollateralClassIds(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  const collateralClassIds = await middleware.read.getCollateralClassIds();
  console.log("Collateral class IDs:", collateralClassIds);
  return collateralClassIds;
}

/**
 * Gets active collateral classes (primary and secondary)
 */
export async function getActiveCollateralClasses(
  middleware: SafeSuzakuContract['L1Middleware']
) {
  const result = await middleware.read.getActiveCollateralClasses();
  console.log("Active collateral classes - Primary:", result[0], "Secondaries:", result[1]);
  return result;
}

export async function middlewareGetNodeLogs(
  client: ExtendedPublicClient,
  middleware: SafeSuzakuContract['L1Middleware'],
  config: Config,
  nodeId?: NodeId,
  snowscanApiKey?: string,
) {
  console.log("Reading logs from middleware and balancer...");

  const to = await client.getBlockNumber();

  const from = await blockAtTimestamp(client, BigInt(await middleware.read.START_TIME()));

  const bar = snowscanApiKey ? undefined : new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar && bar.start(0, 0);

  let logsProm = []

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

  const l1ValidatorManagerAddressProm = middleware.read.BALANCER();
  // 
  const balancerAddressProm = middleware.read.balancerValidatorManager();

  const [l1ValidatorManagerAddress, balancerAddress] = await Promise.all([l1ValidatorManagerAddressProm, balancerAddressProm]);

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
  const balancer = config.contracts.BalancerValidatorManager(balancerAddress as Hex);

  const allLogs = await Promise.all(logsProm);
  let logs = allLogs.flat().sort((a, b) => Number(a.blockNumber - b.blockNumber));
  logs = await fillEventsNodeId(balancer, logs);

  // Human readable addresses and structured logs
  const logOfInterest = groupEventsByNodeId(logs.map((log: DecodedEvent) => {
    log.address = log.address.toLowerCase() === middleware.address.toLowerCase() ? "Middleware" : "ValidatorManager";
    return log;
  }))

  if (nodeId != undefined) {
    const nodeIdHex32 = parseNodeID(nodeId);
    console.log('\t\t\t' + color.blue(nodeId));
    console.table(logOfInterest[nodeIdHex32] || []);
  } else {
    for (const [key, value] of Object.entries(logOfInterest)) {
      let hexArray = hexToUint8Array(key as Hex)
      hexArray = hexArray.length === 32 ? hexArray.slice(12) : hexArray;// Remove the first 12 bytes if it's a full bytes32
      const nodeId = `NodeID-${utils.base58check.encode(hexArray)}`;
      console.log('\t\t\t\t\t\t' + color.blue(nodeId));
      console.table(value);
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

      log.blockNumber
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
  numEpochsToProcess: number,
  account: Account
) {
  console.log("Processing node stake cache...");

    const hash = await middleware.safeWrite.manualProcessNodeStakeCache(
      [numEpochsToProcess],
      { chain: null, account }
    );
    console.log("manualProcessNodeStakeCache done, tx hash:", hash);
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
