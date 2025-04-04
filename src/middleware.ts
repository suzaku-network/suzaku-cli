import { WalletClient, PublicClient } from 'viem';

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
  nodeId: `0x${string}`,
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

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'addNode',
      args: [
        nodeId,
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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  operator: `0x${string}`,
  nodeId: `0x${string}`,
  messageIndex: bigint
) {
  console.log("Completing validator registration...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeValidatorRegistration',
      args: [operator, nodeId, messageIndex],
      chain: null,
      account: client.account,
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
  client: WalletClient,
  middlewareAddress: `0x${string}`,
  middlewareAbi: any,
  messageIndex: bigint
) {
  console.log("Completing validator removal...");

  try {
    if (!client.account) {
      throw new Error('Client account is required');
    }

    const hash = await client.writeContract({
      address: middlewareAddress,
      abi: middlewareAbi,
      functionName: 'completeValidatorRemoval',
      args: [messageIndex],
      chain: null,
      account: client.account,
    });
    console.log("completeValidatorRemoval done, tx hash:", hash);
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
