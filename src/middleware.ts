import { bytesToHex, hexToBytes, fromBytes, pad, parseAbiItem, decodeEventLog } from 'viem';
import { TContract } from './config';
import type { Hex, Account, Abi } from 'viem';
import { utils } from '@avalabs/avalanchejs';
import { GetRegistrationJustification, hexToUint8Array } from './lib/justification';
import { ExtendedPublicClient, ExtendedWalletClient } from './client';
import { color } from 'console-log-colors';
import cliProgress from 'cli-progress';
import { Config } from './config';
import { NodeId, parseNodeID } from './lib/utils';
import { DecodedEvent, fillEventsNodeId, GetContractEvents } from './lib/cChainUtils';
import { collectSignatures, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from './lib/warpUtils';
import { getValidatorsAt, registerL1Validator, setValidatorWeight } from './lib/pChainUtils';

// @ts-ignore - Wrapping in try/catch for minimal changes

export async function middlewareRegisterOperator(
  middleware: TContract['MiddlewareService'],
  operator: Hex,
  account: Account | undefined
) {
  console.log("Registering operator...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await middleware.write.registerOperator(
      [operator],
      { chain: null, account }
    );
    console.log("registerOperator done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function middlewareDisableOperator(
  middleware: TContract['MiddlewareService'],
  operator: Hex,
  account: Account | undefined
) {
  console.log("Disabling operator...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await middleware.write.disableOperator(
      [operator],
      { chain: null, account }
    );
    console.log("disableOperator done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function middlewareRemoveOperator(
  middleware: TContract['MiddlewareService'],
  operator: Hex,
  account: Account | undefined
) {
  console.log("Removing operator...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await middleware.write.removeOperator(
      [operator],
      { chain: null, account }
    );
    console.log("removeOperator done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// addNode
export async function middlewareAddNode(
  middleware: TContract['MiddlewareService'],
  nodeId: NodeId,
  blsKey: Hex,
  registrationExpiry: bigint,
  remainingBalanceOwner: [number, `0x${string}`[]],
  disableOwner: [number, `0x${string}`[]],
  initialStake: bigint,
  account: Account | undefined
) {
  console.log("Calling function addNode...");

  try {
    if (!account) throw new Error('Client account is required');

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await middleware.write.addNode(
      [nodeIdHex32, blsKey, registrationExpiry, { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] }, { threshold: disableOwner[0], addresses: disableOwner [1]}, initialStake],
      { chain: null, account }
    );
    console.log("addNode executed successfully, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// completeValidatorRegistration
export async function middlewareCompleteValidatorRegistration(
  client: ExtendedWalletClient,
  middleware: TContract['MiddlewareService'],
  operator: Hex,
  nodeId: NodeId,
  pChainTxPrivateKey: string,
  blsProofOfPossession: string,
  addNodeTxHash: Hex,
  initialBalance: number
) {
  console.log("Completing validator registration...");

  try {
    if (!client.account) throw new Error('Client account is required');

    // Wait for transaction receipt to extract warp message and validation ID
    // TODO: find a better wat to get the addNode tx hash, probably by parsing the middlewareAddress events?
    const receipt = await client.waitForTransactionReceipt({ hash: addNodeTxHash });

    // Get the unsigned warp message and validation ID from the receipt
    const RegisterL1ValidatorUnsignedWarpMsg = receipt.logs[0].data ?? '';
    const validationIDHex = receipt.logs[1].topics[1] ?? '';

    // Collect signatures for the warp message
    console.log("\nAggregating signatures for the RegisterL1ValidatorMessage from the Validator Manager chain...");
    const signedMessage = await collectSignatures(RegisterL1ValidatorUnsignedWarpMsg);
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

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationIDHex as Hex);
    const pChainChainID = '11111111111111111111111111111111LpoYY';
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, 5, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    console.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(unsignedPChainWarpMsgHex, unsignedPChainWarpMsgHex);
    console.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    // Simulate completeValidatorRegistration transaction
    await middleware.simulate.completeValidatorRegistration([operator, nodeIdHex32, 0],
      {
        account: client.account? client.account : null,
        gas: BigInt(5000000),
        accessList
    });

    console.log("\nCalling function completeValidatorRegistration...");
    const hash = await middleware.write.completeValidatorRegistration(
      [operator, nodeIdHex32, 0],
      { chain: null, account: client.account, accessList }
    );
    console.log("completeValidatorRegistration executed successfully, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// removeNode
export async function middlewareRemoveNode(
  middleware: TContract['MiddlewareService'],
  nodeId: NodeId,
  account: Account | undefined
) {
  console.log("Calling function removeNode...");

  try {
    if (!account) throw new Error('Client account is required');

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await middleware.write.removeNode(
      [nodeIdHex32],
      { chain: null, account }
    );
    console.log("removeNode executed successfully, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// completeValidatorRemoval
export async function middlewareCompleteValidatorRemoval(
  client: ExtendedWalletClient,
  middleware: TContract['MiddlewareService'],
  balancerValidatorManager: TContract['BalancerValidatorManager'],
  nodeID: string,
  initializeEndValidationTxHash: Hex,
  pChainTxPrivateKey: string,
  pChainTxAddress: string,
) {
  console.log("Completing validator removal...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Wait for the removeNode transaction to be confirmed to extract the unsigned L1ValidatorWeightMessage and validationID from the receipt
    const receipt = await client.waitForTransactionReceipt({ hash: initializeEndValidationTxHash })
    const validationID = receipt.logs[2].topics[1] ?? '';

    // Check if the node is still registered as a validator on the P-Chain
    const L1Id = await middlewareGetL1Id(middleware, balancerValidatorManager, client);
    const validators = await getValidatorsAt(L1Id)
    const isValidator = Object.keys(validators).some((key) => key === nodeID);
    if (!isValidator) {
      console.log(color.yellow("Node is not registered as a validator on the P-Chain, skipping setValidatorWeight call."));
    } else {
      // Get the unsigned L1ValidatorWeightMessage with weight=0 generated by the ValidatorManager from the receipt
      const unsignedL1ValidatorWeightMessage = receipt.logs[0].data ?? '';
      console.log("Initialize End Validation Warp Msg: ", unsignedL1ValidatorWeightMessage)

      // Aggregate signatures from validators
      // console.log("\nAggregating signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
      const signedL1ValidatorWeightMessage = await collectSignatures(unsignedL1ValidatorWeightMessage);
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
      const justification = await GetRegistrationJustification(nodeID, validationID, '11111111111111111111111111111111LpoYY', client);

      // Pack and sign the P-Chain warp message
      const validationIDBytes = hexToBytes(validationID as Hex);
      const pChainChainID = '11111111111111111111111111111111LpoYY';
      const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, 5, pChainChainID);
      const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

      // Aggregate signatures from validators
      // console.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
      const signedPChainMessage = await collectSignatures(unsignedPChainWarpMsgHex, bytesToHex(justification as Uint8Array));
      console.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

      // Convert the signed warp message to bytes and pack into access list
      const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
      const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    // Simulate completeEndValidation transaction
    // console.log("\nSimulating completeEndValidation transaction...");
    const { request: completeRequest } = await middleware.simulate.completeValidatorRemoval([0],
      {
        account: client.account? client.account : null,
        gas: BigInt(5000000),
        accessList
    });

    // Execute completeEndValidation transaction
    console.log("Executing completeEndValidation transaction...");
    const completeHash = await middleware.write.completeValidatorRemoval([0],
      {account: client.account,
      chain: null,
      accessList
    });

      console.log("completeValidatorRemoval executed successfully, tx hash:", completeHash);
    } catch (error) {
      console.error("Transaction failed:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
      }
    }
  }

// initializeValidatorWeightUpdate
export async function middlewareInitStakeUpdate(
  middleware: TContract['MiddlewareService'],
  nodeId: NodeId,
  newStake: bigint,
  account: Account | undefined
) {
  console.log("Calling function initializeValidatorStakeUpdate...");

  try {
    if (!account) throw new Error('Client account is required');

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await middleware.write.initializeValidatorStakeUpdate(
      [nodeIdHex32, newStake],
      { chain: null, account }
    );
    console.log("initializeValidatorStakeUpdate executed successfully, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// completeStakeUpdate
export async function middlewareCompleteStakeUpdate(
  client: ExtendedWalletClient,
  middleware: TContract['MiddlewareService'],
  nodeId: NodeId,
  validatorStakeUpdateTxHash: Hex,
  pChainTxPrivateKey: string,
  pChainTxAddress: string,
  account: Account | undefined
) {
  console.log("Completing node stake update...");

  try {
    if (!account) throw new Error('Client account is required');

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
    const signedL1ValidatorWeightMessage = await collectSignatures(unsignedL1ValidatorWeightMessage);
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
    const pChainChainID = '11111111111111111111111111111111LpoYY';
    const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), 5, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    // console.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(unsignedPChainWarpMsgHex, unsignedPChainWarpMsgHex);
    console.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await middleware.write.completeStakeUpdate(
      [nodeIdHex32, 0],
      { chain: null, account, accessList }
    );
    console.log("completeStakeUpdate done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// calcAndCacheNodeStakeForAllOperators
export async function middlewareCalcNodeStakes(
  middleware: TContract['MiddlewareService'],
  account: Account | undefined
) {
  console.log("Calculating node stakes for all operators...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await middleware.write.calcAndCacheNodeStakeForAllOperators(
      { chain: null, account }
    );
    console.log("calcAndCacheNodeStakeForAllOperators done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// forceUpdateNodes
export async function middlewareForceUpdateNodes(
  middleware: TContract['MiddlewareService'],
  operator: Hex,
  limitStake: bigint,
  account: Account | undefined
) {
  console.log("Calling forceUpdateNodes...");

  try {
    if (!account) throw new Error('Client account is required');

    const hash = await middleware.write.forceUpdateNodes(
      [operator, limitStake],
      { chain: null, account }
    );
    console.log("forceUpdateNodes executed successfully, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// getOperatorStake
export async function middlewareGetOperatorStake(
  middleware: TContract['MiddlewareService'],
  operator: Hex,
  epoch: number,
  assetClass: bigint
) {
  console.log("Reading operator stake...");

  try {
    const val = await middleware.read.getOperatorStake(
      [operator, epoch, assetClass]
    );
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// getCurrentEpoch
export async function middlewareGetCurrentEpoch(
  middleware: TContract['MiddlewareService']
) {
  console.log("Reading current epoch...");

  try {
    const val = await middleware.read.getCurrentEpoch();
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// getEpochStartTs
export async function middlewareGetEpochStartTs(
  middleware: TContract['MiddlewareService'],
  epoch: number
) {
  console.log("Reading epoch start timestamp...");

  try {
    const val = await middleware.read.getEpochStartTs(
      [epoch]
    );
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// getActiveNodesForEpoch
export async function middlewareGetActiveNodesForEpoch(
  middleware: TContract['MiddlewareService'],
  operator: Hex,
  epoch: number
) {
  console.log("Reading active nodes for epoch...");

  try {
    const nodeIds = await middleware.read.getActiveNodesForEpoch(
      [operator, epoch]
    ) as Hex[];
    console.log(nodeIds.map((b: Hex) => b));
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// getOperatorNodesLength
export async function middlewareGetOperatorNodesLength(
  middleware: TContract['MiddlewareService'],
  operator: Hex
) {
  console.log("Reading operator nodes length...");
  try {
    const length = await middleware.read.getOperatorNodesLength([operator]);
    console.log(length);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) console.error("Error message:", error.message);
  }
}

// nodeStakeCache
export async function middlewareGetNodeStakeCache(
  middleware: TContract['MiddlewareService'],
  epoch: number,
  validatorId: Hex
) {
  console.log("Reading node stake cache...");
  try {
    const val = await middleware.read.nodeStakeCache([epoch, validatorId]);
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) console.error("Error message:", error.message);
  }
}

// operatorLockedStake
export async function middlewareGetOperatorLockedStake(
  middleware: TContract['MiddlewareService'],
  operator: Hex
) {
  console.log("Reading operator locked stake...");
  try {
    const val = await middleware.read.operatorLockedStake([operator]);
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) console.error("Error message:", error.message);
  }
}

// nodePendingRemoval
export async function middlewareNodePendingRemoval(
  middleware: TContract['MiddlewareService'],
  validatorId: Hex
) {
  console.log("Reading nodePendingRemoval...");
  try {
    const val = await middleware.read.nodePendingRemoval([validatorId]);
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) console.error("Error message:", error.message);
  }
}

// nodePendingUpdate
export async function middlewareNodePendingUpdate(
  middleware: TContract['MiddlewareService'],
  validatorId: Hex
) {
  console.log("Reading nodePendingUpdate...");
  try {
    const val = await middleware.read.nodePendingUpdate([validatorId]);
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) console.error("Error message:", error.message);
  }
}

// getOperatorUsedStakeCached
export async function middlewareGetOperatorUsedStake(
  middleware: TContract['MiddlewareService'],
  operator: Hex
) {
  console.log("Reading operator used stake cached...");
  try {
    const val = await middleware.read.getOperatorUsedStakeCached([operator]);
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) console.error("Error message:", error.message);
  }
}

// getAllOperators
export async function middlewareGetAllOperators(
  middleware: TContract['MiddlewareService']
) {
  console.log("Reading all operators from middleware...");
  try {
    const operators = await middleware.read.getAllOperators();
    console.log(operators);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) console.error("Error message:", error.message);
  }
}

export async function middlewareGetNodeLogs(
  client: ExtendedPublicClient,
  middlewareTxHash: Hex,
  config: Config,
  nodeId?: NodeId,
  snowscanApiKey?: string,
) {
  console.log("Reading logs from middleware and balancer...");
  
  const receipt = await client.getTransactionReceipt({ hash: middlewareTxHash });
  const middlewareAddress = receipt.to ? receipt.to as Hex : receipt.contractAddress as Hex;
  const from = receipt.blockNumber
  const to = await client.getBlockNumber();

  const middleware = config.contracts.MiddlewareService(middlewareAddress);

  const bar = snowscanApiKey ? undefined : new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  bar && bar.start(0, 0);

  let logsProm = []
  
  logsProm.push(GetContractEvents(
    client,
    middlewareAddress,
    Number(from),
    Number(to),
    config.abis.MiddlewareService,
    ["NodeAdded", "NodeRemoved", "NodeStakeUpdated"],
    snowscanApiKey,
    snowscanApiKey ? false : true,
    bar
  ));

  const l1ValidatorManagerAddressProm = middleware.read.L1_VALIDATOR_MANAGER();
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
    log.address = log.address.toLowerCase() === middlewareAddress.toLowerCase() ? "Middleware" : "ValidatorManager";
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

export async function middlewareGetL1Id(
  middleware: TContract['MiddlewareService'],
  balancerValidatorManager: TContract['BalancerValidatorManager'],
  client: ExtendedWalletClient,
): Promise<string> {
  console.log("Reading L1 ID from Validator Manager...");
  let L1Id
  try {
    const l1ValidatorManagerAddress = await middleware.read.L1_VALIDATOR_MANAGER();

    const VALIDATOR_MANAGER_STORAGE_LOCATION = await balancerValidatorManager.read.VALIDATOR_MANAGER_STORAGE_LOCATION();

    L1Id = await client.getStorageAt({
      address: l1ValidatorManagerAddress as Hex,
      slot: VALIDATOR_MANAGER_STORAGE_LOCATION as Hex
    })
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    throw error; // Re-throw the error to handle it in the calling function
  }

  return utils.base58check.encode(hexToUint8Array(L1Id as Hex))
}
