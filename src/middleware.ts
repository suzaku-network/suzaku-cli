import { WalletClient, PublicClient, bytesToHex, hexToBytes, fromBytes, pad } from 'viem';
import { ExtendedWalletClient } from './client';
import { collectSignatures, packL1ValidatorRegistration, packWarpIntoAccessList } from './lib/warpUtils';
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
  pchainOwner: [bigint, `0x${string}`[]],
  rewardOwner: [bigint, `0x${string}`[]],
  initialStake: bigint
) {
  console.log("Adding node...");

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
        pchainOwner,
        rewardOwner,
        initialStake,
      ],
      chain: null,
      account: client.account,
    });
    console.log("addNode done, tx hash:", hash);
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
  messageIndex: bigint,
  pChainTxPrivateKey: string,
  pChainTxAddress: string,
  blsProofOfPossession: string,
  addNodeTxHash: `0x${string}`
) {
  console.log("Completing validator registration...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Wait for transaction receipt to extract warp message and validation ID
    // TODO: find a better wat to get the addNode tx hash, probably by parsing the middlewareAddress events?
    // NOTE: With PoAValidatorManager, the Tx hash here is the initializeValidatorRegistration, not sure if addNode tx works here or if we need to use the underlying's initializeValidatorRegistration tx (the one that emits a wrap message event log 0x0200000000000000000000000000000000000005)
    const receipt = await client.waitForTransactionReceipt({ hash: addNodeTxHash });

    // Get the unsigned warp message and validation ID from the receipt
    const RegisterL1ValidatorUnsignedWarpMsg = receipt.logs[0].data ?? '';
    const validationIDHex = receipt.logs[1].topics[1] ?? '';

    // Collect signatures for the warp message
    console.log("\nAggregating signatures for the RegisterL1ValidatorMessage from the Validator Manager chain...");
    const signedMessage = await collectSignatures(RegisterL1ValidatorUnsignedWarpMsg);

    // Register validator on P-Chain
    const pChainTxId = await registerL1Validator({
      privateKeyHex: pChainTxPrivateKey,
      pChainAddress: pChainTxAddress,
      blsProofOfPossession: blsProofOfPossession,
      signedMessage
    });

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationIDHex as `0x${string}`);
    const pChainChainID = '11111111111111111111111111111111LpoYY';
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, 5, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    console.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(unsignedPChainWarpMsgHex, unsignedPChainWarpMsgHex);
    console.log("Signatures aggregated");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);
    console.log("accessList", accessList)

    // Parse NodeID to bytes32 format
    const nodeIDWithoutPrefix = nodeId.replace("NodeID-", "");
    const decodedID = utils.base58.decode(nodeIDWithoutPrefix);
    const nodeIDHex = fromBytes(decodedID, 'hex');
    const nodeIDHexTrimmed = nodeIDHex.slice(0, -8); // Remove checksum
    // Pad end (right) to 32 bytes
    const nodeIdHex32 = pad(nodeIDHexTrimmed as `0x${string}`, { size: 32 });

    // Simulate completeValidatorRegistration transaction
    console.log("Simulating completeValidatorRegistration transaction...");
    await client.simulateContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeValidatorRegistration',
      args: [operator, nodeIdHex32, messageIndex],
      account: client.account,
      gas: BigInt(5000000),
      accessList
    });
    console.log("completeValidatorRegistration simulation successful");

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeValidatorRegistration',
      args: [operator, nodeIdHex32, messageIndex],
      chain: null,
      account: client.account,
      accessList
    });
    console.log("completeValidatorRegistration done, tx hash:", hash);
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
  nodeId: `0x${string}`
) {
  console.log("Removing node...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'removeNode',
      args: [nodeId],
      chain: null,
      account: client.account,
    });
    console.log("removeNode done, tx hash:", hash);
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
  messageIndex: bigint,
  nodeID: string,
  initializeEndValidationTxHash: `0x${string}`,
  pChainTxPrivateKey: string,
  pChainTxAddress: string
) {
  console.log("Completing validator removal...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    // Get ValidationID from ValidatorManager based on NodeID by call the registeredValidators function
    // NOTE: looks like we can't call registeredValidators on the middlewareAddress, so we need to call it on the underlying ValidatorManager?
    // Convert NodeID to bytes format
    const nodeIDBytes = parseNodeID(nodeID)
    const validationID = await client.readContract({
      address: middlewareAddress as `0x${string}`,
      abi: middlewareAbi,
      functionName: "registeredValidators",
      args: [nodeIDBytes]
    }) as `0x${string}`

    // Wait for the initializeEndValidation transaction to be confirmed to extract the unsigned L1ValidatorWeightMessage from the receipt
    const receipt = await client.waitForTransactionReceipt({ hash: initializeEndValidationTxHash })

    // Get the unsigned L1ValidatorWeightMessage with weight=0 generated by the ValidatorManager from the receipt
    const unsignedL1ValidatorWeightMessage = receipt.logs[0].data ?? '';
    console.log("Initialize End Validation Warp Msg: ", unsignedL1ValidatorWeightMessage)

    // Aggregate signatures from validators
    console.log("\nAggregating signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
    const signedL1ValidatorWeightMessage = await collectSignatures(unsignedL1ValidatorWeightMessage);
    console.log("Signatures aggregated");

    // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
    const pChainSetWeightTxId = await setValidatorWeight({
      privateKeyHex: pChainTxPrivateKey,
      pChainAddress: pChainTxAddress,
      validationID: validationID,
      message: signedL1ValidatorWeightMessage
    });

    // get justification for original register validator tx (the unsigned warp msg emitted)
    const justification = await GetRegistrationJustification(nodeID, validationID, '11111111111111111111111111111111LpoYY', client);

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationID as `0x${string}`);
    const pChainChainID = '11111111111111111111111111111111LpoYY';
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, 5, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    console.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures(unsignedPChainWarpMsgHex, bytesToHex(justification as Uint8Array));
    console.log("Signatures aggregated");

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    // Simulate completeEndValidation transaction
    console.log("\nSimulating completeEndValidation transaction...");
    const { request: completeRequest } = await client.simulateContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeValidatorRemoval',
      args: [0],
      account: client.account,
      gas: BigInt(500000),
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

    console.log("completeValidatorRemoval done, tx hash:", completeHash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// initializeValidatorWeightUpdateAndLock
export async function middlewareInitWeightUpdate(
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  nodeId: `0x${string}`,
  newWeight: bigint
) {
  console.log("Initializing validator weight update...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'initializeValidatorWeightUpdateAndLock',
      args: [nodeId, newWeight],
      chain: null,
      account: client.account,
    });
    console.log("initializeValidatorWeightUpdateAndLock done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// completeNodeWeightUpdate
export async function middlewareCompleteWeightUpdate(
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  nodeId: `0x${string}`,
  messageIndex: bigint
) {
  console.log("Completing node weight update...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeNodeWeightUpdate',
      args: [nodeId, messageIndex],
      chain: null,
      account: client.account,
    });
    console.log("completeNodeWeightUpdate done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// calcAndCacheStakes
export async function middlewareOperatorCache(
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  epoch: bigint,
  assetClass: bigint
) {
  console.log("Calculating and caching stakes...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'calcAndCacheStakes',
      args: [epoch, assetClass],
      chain: null,
      account: client.account,
    });
    console.log("calcAndCacheStakes done, tx hash:", hash);
  } catch (error) {
    console.error("Transaction failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

// calcAndCacheNodeWeightsForAllOperators
export async function middlewareCalcNodeWeights(
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any
) {
  console.log("Calculating node weights for all operators...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'calcAndCacheNodeWeightsForAllOperators',
      args: [],
      chain: null,
      account: client.account,
    });
    console.log("calcAndCacheNodeWeightsForAllOperators done, tx hash:", hash);
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
  messageIndex: bigint
) {
  console.log("Forcing node updates...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'forceUpdateNodes',
      args: [operator, messageIndex],
      chain: null,
      account: client.account,
    });
    console.log("forceUpdateNodes done, tx hash:", hash);
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

// nodeWeightCache
export async function middlewareGetNodeWeightCache(
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  epoch: bigint,
  validatorId: `0x${string}`
) {
  console.log("Reading node weight cache...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'nodeWeightCache',
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

// getOperatorUsedWeightCached
export async function middlewareGetOperatorUsedWeight(
  client: PublicClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`
) {
  console.log("Reading operator used weight cached...");

  try {
    const val = await client.readContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'getOperatorUsedWeightCached',
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
