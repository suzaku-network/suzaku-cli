import { bytesToHex, hexToBytes, fromBytes, pad, parseAbiItem, decodeEventLog, Hex, Abi } from 'viem';
import { ExtendedWalletClient, ExtendedPublicClient } from './client';
import { collectSignatures, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from './lib/warpUtils';
import { registerL1Validator, setValidatorWeight, getValidatorsAt } from './lib/pChainUtils';
import { DecodedEvent, fillEventsNodeId, GetContractEvents } from './lib/cChainUtils';
import { GetRegistrationJustification, parseUint32, hexToUint8Array } from './lib/justification';
import { utils } from '@avalabs/avalanchejs';
import { parseNodeID, NodeId } from './lib/utils';
import { color } from 'console-log-colors';
import cliProgress from 'cli-progress';
import { Config } from './config';
// @ts-ignore - Wrapping in try/catch for minimal changes

export async function middlewareRegisterOperator(
  client: ExtendedWalletClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex
) {
  console.log("Registering operator...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'registerOperator',
      args: [operator],
      chain: null,
      account: client.account,
    });
    console.log("registerOperator done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function middlewareDisableOperator(
  client: ExtendedWalletClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex
) {
  console.log("Disabling operator...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'disableOperator',
      args: [operator],
      chain: null,
      account: client.account,
    });
    console.log("disableOperator done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

export async function middlewareRemoveOperator(
  client: ExtendedWalletClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex
) {
  console.log("Removing operator...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'removeOperator',
      args: [operator],
      chain: null,
      account: client.account,
    });
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
  client: ExtendedWalletClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  nodeId: NodeId,
  blsKey: Hex,
  registrationExpiry: bigint,
  remainingBalanceOwner: [bigint, Hex[]],
  disableOwner: [bigint, Hex[]],
  initialStake: bigint
) {
  console.log("Calling function addNode...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'addNode',
      args: [
        nodeIdHex32,
        blsKey,
        registrationExpiry,
        remainingBalanceOwner,
        disableOwner,
        initialStake,
      ],
      chain: null,
      account: client.account,
    });
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
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex,
  nodeId: NodeId,
  pChainTxPrivateKey: string,
  pChainTxAddress: string,
  blsProofOfPossession: string,
  addNodeTxHash: Hex,
  initialBalance: number
) {
  console.log("Completing validator registration...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

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
      pChainAddress: pChainTxAddress,
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
    await client.simulateContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeValidatorRegistration',
      args: [operator, nodeIdHex32, 0],
      account: client.account,
      gas: BigInt(5000000),
      accessList
    });

    console.log("\nCalling function completeValidatorRegistration...");
    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeValidatorRegistration',
      args: [operator, nodeIdHex32, 0],
      chain: null,
      account: client.account,
      accessList
    });
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
  client: ExtendedWalletClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  nodeId: NodeId
) {
  console.log("Calling function removeNode...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'removeNode',
      args: [nodeIdHex32],
      chain: null,
      account: client.account,
    });
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
  middlewareAddress: Hex,
  abis: Config['abis'],
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
    const L1Id = await middlewareGetL1Id(client, middlewareAddress, abis);
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
        pChainAddress: pChainTxAddress,
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
    const { request: completeRequest } = await client.simulateContract({
      address: middlewareAddress,
      abi: abis.MiddlewareService,
      functionName: 'completeValidatorRemoval',
      args: [0],
      account: client.account,
      gas: BigInt(5000000),
      accessList
    });

    // Execute completeEndValidation transaction
    console.log("Executing completeEndValidation transaction...");
    const completeHash = await client.writeContract({
      address: middlewareAddress,
      abi: abis.MiddlewareService,
      functionName: 'completeValidatorRemoval',
      args: [0],
      account: client.account,
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
  client: ExtendedWalletClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  nodeId: NodeId,
  newStake: bigint
) {
  console.log("Calling function initializeValidatorStakeUpdate...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId)

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'initializeValidatorStakeUpdate',
      args: [nodeIdHex32, newStake],
      chain: null,
      account: client.account,
    });
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
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  nodeId: NodeId,
  validatorStakeUpdateTxHash: Hex,
  pChainTxPrivateKey: string,
  pChainTxAddress: string,
) {
  console.log("Completing node stake update...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

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
      pChainAddress: pChainTxAddress,
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

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeStakeUpdate',
      args: [nodeIdHex32, 0],
      chain: null,
      account: client.account,
      accessList
    });
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
  client: ExtendedWalletClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi
) {
  console.log("Calculating node stakes for all operators...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'calcAndCacheNodeStakeForAllOperators',
      args: [],
      chain: null,
      account: client.account,
    });
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
  client: ExtendedWalletClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex,
  limitStake: bigint
) {
  console.log("Calling forceUpdateNodes...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'forceUpdateNodes',
      args: [operator, limitStake],
      chain: null,
      account: client.account,
    });
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
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex,
  epoch: bigint,
  assetClass: bigint
) {
  console.log("Reading operator stake...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getOperatorStake',
      args: [operator, epoch, assetClass],
    });
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
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi
) {
  console.log("Reading current epoch...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getCurrentEpoch',
      args: [],
    });
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
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  epoch: bigint
) {
  console.log("Reading epoch start timestamp...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getEpochStartTs',
      args: [epoch],
    });
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
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex,
  epoch: bigint
) {
  console.log("Reading active nodes for epoch...");

  try {
    const nodeIds = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getActiveNodesForEpoch',
      args: [operator, epoch],
    }) as Hex[];
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
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex
) {
  console.log("Reading operator nodes length...");

  try {
    const length = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getOperatorNodesLength',
      args: [operator],
    });
    console.log(length);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// nodeStakeCache
export async function middlewareGetNodeStakeCache(
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  epoch: bigint,
  validatorId: Hex
) {
  console.log("Reading node stake cache...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'nodeStakeCache',
      args: [epoch, validatorId],
    });
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// operatorLockedStake
export async function middlewareGetOperatorLockedStake(
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex
) {
  console.log("Reading operator locked stake...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'operatorLockedStake',
      args: [operator],
    });
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// nodePendingRemoval
export async function middlewareNodePendingRemoval(
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  validatorId: Hex
) {
  console.log("Reading nodePendingRemoval...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'nodePendingRemoval',
      args: [validatorId],
    });
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// nodePendingUpdate
export async function middlewareNodePendingUpdate(
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  validatorId: Hex
) {
  console.log("Reading nodePendingUpdate...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'nodePendingUpdate',
      args: [validatorId],
    });
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// getOperatorUsedStakeCached
export async function middlewareGetOperatorUsedStake(
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi,
  operator: Hex
) {
  console.log("Reading operator used stake cached...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getOperatorUsedStakeCached',
      args: [operator],
    });
    console.log(val);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// getAllOperators
export async function middlewareGetAllOperators(
  client: ExtendedPublicClient,
  middlewareAddress: Hex,
  middlewareAbi: Abi
) {
  console.log("Reading all operators from middleware...");

  try {
    const operators = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getAllOperators',
      args: [],
    });
    console.log(operators);
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
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

  const l1ValidatorManagerAddressProm = client.readContract({
    address: middlewareAddress,
    abi: config.abis.MiddlewareService,
    functionName: 'L1_VALIDATOR_MANAGER',
    args: [],
  })
  // 
  const balancerAddressProm = client.readContract({
    address: middlewareAddress,
    abi: config.abis.MiddlewareService,
    functionName: 'balancerValidatorManager',
    args: [],
  })

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
  const allLogs = await Promise.all(logsProm);
  let logs = allLogs.flat().sort((a, b) => Number(a.blockNumber - b.blockNumber));
  logs = await fillEventsNodeId(client, completeEventsContractAddress, config.abis.BalancerValidatorManager, logs);
  
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
  client: ExtendedPublicClient | ExtendedWalletClient,
  middlewareAddress: Hex,
  abis: Config['abis']
): Promise<string> {
  console.log("Reading L1 ID from Validator Manager...");
  let L1Id
  try {
    const l1ValidatorManagerAddress = await client.readContract({
      address: middlewareAddress,
      abi: abis.MiddlewareService,
      functionName: 'L1_VALIDATOR_MANAGER',
      args: [],
    })

    const VALIDATOR_MANAGER_STORAGE_LOCATION = await client.readContract({
      address: l1ValidatorManagerAddress as Hex,
      abi: abis.BalancerValidatorManager,
      functionName: 'VALIDATOR_MANAGER_STORAGE_LOCATION',
      args: [],
    })

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
