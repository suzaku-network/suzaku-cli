import { ExtendedClient, ExtendedPublicClient, ExtendedWalletClient } from './client';
import { Config } from './config';
import { CurriedSuzakuContractMap, SafeSuzakuContract, SuzakuContract, withSafeWrite } from './lib/viemUtils';
import { parseUnits, parseEventLogs, Hex, hexToBytes, bytesToHex, formatUnits } from 'viem';
import { logger } from './lib/logger';
import { parseNodeID, NodeId, encodeNodeID, retryWhileError, bytes32ToAddress } from './lib/utils';
import { getContract } from 'viem';
import { color } from 'console-log-colors';
import { collectSignatures, getSigningSubnetIdFromWarpMessage, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from './lib/warpUtils';
import { getValidationUptimeMessage } from './uptime';
import { getCurrentValidators, registerL1Validator, setValidatorWeight, validatedBy } from './lib/pChainUtils';
import { GetRegistrationJustification } from './lib/justification';
import { pipe, R } from '@mobily/ts-belt';
import { utils } from '@avalabs/avalanchejs';
import { pChainChainID } from './config';

export async function getValidatorManagerAddress(config: Config<ExtendedWalletClient>, stakingVault: SafeSuzakuContract['StakingVault']): Promise<{ validatorManagerAddress: Hex, stakingManager: SafeSuzakuContract['KiteStakingManager'], stakingManagerStorageLocation: Hex }> {
    const stakingManagerAddress = await stakingVault.read.getStakingManager();
    const stakingManager = await config.contracts.KiteStakingManager(stakingManagerAddress);
    const stakingManagerStorageLocation = await stakingManager.read.STAKING_MANAGER_STORAGE_LOCATION() as Hex
    const validatorManagerAddress = bytes32ToAddress((await config.client.getStorageAt({ address: stakingManagerAddress, slot: stakingManagerStorageLocation })) as Hex) as Hex;
    return { validatorManagerAddress, stakingManager, stakingManagerStorageLocation };
}

/**
 * Deposit native tokens (AVAX) into the StakingVault
 * @param client - The wallet client
 * @param stakingVault - The StakingVault contract instance
 * @param amount - Amount to deposit in AVAX (will be converted to wei with 9 decimals)
 * @param minShares - Minimum shares expected from the deposit (slippage protection)
 */
export async function depositStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    amount: string,
    minShares: bigint
) {
    logger.log("Depositing to StakingVault...");

    // Convert amount to wei
    const amountWei = parseUnits(amount, 18);

    logger.log("\n=== Deposit Details ===");
    logger.log("Amount:", amount, "AVAX");
    logger.log("Amount in wei:", amountWei.toString());
    logger.log("Minimum shares expected:", minShares.toString());
    logger.log("Vault address:", stakingVault.address);

    // Call deposit with value (payable function)
    const hash = await stakingVault.safeWrite.deposit(
        [minShares],
        {
            value: amountWei,
            chain: null
        }
    );

    logger.log("Deposit tx hash:", hash);

    // Wait for deposit confirmation
    logger.log("Waiting for deposit confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Deposit confirmed in block:", receipt.blockNumber);

    // Parse the deposit event to get the actual shares received
    try {
        const depositEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__Deposited',
            logs: receipt.logs,
        });

        if (depositEvents.length > 0) {
            const event = depositEvents[0];
            logger.log("✅ Deposit completed successfully!");
            logger.log("Shares received:", event.args?.shares?.toString() || 'N/A');
            logger.log("Stake amount:", event.args?.stakeAmount?.toString() || 'N/A');
        } else {
            logger.log("✅ Deposit completed successfully!");
        }
    } catch (error) {
        logger.log("✅ Deposit completed successfully!");
        logger.log("Note: Could not parse deposit event");
    }
}

/**
 * Request withdrawal from the StakingVault
 * @param client - The wallet client
 * @param stakingVault - The StakingVault contract instance
 * @param shares - Amount of shares to withdraw (in wei, 18 decimals)
 */
export async function requestWithdrawalStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    shares: string
) {
    logger.log("Requesting withdrawal from StakingVault...");

    // Convert shares to wei (18 decimals)
    const sharesWei = parseUnits(shares, 18);

    logger.log("\n=== Withdrawal Request Details ===");
    logger.log("Shares:", shares);
    logger.log("Shares in wei:", sharesWei.toString());
    logger.log("Vault address:", stakingVault.address);

    // Call requestWithdrawal
    const hash = await stakingVault.safeWrite.requestWithdrawal([sharesWei]);

    logger.log("Request withdrawal tx hash:", hash);

    // Wait for transaction confirmation
    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the withdrawal requested event to get the requestId
    try {
        const withdrawalRequestedEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__WithdrawalRequested',
            logs: receipt.logs,
        });

        if (withdrawalRequestedEvents.length > 0) {
            const event = withdrawalRequestedEvents[0];
            logger.log("✅ Withdrawal requested successfully!");
            logger.log("Request ID:", event.args?.requestId?.toString() || 'N/A');
            logger.log("Shares:", event.args?.shares?.toString() || 'N/A');
            logger.log("Stake amount:", event.args?.stakeAmount?.toString() || 'N/A');
        } else {
            logger.log("✅ Withdrawal requested successfully!");
        }
    } catch (error) {
        logger.log("✅ Withdrawal requested successfully!");
        logger.log("Note: Could not parse withdrawal requested event");
    }
}

/**
 * Claim withdrawal from the StakingVault
 * @param client - The wallet client
 * @param stakingVault - The StakingVault contract instance
 * @param requestId - The withdrawal request ID to claim
 */
export async function claimWithdrawalStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    requestId: bigint
) {
    logger.log("Claiming withdrawal from StakingVault...");

    logger.log("\n=== Withdrawal Claim Details ===");
    logger.log("Request ID:", requestId.toString());
    logger.log("Vault address:", stakingVault.address);

    // Call claimWithdrawal
    const hash = await stakingVault.safeWrite.claimWithdrawal([requestId]);

    logger.log("Claim withdrawal tx hash:", hash);

    // Wait for transaction confirmation
    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the withdrawal claimed event
    try {
        const withdrawalClaimedEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__WithdrawalClaimed',
            logs: receipt.logs,
        });

        if (withdrawalClaimedEvents.length > 0) {
            const event = withdrawalClaimedEvents[0];
            logger.log("✅ Withdrawal claimed successfully!");
            logger.log("Request ID:", event.args?.requestId?.toString() || 'N/A');
            logger.log("Stake amount claimed:", event.args?.stakeAmount?.toString() || 'N/A');
        } else {
            logger.log("✅ Withdrawal claimed successfully!");
        }
    } catch (error) {
        logger.log("✅ Withdrawal claimed successfully!");
        logger.log("Note: Could not parse withdrawal claimed event");
    }
}

/**
 * Process epoch in the StakingVault
 * @param client - The wallet client
 * @param stakingVault - The StakingVault contract instance
 */
export async function processEpochStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    options?: { gas?: bigint }
) {
    logger.log("Processing epoch in StakingVault...");

    logger.log("\n=== Process Epoch Details ===");
    logger.log("Vault address:", stakingVault.address);

    // Call processEpoch (explicit gas avoids auto-estimation hitting the bail-out path)
    const hash = await (stakingVault.safeWrite.processEpoch as any)(
        [], options?.gas ? { gas: options.gas } : undefined
    );

    logger.log("Process epoch tx hash:", hash);

    // Wait for transaction confirmation
    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the epoch processed event
    try {
        const epochProcessedEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__EpochProcessed',
            logs: receipt.logs,
        });

        if (epochProcessedEvents.length > 0) {
            const event = epochProcessedEvents[0];
            logger.log("✅ Epoch processed successfully!");
            logger.log("Epoch:", event.args?.epoch?.toString() || 'N/A');
            logger.log("Withdrawals fulfilled:", event.args?.withdrawalsFulfilled?.toString() || 'N/A');
            logger.log("Stake released:", event.args?.stakeReleased?.toString() || 'N/A');
            logger.log("Requests remaining:", event.args?.requestsRemaining?.toString() || 'N/A');
        } else {
            logger.log("✅ Epoch processed successfully!");
        }
    } catch (error) {
        logger.log("✅ Epoch processed successfully!");
        logger.log("Note: Could not parse epoch processed event");
    }
}

/**
 * Initiate validator registration in the StakingVault
 * @param client - The wallet client
 * @param config - The config object
 * @param stakingVault - The StakingVault contract instance
 * @param nodeId - The node ID
 * @param blsKey - The BLS public key
 * @param remainingBalanceOwner - P-Chain remaining balance owner struct
 * @param disableOwner - P-Chain disable owner struct
 * @param stakeAmount - The stake amount in AVAX (will be converted to wei with 18 decimals)
 */
export async function initiateValidatorRegistrationStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    nodeId: NodeId,
    blsKey: Hex,
    remainingBalanceOwner: [number, Hex[]],
    disableOwner: [number, Hex[]],
    stakeAmount: string
) {
    logger.log("Initiating validator registration in StakingVault...");

    // Convert stake amount to wei (18 decimals)
    const stakeAmountWei = parseUnits(stakeAmount, 18);

    // Parse NodeID to bytes format (20 bytes, no padding)
    const nodeIdBytes = parseNodeID(nodeId, false);

    logger.log("\n=== Validator Registration Details ===");
    logger.log("Node ID:", nodeId);
    logger.log("BLS Key:", blsKey);
    logger.log("Stake amount:", stakeAmount, "AVAX");
    logger.log("Stake amount in wei:", stakeAmountWei.toString());
    logger.log("Remaining balance owner threshold:", remainingBalanceOwner[0]);
    logger.log("Remaining balance owner addresses:", remainingBalanceOwner[1]);
    logger.log("Disable owner threshold:", disableOwner[0]);
    logger.log("Disable owner addresses:", disableOwner[1]);
    logger.log("Vault address:", stakingVault.address);

    // Call initiateValidatorRegistration
    const hash = await stakingVault.safeWrite.initiateValidatorRegistration([
        nodeIdBytes,
        blsKey,
        { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] },
        { threshold: disableOwner[0], addresses: disableOwner[1] },
        stakeAmountWei
    ]);

    logger.log("Initiate validator registration tx hash:", hash);

    // Wait for transaction confirmation
    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the validator registration initiated event
    try {
        const validatorRegisteredEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__ValidatorRegistrationInitiated',
            logs: receipt.logs,
        });

        if (validatorRegisteredEvents.length > 0) {
            const event = validatorRegisteredEvents[0];
            logger.log("✅ Validator registration initiated successfully!");
            logger.log("Validation ID:", event.args?.validationID || 'N/A');
            logger.log("Operator:", event.args?.operator || 'N/A');
        } else {
            logger.log("✅ Validator registration initiated successfully!");
        }
    } catch (error) {
        logger.log("✅ Validator registration initiated successfully!");
        logger.log("Note: Could not parse validator registration initiated event");
    }
}

/**
 * Add an operator to the StakingVault
 * @param client - The wallet client
 * @param config - The config object
 * @param stakingVault - The StakingVault contract instance
 * @param operator - The operator address
 * @param allocationBips - The allocation in basis points (1 bips = 0.01%)
 * @param feeRecipient - The fee recipient address
 */
export async function addOperatorStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    operator: Hex,
    allocationBips: bigint,
    feeRecipient: Hex
) {
    logger.log("Adding operator to StakingVault...");

    logger.log("\n=== Add Operator Details ===");
    logger.log("Operator address:", operator);
    logger.log("Allocation (bips):", allocationBips.toString());
    logger.log("Fee recipient:", feeRecipient);
    logger.log("Vault address:", stakingVault.address);

    // Call addOperator
    const hash = await stakingVault.safeWrite.addOperator([
        operator,
        allocationBips,
        feeRecipient
    ]);

    logger.log("Add operator tx hash:", hash);

    // Wait for transaction confirmation
    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the operator added event
    try {
        const operatorAddedEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__OperatorAdded',
            logs: receipt.logs,
        });

        if (operatorAddedEvents.length > 0) {
            const event = operatorAddedEvents[0];
            logger.log("✅ Operator added successfully!");
            logger.log("Operator:", event.args?.operator || 'N/A');
            logger.log("Allocation (bips):", event.args?.allocationBips?.toString() || 'N/A');
        } else {
            logger.log("✅ Operator added successfully!");
        }
    } catch (error) {
        logger.log("✅ Operator added successfully!");
        logger.log("Note: Could not parse operator added event");
    }
}

/**
 * Complete validator registration in the StakingVault
 * @param client - The wallet client
 * @param pchainClient - The P-Chain wallet client
 * @param config - The config object
 * @param stakingVault - The StakingVault contract
 * @param validatorManager - The ValidatorManager contract
 * @param blsProofOfPossession - The BLS proof of possession
 * @param initiateTxHash - The initiateValidatorRegistration transaction hash
 * @param initialBalance - The initial balance for the validator (in nAVAX, 9 decimals)
 * @param waitValidatorVisible - Whether to wait for the validator to be visible on P-Chain
 */
export async function completeValidatorRegistrationStakingVault(
    pchainClient: ExtendedWalletClient,
    config: Config<ExtendedWalletClient>,
    stakingVault: SafeSuzakuContract['StakingVault'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    blsProofOfPossession: string,
    initiateTxHash: Hex,
    initialBalance: bigint,
    waitValidatorVisible: boolean
) {
    logger.log("Completing validator registration in StakingVault...");
    const client = config.client;
    // Wait for transaction receipt to extract warp message and validation ID
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash });

    // Parse StakingVault__ValidatorRegistrationInitiated event from StakingVaultOperations
    const validatorRegisteredEvents = parseEventLogs({
        abi: stakingVault.abi,
        logs: receipt.logs,
        eventName: 'StakingVault__ValidatorRegistrationInitiated'
    });

    if (!validatorRegisteredEvents || validatorRegisteredEvents.length === 0) {
        logger.error(color.red("No StakingVault__ValidatorRegistrationInitiated event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    const validatorRegisteredEvent = validatorRegisteredEvents[0];
    const validationIDHex = validatorRegisteredEvent.args?.validationID;

    if (!validationIDHex) {
        logger.error(color.red("No validationID found in StakingVault__ValidatorRegistrationInitiated event."));
        process.exit(1);
    }

    // Get ValidatorManager to get nodeID and subnetID

    // Get validator info from ValidatorManager
    const validator = await validatorManager.read.getValidator([validationIDHex]);
    const nodeId = encodeNodeID(validator.nodeID as Hex);
    const subnetIDHex = await validatorManager.read.subnetID();

    // messageIndex is always 0 for StakingVaultOperations
    const messageIndex = 0;

    // Parse IWarpMessenger event to get the unsigned warp message
    const warpLogs = parseEventLogs({
        abi: config.abis.IWarpMessenger,
        logs: receipt.logs,
    });

    if (!warpLogs || warpLogs.length === 0) {
        logger.error(color.red("No IWarpMessenger event found in the transaction logs."));
        process.exit(1);
    }

    const warpLog = warpLogs[0];
    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

    // Check if the node is already registered as a validator on the P-Chain
    const subnetIDStr = utils.base58check.encode(hexToBytes(subnetIDHex));
    const isValidator = (await getCurrentValidators(client, subnetIDStr)).some((v) => v.nodeID === nodeId);

    if (isValidator) {
        logger.log(color.yellow("Node is already registered as a validator on the P-Chain, skipping registerL1Validator call."));
    } else {
        // Get the unsigned warp message from the receipt
        const RegisterL1ValidatorUnsignedWarpMsg = warpLog.args.message;

        // Collect signatures for the warp message
        logger.log("\nCollecting signatures for the L1ValidatorRegistrationMessage from the Validator Manager chain...");
        const signedMessage = await collectSignatures({ network: client.network, message: RegisterL1ValidatorUnsignedWarpMsg, signingSubnetId });

        // Register validator on P-Chain
        logger.log("\nRegistering validator on P-Chain...");
        pipe(await registerL1Validator({
            client: pchainClient,
            blsProofOfPossession: blsProofOfPossession,
            signedMessage,
            initialBalance: initialBalance
        }),
            R.tap(pChainTxId => logger.log("RegisterL1ValidatorTx executed on P-Chain:", pChainTxId)),
            R.tapError(err => { logger.error(err); process.exit(1) })
        );
    }

    // Pack and sign the P-Chain warp message
    const validationIDBytes = hexToBytes(validationIDHex as Hex);
    const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, client.network === 'fuji' ? 5 : 1, pChainChainID);
    const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

    // Aggregate signatures from validators
    logger.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
    const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, signingSubnetId });

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    logger.log("\nCalling function completeValidatorRegistration on the staking vault...");
    const hash = await stakingVault.safeWrite.completeValidatorRegistration(
        [messageIndex],
        {
            chain: null,
            accessList
        }
    );

    // Wait until the validator is visible on the P-Chain
    if (waitValidatorVisible) {
        logger.log("Waiting for the validator to be visible on the P-Chain (may take a while)...");
        await retryWhileError(async () => (await getCurrentValidators(client, subnetIDStr)).some((v) => v.nodeID === nodeId), 5000, 180000, (res) => res === true);
    }

    logger.log("completeValidatorRegistration executed successfully, tx hash:", hash);
    return hash;
}

/**
 * Initiate validator removal in the StakingVault
 * @param client - The wallet client
 * @param config - The config object
 * @param stakingVault - The StakingVault contract instance
 * @param validatorManager - The ValidatorManager contract instance
 * @param nodeId - The node ID of the validator to remove
 */
export async function initiateValidatorRemovalStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    nodeId: NodeId
) {
    logger.log("Initiating validator removal in StakingVault...");

    // Parse NodeID to bytes format (20 bytes, no padding)
    const nodeIdBytes = parseNodeID(nodeId, false);

    // Get validationID from ValidatorManager
    const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);

    logger.log("\n=== Validator Removal Initiation Details ===");
    logger.log("Node ID:", nodeId);
    logger.log("Validation ID:", validationID);
    logger.log("Vault address:", stakingVault.address);

    // Call initiateValidatorRemoval
    const hash = await stakingVault.safeWrite.initiateValidatorRemoval([
        validationID
    ]);

    logger.log("Initiate validator removal tx hash:", hash);

    // Wait for transaction confirmation
    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the validator removal initiated event
    try {
        const validatorRemovalInitiatedEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__ValidatorRemovalInitiated',
            logs: receipt.logs,
        });

        if (validatorRemovalInitiatedEvents.length > 0) {
            const event = validatorRemovalInitiatedEvents[0];
            logger.log("✅ Validator removal initiated successfully!");
            logger.log("Validation ID:", event.args?.validationID || 'N/A');
            logger.log("Operator:", event.args?.operator || 'N/A');
        } else {
            logger.log("✅ Validator removal initiated successfully!");
        }
    } catch (error) {
        logger.log("✅ Validator removal initiated successfully!");
        logger.log("Note: Could not parse validator removal initiated event");
    }

    return hash;
}

/**
 * Force remove a validator from the StakingVault (admin/emergency operation).
 * @param client - The wallet client
 * @param stakingVault - The StakingVault contract instance
 * @param validatorManager - The ValidatorManager contract instance
 * @param nodeId - The node ID of the validator to force remove
 */
export async function forceRemoveValidatorStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    nodeId: NodeId
) {
    logger.log("Force removing validator from StakingVault...");

    // Parse NodeID to bytes format (20 bytes, no padding)
    const nodeIdBytes = parseNodeID(nodeId, false);

    // Get validationID from ValidatorManager
    const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);

    logger.log("\n=== Force Remove Validator Details ===");
    logger.log("Node ID:", nodeId);
    logger.log("Validation ID:", validationID);
    logger.log("Vault address:", stakingVault.address);

    const hash = await stakingVault.safeWrite.forceRemoveValidator([validationID]);

    logger.log("Force remove validator tx hash:", hash);

    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);
    logger.log("✅ Validator force-removed successfully!");
    return hash;
}

/**
 * Complete validator removal in the StakingVault
 * @param client - The wallet client
 * @param pchainClient - The P-Chain wallet client
 * @param config - The config object
 * @param stakingVault - The StakingVault contract instance
 * @param validatorManager - The ValidatorManager contract instance
 * @param initiateRemovalTxHash - The initiateValidatorRemoval transaction hash
 * @param waitValidatorVisible - Whether to wait for the validator to be removed from P-Chain
 * @param nodeIDs - Optional node IDs to filter removals
 * @param initiateTxHash - Optional initiate validator registration transaction hash for justification
 */
export async function completeValidatorRemovalStakingVault(
    pchainClient: ExtendedWalletClient,
    config: Config<ExtendedWalletClient>,
    stakingVault: SafeSuzakuContract['StakingVault'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    initiateRemovalTxHash: Hex,
    waitValidatorVisible: boolean,
    nodeIDs?: NodeId[],
    initiateTxHash?: Hex
) {
    logger.log("Completing validator removal in StakingVault...");
    const client = config.client;
    // Wait for the initiate removal transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

    // Parse StakingVault__ValidatorRemovalInitiated events from StakingVaultOperations
    const validatorRemovalInitiatedEvents = parseEventLogs({
        abi: stakingVault.abi,
        logs: receipt.logs,
        eventName: 'StakingVault__ValidatorRemovalInitiated'
    });

    if (validatorRemovalInitiatedEvents.length === 0) {
        logger.error(color.red("No StakingVault__ValidatorRemovalInitiated event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    // Filter by nodeIDs if provided
    const filteredRemovals = nodeIDs
        ? (await Promise.all(
            validatorRemovalInitiatedEvents.map(async (e) => {
                const validationID = e.args?.validationID;
                if (!validationID) return null;
                const validator = await validatorManager.read.getValidator([validationID]);
                const nodeId = encodeNodeID(validator.nodeID as Hex);
                return { event: e, nodeId };
            })
        )).filter((item): item is { event: any; nodeId: NodeId } => item !== null && nodeIDs.includes(item.nodeId)).map(({ event }) => event)
        : validatorRemovalInitiatedEvents;

    if (filteredRemovals.length === 0) {
        logger.error(color.red("No matching StakingVault__ValidatorRemovalInitiated event found for the provided NodeIDs, verify the transaction hash and NodeIDs."));
        process.exit(1);
    }

    const warpLogs = parseEventLogs({
        abi: config.abis.IWarpMessenger,
        logs: receipt.logs,
    });

    const subnetIDHex = await validatorManager.read.subnetID();
    const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
    const currentValidators = await getCurrentValidators(client, subnetID);

    // Find InitiatedValidatorRemoval events from ValidatorManager to get weight message info
    const validatorManagerRemovalEvents = parseEventLogs({
        abi: validatorManager.abi,
        logs: receipt.logs,
        eventName: 'InitiatedValidatorRemoval'
    });

    for (const event of filteredRemovals) {
        const validationID = event.args?.validationID;
        if (!validationID) {
            logger.error(color.red("No validationID found in StakingVault__ValidatorRemovalInitiated event."));
            continue;
        }

        // Get nodeID from validator
        const validator = await validatorManager.read.getValidator([validationID]);
        const nodeID = encodeNodeID(validator.nodeID as Hex);
        logger.log(`Processing removal for node ${nodeID}`);

        // Find the corresponding ValidatorManager InitiatedValidatorRemoval event
        const validatorManagerEvent = validatorManagerRemovalEvents.find((e) => e.args?.validationID === validationID);
        if (!validatorManagerEvent) {
            logger.error(color.red(`No matching ValidatorManager InitiatedValidatorRemoval event found for validationID ${validationID}`));
            continue;
        }

        // Find the corresponding warp log
        const warpLog = warpLogs.find((w) => {
            return w.args.messageID === validatorManagerEvent.args.validatorWeightMessageID;
        });

        if (!warpLog) {
            logger.error(color.red(`No matching warp log found for validationID ${validationID}`));
            continue;
        }

        const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

        let addNodeBlockNumber = receipt.blockNumber;
        if (initiateTxHash) {
            const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 0 });
            if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls use another initiate tx`);
            addNodeBlockNumber = addNodeReceipt.blockNumber;
        }

        // Check if the node is still registered as a validator on the P-Chain
        const isValidator = currentValidators.some((v) => v.nodeID === nodeID);
        if (!isValidator) {
            logger.log(color.yellow("Node is not registered as a validator on the P-Chain."));
        } else {
            // Get the unsigned L1ValidatorWeightMessage with weight=0 generated by the ValidatorManager from the receipt
            const unsignedL1ValidatorWeightMessage = warpLog.args.message;

            // Aggregate signatures from validators
            logger.log("\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
            const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: unsignedL1ValidatorWeightMessage, signingSubnetId });
            logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

            // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
            logger.log("\nSetting validator weight on P-Chain...");
            pipe(
                await setValidatorWeight({
                    client: pchainClient,
                    validationID: validationID,
                    message: signedL1ValidatorWeightMessage
                }),
                R.tapError(
                    (error) => {
                        throw new Error("SetL1ValidatorWeightTx failed on P-Chain: " + error + '\n');
                    }),
                R.tap((txId) => {
                    logger.log("SetL1ValidatorWeightTx executed on P-Chain: " + txId);
                })
            );
        }

        // Get justification for original register validator tx
        const justification = await GetRegistrationJustification(nodeID, validationID, pChainChainID, client, addNodeBlockNumber);
        if (!justification) {
            throw new Error("Justification not found for validator removal");
        }

        // Pack and sign the P-Chain warp message
        const validationIDBytes = hexToBytes(validationID as Hex);
        const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, client.network === 'fuji' ? 5 : 1, pChainChainID);
        const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

        // Aggregate signatures from validators
        logger.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
        const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: bytesToHex(justification as Uint8Array), signingSubnetId });
        logger.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

        // Convert the signed warp message to bytes and pack into access list
        const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
        const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

        // messageIndex is always 0 for StakingVaultOperations
        const messageIndex = 0;

        // Execute completeValidatorRemoval transaction
        logger.log("Executing completeValidatorRemoval transaction...");
        const completeHash = await stakingVault.safeWrite.completeValidatorRemoval(
            [messageIndex],
            {
                account: client.account!,
                chain: null,
                accessList
            }
        );

        if (waitValidatorVisible) {
            logger.log("Waiting for the validator to be removed from the P-Chain (may take a while)...");
            await retryWhileError(async () => (await getCurrentValidators(client, subnetID)).some((v) => v.nodeID === nodeID), 5000, 180000, (res) => res === false);
        }

        logger.log("completeValidatorRemoval executed successfully, tx hash:", completeHash);
    }
}

/**
 * Initiate delegator registration in the StakingVault
 * @param client - The wallet client
 * @param config - The config object
 * @param stakingVault - The StakingVault contract instance
 * @param validatorManager - The ValidatorManager contract instance
 * @param nodeId - The node ID of the validator to delegate to
 * @param amount - The stake amount in AVAX (will be converted to wei with 18 decimals)
 */
export async function initiateDelegatorRegistrationStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    nodeId: NodeId,
    amount: string
) {
    logger.log("Initiating delegator registration in StakingVault...");

    // Convert amount to wei (18 decimals)
    const amountWei = parseUnits(amount, 18);

    // Parse NodeID to bytes format (20 bytes, no padding)
    const nodeIdBytes = parseNodeID(nodeId, false);

    // Get validationID from ValidatorManager
    const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);

    logger.log("\n=== Delegator Registration Details ===");
    logger.log("Node ID:", nodeId);
    logger.log("Validation ID:", validationID);
    logger.log("Amount:", amount, "AVAX");
    logger.log("Amount in wei:", amountWei.toString());
    logger.log("Vault address:", stakingVault.address);

    // Call initiateDelegatorRegistration
    const hash = await stakingVault.safeWrite.initiateDelegatorRegistration([
        validationID,
        amountWei
    ]);

    logger.log("Initiate delegator registration tx hash:", hash);

    // Wait for transaction confirmation
    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the delegator registration initiated event
    try {
        const delegatorRegisteredEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__DelegatorRegistrationInitiated',
            logs: receipt.logs,
        });

        if (delegatorRegisteredEvents.length > 0) {
            const event = delegatorRegisteredEvents[0];
            logger.log("✅ Delegator registration initiated successfully!");
            logger.log("Delegation ID:", event.args?.delegationID || 'N/A');
            logger.log("Validation ID:", event.args?.validationID || 'N/A');
            logger.log("Operator:", event.args?.operator || 'N/A');
            logger.log("Amount:", event.args?.amount?.toString() || 'N/A');
        } else {
            logger.log("✅ Delegator registration initiated successfully!");
        }
    } catch (error) {
        logger.log("✅ Delegator registration initiated successfully!");
        logger.log("Note: Could not parse delegator registration initiated event");
    }

    return hash;
}

/**
 * Complete delegator registration in the StakingVault
 * @param client - The wallet client
 * @param pchainClient - The P-Chain wallet client
 * @param config - The config object
 * @param stakingVault - The StakingVault contract instance
 * @param validatorManager - The ValidatorManager contract instance
 * @param initiateTxHash - The initiateDelegatorRegistration transaction hash
 * @param rpcUrl - RPC URL for getting validator uptime
 * @param uptimeBlockchainID - The uptime blockchain ID (Hex) for the source chain ID
 */
export async function completeDelegatorRegistrationStakingVault(
    pchainClient: ExtendedWalletClient,
    config: Config<ExtendedWalletClient>,
    stakingVault: SafeSuzakuContract['StakingVault'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    initiateTxHash: Hex,
    rpcUrl: string,
    uptimeBlockchainID: Hex
): Promise<Hex> {
    logger.log("Completing delegator registration in StakingVault...");
    const client = config.client;
    // Wait for the initiate delegator registration transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls resend the initiate delegator registration transaction`);

    // Parse StakingVault__DelegatorRegistrationInitiated event from StakingVaultOperations
    const delegatorRegisteredEvents = parseEventLogs({
        abi: stakingVault.abi,
        logs: receipt.logs,
        eventName: 'StakingVault__DelegatorRegistrationInitiated'
    });

    if (!delegatorRegisteredEvents || delegatorRegisteredEvents.length === 0) {
        logger.error(color.red("No StakingVault__DelegatorRegistrationInitiated event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    const delegatorRegisteredEvent = delegatorRegisteredEvents[0];
    const delegationID = delegatorRegisteredEvent.args?.delegationID;
    const validationID = delegatorRegisteredEvent.args?.validationID;

    if (!delegationID || !validationID) {
        logger.error(color.red("No delegationID or validationID found in StakingVault__DelegatorRegistrationInitiated event."));
        process.exit(1);
    }

    // Get the validator info to get nodeID
    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeId = encodeNodeID(validator.nodeID as Hex);

    // Find InitiatedValidatorWeightUpdate events from ValidatorManager to get weight and nonce
    const weightUpdateEvents = parseEventLogs({
        abi: validatorManager.abi,
        logs: receipt.logs,
        eventName: 'InitiatedValidatorWeightUpdate'
    });

    // Find the weight update event for this validationID
    const weightUpdateEvent = weightUpdateEvents.find((e) => e.args?.validationID === validationID);
    if (!weightUpdateEvent) {
        logger.error(color.red("No InitiatedValidatorWeightUpdate event found for validationID, verify the transaction hash."));
        process.exit(1);
    }

    const validatorWeight = weightUpdateEvent.args?.weight;
    const nonce = weightUpdateEvent.args?.nonce;
    const setWeightMessageID = weightUpdateEvent.args?.weightUpdateMessageID;

    // Get warp logs to find the weight message
    const warpLogs = parseEventLogs({
        abi: config.abis.IWarpMessenger,
        logs: receipt.logs,
    });

    const weightWarpLog = warpLogs.find((w) => w.args.messageID === setWeightMessageID);
    if (!weightWarpLog) {
        logger.error(color.red("No matching warp message found for setWeightMessageID, verify the transaction hash."));
        process.exit(1);
    }

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, weightWarpLog.args.message);

    // Get the unsigned L1ValidatorWeightMessage
    const unsignedL1ValidatorWeightMessage = weightWarpLog.args.message;

    // Aggregate signatures from validators for the weight message
    logger.log("\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
    const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: unsignedL1ValidatorWeightMessage, signingSubnetId });
    logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

    // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
    logger.log("\nSetting validator weight on P-Chain...");
    pipe(await setValidatorWeight({
        client: pchainClient,
        validationID: validationID,
        message: signedL1ValidatorWeightMessage
    }),
        R.tap(pChainSetWeightTxId => logger.log("SetL1ValidatorWeightTx executed on P-Chain:", pChainSetWeightTxId)),
        R.tapError(err => {
            if (!err.includes('warp message contains stale nonce')) {
                logger.error(err);
                process.exit(1);
            }
            logger.warn(color.yellow(`Warning: Skipping SetL1ValidatorWeightTx for validationID ${validationID} due to stale nonce (already issued)`));
        }));
    // Pack and sign the P-Chain warp message for weight update
    const validationIDBytes = hexToBytes(validationID as Hex);
    const unsignedPChainWeightWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(validatorWeight), client.network === 'fuji' ? 5 : 1, pChainChainID);
    const unsignedPChainWeightWarpMsgHex = bytesToHex(unsignedPChainWeightWarpMsg);
    const sourceChainID = utils.base58check.encode(hexToBytes(uptimeBlockchainID));
    // Aggregate signatures from validators for the P-Chain weight message
    logger.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
    const signedPChainWeightMessage = await collectSignatures({ network: client.network, message: unsignedPChainWeightWarpMsgHex, signingSubnetId });
    logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

    // Get the uptime message
    // Use the uptimeBlockchainID passed as parameter (same as KiteStakingManager settings)
    const warpNetworkID = client.network === 'fuji' ? 5 : 1;
    logger.log("\nGetting validation uptime message...");
    const signedUptimeMessage = await getValidationUptimeMessage(
        client,
        `${rpcUrl}/ext/bc/${sourceChainID}`,
        nodeId,
        warpNetworkID,
        sourceChainID
    );

    // Ensure signedUptimeMessage has 0x prefix
    const signedUptimeMessageHex = signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`;

    // Pack both messages into access list
    // Convert both signed messages to bytes
    const signedPChainWeightWarpMsgBytes = hexToBytes(`0x${signedPChainWeightMessage}`);
    const signedUptimeMessageBytes = hexToBytes(signedUptimeMessageHex as Hex);

    // Pack both messages into separate access list objects
    const weightAccessList = packWarpIntoAccessList(signedPChainWeightWarpMsgBytes);
    const uptimeAccessList = packWarpIntoAccessList(signedUptimeMessageBytes);

    // Combine access lists as two separate objects in the array
    const combinedAccessList = [
        weightAccessList[0],
        uptimeAccessList[0]
    ];

    // messageIndex is always 0 for StakingVaultOperations
    const messageIndex = 0;
    const uptimeMessageIndex = 1;

    logger.log("\nCalling function completeDelegatorRegistration...");
    const hash = await stakingVault.safeWrite.completeDelegatorRegistration(
        [delegationID, messageIndex, uptimeMessageIndex],
        {
            account: client.account!,
            chain: null,
            accessList: combinedAccessList
        }
    );

    logger.log("completeDelegatorRegistration executed successfully, tx hash:", hash);
    return hash;
}

/**
 * Initiate delegator removal in the StakingVault
 * @param client - The wallet client
 * @param stakingVaultAddress - The StakingVault contract address
 * @param delegationID - The delegation ID to remove
 */
export async function initiateDelegatorRemovalStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    delegationID: Hex
) {
    logger.log("Initiating delegator removal in StakingVault...");

    logger.log("\n=== Delegator Removal Initiation Details ===");
    logger.log("Delegation ID:", delegationID);
    logger.log("Vault address:", stakingVault.address);

    // Call initiateDelegatorRemoval (StakingVaultOperations version only takes delegationID)
    const hash = await stakingVault.safeWrite.initiateDelegatorRemoval([
        delegationID
    ]);

    logger.log("Initiate delegator removal tx hash:", hash);

    // Wait for transaction confirmation
    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);

    // Parse the delegator removal initiated event
    try {
        const delegatorRemovalInitiatedEvents = parseEventLogs({
            abi: stakingVault.abi,
            eventName: 'StakingVault__DelegatorRemovalInitiated',
            logs: receipt.logs,
        });

        if (delegatorRemovalInitiatedEvents.length > 0) {
            const event = delegatorRemovalInitiatedEvents[0];
            logger.log("✅ Delegator removal initiated successfully!");
            logger.log("Delegation ID:", event.args?.delegationID || 'N/A');
        } else {
            logger.log("✅ Delegator removal initiated successfully!");
        }
    } catch (error) {
        logger.log("✅ Delegator removal initiated successfully!");
        logger.log("Note: Could not parse delegator removal initiated event");
    }

    return hash;
}

/**
 * Force remove a delegator from the StakingVault (admin/emergency operation).
 * @param client - The wallet client
 * @param stakingVault - The StakingVault contract instance
 * @param delegationID - The delegation ID to force remove
 */
export async function forceRemoveDelegatorStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    delegationID: Hex
) {
    logger.log("Force removing delegator from StakingVault...");

    logger.log("\n=== Force Remove Delegator Details ===");
    logger.log("Delegation ID:", delegationID);
    logger.log("Vault address:", stakingVault.address);

    const hash = await stakingVault.safeWrite.forceRemoveDelegator([delegationID]);

    logger.log("Force remove delegator tx hash:", hash);

    logger.log("Waiting for transaction confirmation...");
    const receipt = await client.waitForTransactionReceipt({ hash });
    logger.log("Transaction confirmed in block:", receipt.blockNumber);
    logger.log("✅ Delegator force-removed successfully!");
    return hash;
}

/**
 * Complete delegator removal in the StakingVault
 * @param client - The wallet client
 * @param pchainClient - The P-Chain wallet client
 * @param config - The config object
 * @param stakingVault - The StakingVault contract instance
 * @param validatorManager - The ValidatorManager contract instance
 * @param initiateRemovalTxHash - The initiateDelegatorRemoval transaction hash
 * @param waitValidatorVisible - Whether to wait for the validator to be removed from P-Chain
 * @param delegationIDs - Optional delegation IDs to filter removals
 * @param initiateTxHash - Optional initiate delegator registration transaction hash
 */
export async function completeDelegatorRemovalStakingVault(
    pchainClient: ExtendedWalletClient,
    config: Config<ExtendedWalletClient>,
    stakingVault: SafeSuzakuContract['StakingVault'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    initiateRemovalTxHash: Hex,
    delegationIDs?: Hex[],
    initiateTxHash?: Hex
): Promise<Hex> {
    logger.log("Completing delegator removal in StakingVault...");
    const client = config.client;
    // Wait for the initiate removal transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

    // Parse StakingVault__DelegatorRemovalInitiated events from StakingVaultOperations
    const delegatorRemovalInitiatedEvents = parseEventLogs({
        abi: stakingVault.abi,
        logs: receipt.logs,
        eventName: 'StakingVault__DelegatorRemovalInitiated'
    });

    if (delegatorRemovalInitiatedEvents.length === 0) {
        logger.error(color.red("No StakingVault__DelegatorRemovalInitiated event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    // Filter by delegationIDs if provided
    const filteredRemovals = delegationIDs
        ? delegatorRemovalInitiatedEvents.filter((e) => {
            const delegationID = e.args?.delegationID;
            return delegationID && delegationIDs.includes(delegationID);
        })
        : delegatorRemovalInitiatedEvents;

    if (filteredRemovals.length === 0) {
        logger.error(color.red("No matching StakingVault__DelegatorRemovalInitiated event found for the provided delegationIDs, verify the transaction hash and delegationIDs."));
        process.exit(1);
    }

    // Get warp logs
    const warpLogs = parseEventLogs({
        abi: config.abis.IWarpMessenger,
        logs: receipt.logs,
    });

    let lastHash: Hex | undefined;

    for (const event of filteredRemovals) {
        const delegationID = event.args?.delegationID;
        if (!delegationID) {
            logger.error(color.red("No delegationID found in StakingVault__DelegatorRemovalInitiated event."));
            continue;
        }

        // Get delegator info from StakingVault to get validationID
        const delegatorInfo = await stakingVault.read.getDelegatorInfo([delegationID]);

        const validationID = delegatorInfo.validationID;

        // Get the validator info to get nodeID
        const validator = await validatorManager.read.getValidator([validationID]);
        const nodeID = encodeNodeID(validator.nodeID as Hex);
        logger.log(`Processing removal for delegation ${delegationID}, node ${nodeID}`);

        let addNodeBlockNumber = receipt.blockNumber;

        if (initiateTxHash) {
            const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 0 });
            if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls use another initiate tx`);

            // Check if this delegationID is in the registration event
            const registrationEvents = parseEventLogs({
                abi: stakingVault.abi,
                logs: addNodeReceipt.logs,
                eventName: 'StakingVault__DelegatorRegistrationInitiated'
            });

            if (registrationEvents.some((e) => e.args?.delegationID === delegationID)) {
                addNodeBlockNumber = addNodeReceipt.blockNumber;
            }
        }

        // Look for InitiatedValidatorWeightUpdate events from ValidatorManager (similar to completeWeightUpdate)
        const initiatedValidatorWeightUpdates = parseEventLogs({
            abi: validatorManager.abi,
            logs: receipt.logs,
            eventName: 'InitiatedValidatorWeightUpdate'
        }).filter((e) => e.args.validationID === validationID);

        if (initiatedValidatorWeightUpdates.length === 0) {
            logger.error(color.red(`No InitiatedValidatorWeightUpdate event found for validationID ${validationID}`));
            continue;
        }

        const weightUpdateEvent = initiatedValidatorWeightUpdates[0];
        const warpLog = warpLogs.find((w) => w.args.messageID === weightUpdateEvent.args.weightUpdateMessageID);
        if (!warpLog) {
            logger.error(color.red(`No matching warp log found for weightUpdateMessageID ${weightUpdateEvent.args.weightUpdateMessageID}`));
            continue;
        }

        const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

        const unsignedL1ValidatorWeightMessage = warpLog.args.message;
        const weight = weightUpdateEvent.args.weight;
        const nonce = weightUpdateEvent.args.nonce;

        // Aggregate signatures from validators for the weight message
        logger.log("\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
        const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: unsignedL1ValidatorWeightMessage, signingSubnetId });
        logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

        // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
        logger.log("\nSetting validator weight on P-Chain...");
        pipe(await setValidatorWeight({
            client: pchainClient,
            validationID: validationID,
            message: signedL1ValidatorWeightMessage
        }),
            R.tap(pChainSetWeightTxId => logger.log("SetL1ValidatorWeightTx executed on P-Chain:", pChainSetWeightTxId)),
            R.tapError(err => {
                if (!err.includes('warp message contains stale nonce')) {
                    logger.error(err);
                    process.exit(1);
                }
                logger.warn(color.yellow(`Warning: Skipping SetL1ValidatorWeightTx for validationID ${validationID} due to stale nonce (already issued)`));
            }));

        // Pack and sign the P-Chain warp message for weight update
        const validationIDBytes = hexToBytes(validationID as Hex);
        const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), client.network === 'fuji' ? 5 : 1, pChainChainID);
        const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

        // Aggregate signatures from validators for the P-Chain weight message
        logger.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
        const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: unsignedPChainWarpMsgHex, signingSubnetId });
        logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

        // Convert the signed warp message to bytes and pack into access list
        const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
        const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

        // messageIndex is always 0 for StakingVaultOperations
        const messageIndex = 0;

        logger.log("\nCalling function completeDelegatorRemoval...");
        const hash = await stakingVault.safeWrite.completeDelegatorRemoval(
            [delegationID, messageIndex],
            {
                account: client.account!,
                chain: null,
                accessList
            }
        );

        logger.log("completeDelegatorRemoval executed successfully, tx hash:", hash);
        lastHash = hash;
    }

    if (!lastHash) {
        throw new Error("No delegator removals processed");
    }

    return lastHash;
}

export async function claimOperatorFees(stakingVault: SafeSuzakuContract['StakingVault']) {
    return stakingVault.safeWrite.claimOperatorFees([]);
}

export async function claimEscrowedWithdrawal(stakingVault: SafeSuzakuContract['StakingVault'], recipient: Hex) {
    return stakingVault.safeWrite.claimEscrowedWithdrawal([recipient]);
}

// ── Keeper-imported functions ──────────────────────────────────────────
// These are exported for use by packages/keeper (keeper.ts imports them).
// The CLI already has inline commands for these via asyncAction.

export async function prepareWithdrawalsStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault']
) {
    const hash = await stakingVault.safeWrite.prepareWithdrawals([]);
    logger.log("prepareWithdrawals tx hash:", hash);
    await client.waitForTransactionReceipt({ hash });
}

export async function harvestValidatorsStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    operatorIndex: bigint,
    start: bigint,
    batchSize: bigint
) {
    const hash = await stakingVault.safeWrite.harvestValidators([operatorIndex, start, batchSize]);
    logger.log("harvestValidators tx hash:", hash);
    await client.waitForTransactionReceipt({ hash });
}

export async function harvestDelegatorsStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    operatorIndex: bigint,
    start: bigint,
    batchSize: bigint
) {
    const hash = await stakingVault.safeWrite.harvestDelegators([operatorIndex, start, batchSize]);
    logger.log("harvestDelegators tx hash:", hash);
    await client.waitForTransactionReceipt({ hash });
}

export async function claimWithdrawalsForStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault'],
    requestIds: bigint[]
) {
    const hash = await stakingVault.safeWrite.claimWithdrawalsFor([requestIds]);
    logger.log("claimWithdrawalsFor tx hash:", hash);
    await client.waitForTransactionReceipt({ hash });
}

// ── Info functions ─────────────────────────────────────────────────────

type StakingVaultContract = SuzakuContract['StakingVault'];

function fmt(amount: bigint, decimals: number): string {
    return formatUnits(amount, decimals);
}

/**
 * General overview of the vault
 */
export async function getGeneralInfo(stakingVault: StakingVaultContract, client: ExtendedClient) {
    const [
        totalPooledStake, totalSupply, exchangeRate, availableStake,
        totalValidatorStake, totalDelegatedStake, pendingWithdrawals,
        claimableWithdrawals, inFlightExiting, currentEpoch,
        lastEpochProcessed, decimals, symbol, owner, paused,
    ] = await stakingVault.multicall([
        'getTotalPooledStake', 'totalSupply', 'getExchangeRate', 'getAvailableStake',
        'getTotalValidatorStake', 'getTotalDelegatedStake', 'getPendingWithdrawals',
        'getClaimableWithdrawalStake', 'getInFlightExitingAmount', 'getCurrentEpoch',
        'getLastEpochProcessed', 'decimals', 'symbol', 'owner', 'paused',
    ]);

    const contractBalance = await client.getBalance({ address: stakingVault.address });

    logger.log(color.bold(`\n═══ General Info ═══`));
    logger.log(`  Owner:                   ${owner}`);
    logger.log(`  Paused:                  ${paused}`);
    logger.log(`  Symbol:                  ${symbol}`);
    logger.log(`  Total Pooled Stake:      ${fmt(totalPooledStake, decimals)} AVAX`);
    logger.log(`  Total Supply (LST):      ${fmt(totalSupply, decimals)} ${symbol}`);
    logger.log(`  Exchange Rate:           ${fmt(exchangeRate, decimals)}`);
    logger.log(`  Available Stake:         ${fmt(availableStake, decimals)} AVAX`);
    logger.log(`  Total Validator Stake:   ${fmt(totalValidatorStake, decimals)} AVAX`);
    logger.log(`  Total Delegated Stake:   ${fmt(totalDelegatedStake, decimals)} AVAX`);
    logger.log(`  Pending Withdrawals:     ${fmt(pendingWithdrawals, decimals)} AVAX`);
    logger.log(`  Claimable Withdrawals:   ${fmt(claimableWithdrawals, decimals)} AVAX`);
    logger.log(`  In-Flight Exiting:       ${fmt(inFlightExiting, decimals)} AVAX`);
    logger.log(`  Current Epoch:           ${currentEpoch}`);
    logger.log(`  Last Epoch Processed:    ${lastEpochProcessed}`);
    logger.log(`  Contract Balance:        ${formatUnits(contractBalance, 18)} AVAX`);
}

/**
 * Fees configuration
 */
export async function getFeesInfo(stakingVault: StakingVaultContract) {
    const [
        protocolFeeBips, protocolFeeRecipient, pendingProtocolFees,
        operatorFeeBips, totalAccruedOperatorFees, liquidityBufferBips, decimals,
    ] = await stakingVault.multicall([
        'getProtocolFeeBips', 'getProtocolFeeRecipient', 'getPendingProtocolFees',
        'getOperatorFeeBips', 'getTotalAccruedOperatorFees', 'getLiquidityBufferBips', 'decimals',
    ]);

    logger.log(color.bold(`\n═══ Fees Info ═══`));
    logger.log(`  Protocol Fee:            ${protocolFeeBips} bips (${Number(protocolFeeBips) / 100}%)`);
    logger.log(`  Protocol Fee Recipient:  ${protocolFeeRecipient}`);
    logger.log(`  Pending Protocol Fees:   ${fmt(pendingProtocolFees, decimals)} AVAX`);
    logger.log(`  Operator Fee:            ${operatorFeeBips} bips (${Number(operatorFeeBips) / 100}%)`);
    logger.log(`  Total Accrued Op. Fees:  ${fmt(totalAccruedOperatorFees, decimals)} AVAX`);
    logger.log(`  Liquidity Buffer:        ${liquidityBufferBips} bips (${Number(liquidityBufferBips) / 100}%)`);
}

/**
 * Operators overview
 */
export async function getOperatorsInfo(stakingVault: StakingVaultContract) {
    const [operatorList, maxOperators, maxValidatorsPerOp, decimals, symbol] = await stakingVault.multicall([
        'getOperatorList', 'getMaxOperators', 'getMaxValidatorsPerOperator', 'decimals', 'symbol',
    ]);

    logger.log(color.bold(`\n═══ Operators Info ═══`));
    logger.log(`  Max Operators:               ${maxOperators}`);
    logger.log(`  Max Validators/Operator:     ${maxValidatorsPerOp}`);
    logger.log(`  Registered Operators:        ${operatorList.length}`);

    let totalActive = 0;
    let totalAllocationBips = 0n;
    stakingVault.read.getOperatorCurrentEpochPendingAmount
    for (const operator of operatorList) {
        const [info, exitDebt, validators, delegators] = await stakingVault.multicall([
            { name: 'getOperatorInfo', args: [operator] },
            { name: 'getOperatorExitDebt', args: [operator] },
            { name: 'getOperatorValidators', args: [operator] },
            { name: 'getOperatorDelegators', args: [operator] },
        ]);

        if (info.active) totalActive++;
        totalAllocationBips += info.allocationBips;

        logger.log(`\n  ${color.cyan(operator)}:`);
        logger.log(`    Active:            ${info.active}`);
        logger.log(`    Allocation:        ${info.allocationBips} bips (${Number(info.allocationBips) / 100}%)`);
        logger.log(`    Active Stake:      ${fmt(info.activeStake, decimals)} AVAX`);
        logger.log(`    Accrued Fees:      ${fmt(info.accruedFees, decimals)} AVAX`);
        logger.log(`    Fee Recipient:     ${info.feeRecipient}`);
        logger.log(`    Exit Debt:         ${fmt(exitDebt, decimals)} AVAX`);
        logger.log(`    Validators:        ${validators.length}`);
        logger.log(`    Delegations:       ${delegators.length}`);
    }

    logger.log(`\n  ── Summary ──`);
    logger.log(`    Active / Total:        ${totalActive} / ${operatorList.length}`);
    logger.log(`    Total Allocation:      ${totalAllocationBips} bips (${Number(totalAllocationBips) / 100}%)`);
}

/**
 * Validators details per operator
 */
export async function getValidatorsInfo(stakingVault: StakingVaultContract) {
    const [operatorList, totalValidatorStake, maxValidatorStake, decimals] = await stakingVault.multicall([
        'getOperatorList', 'getTotalValidatorStake', 'getMaximumValidatorStake', 'decimals',
    ]);

    logger.log(color.bold(`\n═══ Validators Info ═══`));
    logger.log(`  Total Validator Stake:   ${fmt(totalValidatorStake, decimals)} AVAX`);
    logger.log(`  Max Validator Stake:     ${fmt(maxValidatorStake, decimals)} AVAX`);

    let totalValidators = 0;
    let totalPendingRemoval = 0;


    for (const operator of operatorList) {
        const [validatorIDs] = await stakingVault.multicall([
            { name: 'getOperatorValidators', args: [operator] },
        ]);

        if (validatorIDs.length === 0) continue;

        logger.log(`\n  Operator ${color.cyan(operator)} (${validatorIDs.length} validators):`);

        // Batch all validator queries in a single multicall
        const queries = validatorIDs.flatMap(id => [
            { name: 'getValidatorStakeAmount' as const, args: [id] as const },
            { name: 'isValidatorPendingRemoval' as const, args: [id] as const },
        ]);
        const results = await stakingVault.multicall(queries);

        for (let i = 0; i < validatorIDs.length; i++) {
            const stakeAmount = results[i * 2] as bigint;
            const pendingRemoval = results[i * 2 + 1] as boolean;
            totalValidators++;
            if (pendingRemoval) totalPendingRemoval++;

            logger.log(`    ${validatorIDs[i]}`);
            logger.log(`      Stake:           ${fmt(stakeAmount, decimals)} AVAX`);
            logger.log(`      Pending Removal: ${pendingRemoval}`);
        }
    }

    logger.log(`\n  ── Summary ──`);
    logger.log(`    Total Validators:      ${totalValidators}`);
    logger.log(`    Pending Removal:       ${totalPendingRemoval}`);
}

/**
 * Delegations details per operator
 */
export async function getDelegatorsInfo(stakingVault: StakingVaultContract) {
    const [operatorList, totalDelegatedStake, maxDelegatorStake, decimals] = await stakingVault.multicall([
        'getOperatorList', 'getTotalDelegatedStake', 'getMaximumDelegatorStake', 'decimals',
    ]);

    logger.log(color.bold(`\n═══ Delegators Info ═══`));
    logger.log(`  Total Delegated Stake:   ${fmt(totalDelegatedStake, decimals)} AVAX`);
    logger.log(`  Max Delegator Stake:     ${fmt(maxDelegatorStake, decimals)} AVAX`);

    let totalDelegations = 0;

    for (const operator of operatorList) {
        const [delegatorIDs] = await stakingVault.multicall([
            { name: 'getOperatorDelegators', args: [operator] },
        ]);

        if (delegatorIDs.length === 0) continue;

        logger.log(`\n  Operator ${color.cyan(operator)} (${delegatorIDs.length} delegations):`);

        // Batch all delegator queries
        const queries = delegatorIDs.map(id => ({
            name: 'getDelegatorInfo' as const,
            args: [id] as const,
        }));
        const results = await stakingVault.multicall(queries);

        for (let i = 0; i < delegatorIDs.length; i++) {
            const info = results[i] as { validationID: Hex; isVaultOwnedValidator: boolean; operator: Hex };
            totalDelegations++;

            logger.log(`    ${delegatorIDs[i]}`);
            logger.log(`      Target Validator:     ${info.validationID}`);
            logger.log(`      Vault-Owned Validator: ${info.isVaultOwnedValidator}`);
            logger.log(`      Operator:             ${info.operator}`);
        }
    }

    logger.log(`\n  ── Summary ──`);
    logger.log(`    Total Delegations:     ${totalDelegations}`);
}

/**
 * Withdrawal queue info
 */
export async function getWithdrawalsInfo(stakingVault: StakingVaultContract) {
    const [
        queueLength, queueHead, pendingWithdrawals, claimableWithdrawals,
        totalExitDebt, currentEpoch, lastEpochProcessed, epochDuration, decimals,
    ] = await stakingVault.multicall([
        'getWithdrawalQueueLength', 'getQueueHead', 'getPendingWithdrawals', 'getClaimableWithdrawalStake',
        'getTotalExitDebt', 'getCurrentEpoch', 'getLastEpochProcessed', 'getEpochDuration', 'decimals',
    ]);

    logger.log(color.bold(`\n═══ Withdrawals Info ═══`));
    logger.log(`  Queue Length:            ${queueLength}`);
    logger.log(`  Queue Head:              ${queueHead}`);
    logger.log(`  Pending Withdrawals:     ${fmt(pendingWithdrawals, decimals)} AVAX`);
    logger.log(`  Claimable Withdrawals:   ${fmt(claimableWithdrawals, decimals)} AVAX`);
    logger.log(`  Total Exit Debt:         ${fmt(totalExitDebt, decimals)} AVAX`);
    logger.log(`  Current Epoch:           ${currentEpoch}`);
    logger.log(`  Last Epoch Processed:    ${lastEpochProcessed}`);
    logger.log(`  Epoch Duration:          ${epochDuration}s`);
}

/**
 * Epoch info
 */
export async function getEpochInfo(stakingVault: StakingVaultContract) {
    const [currentEpoch, epochDuration, lastEpochProcessed, minStakeDuration] = await stakingVault.multicall([
        'getCurrentEpoch', 'getEpochDuration', 'getLastEpochProcessed', 'getMinimumStakeDuration',
    ]);

    const epochsBehind = currentEpoch - lastEpochProcessed;

    logger.log(color.bold(`\n═══ Epoch Info ═══`));
    logger.log(`  Current Epoch:           ${currentEpoch}`);
    logger.log(`  Epoch Duration:          ${epochDuration}s`);
    logger.log(`  Last Epoch Processed:    ${lastEpochProcessed}`);
    logger.log(`  Epochs Behind:           ${epochsBehind}`);
    logger.log(`  Min Stake Duration:      ${minStakeDuration}s`);
}
