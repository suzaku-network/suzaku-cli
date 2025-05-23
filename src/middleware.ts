import { WalletClient, PublicClient, bytesToHex, hexToBytes, fromBytes, pad, parseAbiItem, decodeEventLog } from 'viem';
import { ExtendedWalletClient } from './client';
import { collectSignatures, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from './lib/warpUtils';
import { registerL1Validator, setValidatorWeight } from './lib/pChainUtils';
import { parseNodeID } from './lib/utils';
import { GetRegistrationJustification } from './lib/justification';
import { utils } from '@avalabs/avalanchejs';
// @ts-ignore - Wrapping in try/catch for minimal changes

export async function middlewareRegisterOperator(
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`
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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`
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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`
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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  nodeId: string,
  blsKey: `0x${string}`,
  registrationExpiry: bigint,
  remainingBalanceOwner: [bigint, `0x${string}`[]],
  disableOwner: [bigint, `0x${string}`[]],
  initialStake: bigint
) {
  console.log("Calling function addNode...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Parse NodeID to bytes32 format
    const nodeIDWithoutPrefix = nodeId.replace("NodeID-", "");
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix);
    const nodeIDHex = fromBytes(decodedID, 'hex');
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8); // Remove checksum
    // Pad end (right) to 32 bytes
    const nodeIdHex32 = pad(nodeIDHexTrimmed as `0x${string}`, { size: 32 });

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
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`,
  nodeId: string,
  pChainTxPrivateKey: string,
  pChainTxAddress: string,
  blsProofOfPossession: string,
  addNodeTxHash: `0x${string}`,
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
    const validationIDBytes = hexToBytes(validationIDHex as `0x${string}`);
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
    const nodeIDWithoutPrefix = nodeId.replace("NodeID-", "");
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix);
    const nodeIDHex = fromBytes(decodedID, 'hex');
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8); // Remove checksum
    // Pad end (right) to 32 bytes
    const nodeIdHex32 = pad(nodeIDHexTrimmed as `0x${string}`, { size: 32 });

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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  nodeId: string
) {
  console.log("Calling function removeNode...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Parse NodeID to bytes32 format
    const nodeIDWithoutPrefix = nodeId.replace("NodeID-", "");
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix);
    const nodeIDHex = fromBytes(decodedID, 'hex');
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8); // Remove checksum
    // Pad end (right) to 32 bytes
    const nodeIdHex32 = pad(nodeIDHexTrimmed as `0x${string}`, { size: 32 });

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
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  nodeID: string,
  initializeEndValidationTxHash: `0x${string}`,
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

    // get justification for original register validator tx (the unsigned warp msg emitted)
    const justification = await GetRegistrationJustification(nodeID, validationID, '11111111111111111111111111111111LpoYY', client);

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationID as `0x${string}`);
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
      abi: middlewareAbi,
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
      abi: middlewareAbi,
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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  nodeId: `0x${string}`,
  newStake: bigint
) {
  console.log("Calling function initializeValidatorStakeUpdate...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Parse NodeID to bytes32 format
    const nodeIDWithoutPrefix = nodeId.replace("NodeID-", "");
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix);
    const nodeIDHex = fromBytes(decodedID, 'hex');
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8); // Remove checksum
    // Pad end (right) to 32 bytes
    const nodeIdHex32 = pad(nodeIDHexTrimmed as `0x${string}`, { size: 32 });

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
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  nodeId: `0x${string}`,
  validatorStakeUpdateTxHash: `0x${string}`,
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
    const validationIDBytes = hexToBytes(validationIDHex as `0x${string}`);
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
    const nodeIDWithoutPrefix = nodeId.replace("NodeID-", "");
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix);
    const nodeIDHex = fromBytes(decodedID, 'hex');
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8); // Remove checksum
    // Pad end (right) to 32 bytes
    const nodeIdHex32 = pad(nodeIDHexTrimmed as `0x${string}`, { size: 32 });

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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any
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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`,
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`,
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`,
  epoch: bigint
) {
  console.log("Reading active nodes for epoch...");

  try {
    const nodeIds = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getActiveNodesForEpoch',
      args: [operator, epoch],
    }) as `0x${string}`[];
    console.log(nodeIds.map((b: `0x${string}`) => b));
  } catch (error) {
    console.error("Read contract failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// getOperatorNodesLength
export async function middlewareGetOperatorNodesLength(
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  epoch: bigint,
  validatorId: `0x${string}`
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  validatorId: `0x${string}`
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  validatorId: `0x${string}`
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`
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
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any
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
