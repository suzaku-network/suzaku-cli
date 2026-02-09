import { ExtendedWalletClient } from './client';
import { Config } from './config';
import { CurriedSuzakuContractMap, SafeSuzakuContract, withSafeWrite } from './lib/viemUtils';
import { parseUnits, parseEventLogs, Hex, hexToBytes, bytesToHex } from 'viem';
import { logger } from './lib/logger';
import { parseNodeID, NodeId, encodeNodeID, retryWhileError } from './lib/utils';
import { getContract } from 'viem';
import { color } from 'console-log-colors';
import { collectSignatures, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from './lib/warpUtils';
import { getValidationUptimeMessage } from './uptime';
import { getCurrentValidators, registerL1Validator, setValidatorWeight } from './lib/pChainUtils';
import { GetRegistrationJustification } from './lib/justification';
import { pipe, R } from '@mobily/ts-belt';
import { utils } from '@avalabs/avalanchejs';
import { pChainChainID } from './config';

/**
 * Deposit native tokens (AVAX) into the StakingVault
 * @param client - The wallet client
 * @param stakingVault - The StakingVault contract instance
 * @param amount - Amount to deposit in AVAX (will be converted to wei with 9 decimals)
 * @param minShares - Minimum shares expected from the deposit (slippage protection)
 */
export async function depositStakingVault(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
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
        }) as any[];

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
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
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
        }) as any[];

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
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
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
        }) as any[];

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
    stakingVault: SafeSuzakuContract['StakingVaultFull']
) {
    logger.log("Processing epoch in StakingVault...");

    logger.log("\n=== Process Epoch Details ===");
    logger.log("Vault address:", stakingVault.address);

    // Call processEpoch
    const hash = await stakingVault.safeWrite.processEpoch([]);

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
        }) as any[];

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
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
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
        }) as any[];

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
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
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
        }) as any[];

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
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    blsProofOfPossession: string,
    initiateTxHash: Hex,
    initialBalance: bigint,
    waitValidatorVisible: boolean
) {
    logger.log("Completing validator registration in StakingVault...");

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
    }) as any[];

    if (!warpLogs || warpLogs.length === 0) {
        logger.error(color.red("No IWarpMessenger event found in the transaction logs."));
        process.exit(1);
    }

    const warpLog = warpLogs[0];

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
        const signedMessage = await collectSignatures(client.network, RegisterL1ValidatorUnsignedWarpMsg);

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
    const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex);

    // Convert the signed warp message to bytes and pack into access list
    const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
    const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

    logger.log("\nCalling function completeValidatorRegistration...");
    const hash = await stakingVault.safeWrite.completeValidatorRegistration(
        [messageIndex],
        {
            account: client.account!,
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
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
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
        }) as any[];

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
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    initiateRemovalTxHash: Hex,
    waitValidatorVisible: boolean,
    nodeIDs?: NodeId[],
    initiateTxHash?: Hex
) {
    logger.log("Completing validator removal in StakingVault...");

    // Wait for the initiate removal transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

    // Parse StakingVault__ValidatorRemovalInitiated events from StakingVaultOperations
    const validatorRemovalInitiatedEvents = parseEventLogs({
        abi: stakingVault.abi,
        logs: receipt.logs,
        eventName: 'StakingVault__ValidatorRemovalInitiated'
    }) as any[];

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
    }) as any[];

    const subnetIDHex = await validatorManager.read.subnetID();
    const currentValidators = await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)));

    // Find InitiatedValidatorRemoval events from ValidatorManager to get weight message info
    const validatorManagerRemovalEvents = parseEventLogs({
        abi: validatorManager.abi,
        logs: receipt.logs,
        eventName: 'InitiatedValidatorRemoval'
    }) as any[];

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
            const signedL1ValidatorWeightMessage = await collectSignatures(client.network, unsignedL1ValidatorWeightMessage);
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
        const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex, bytesToHex(justification as Uint8Array));
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
            await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeID), 5000, 180000, (res) => res === false);
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
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
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

    // Get StakingVaultOperations contract instance pointing to StakingVault address
    // (StakingVault uses delegatecall to forward to operations implementation)
    // Skip ABI validation since functions are forwarded via fallback
    const stakingVaultOperationsContract = getContract({
        abi: config.abis.StakingVaultOperations,
        address: stakingVault.address,
        client: config.client,
    });

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
        }) as any[];

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
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    initiateTxHash: Hex,
    rpcUrl: string,
    uptimeBlockchainID: Hex
): Promise<Hex> {
    logger.log("Completing delegator registration in StakingVault...");

    // Wait for the initiate delegator registration transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls resend the initiate delegator registration transaction`);

    // Get StakingVaultOperations contract instance pointing to StakingVault address
    const stakingVaultOperationsContract = getContract({
        abi: config.abis.StakingVaultOperations,
        address: stakingVault.address,
        client: config.client,
    });

    // Parse StakingVault__DelegatorRegistrationInitiated event from StakingVaultOperations
    const delegatorRegisteredEvents = parseEventLogs({
        abi: stakingVault.abi,
        logs: receipt.logs,
        eventName: 'StakingVault__DelegatorRegistrationInitiated'
    }) as any[];

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
    }) as any[];

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
    }) as any[];

    const weightWarpLog = warpLogs.find((w) => w.args.messageID === setWeightMessageID);
    if (!weightWarpLog) {
        logger.error(color.red("No matching warp message found for setWeightMessageID, verify the transaction hash."));
        process.exit(1);
    }

    // Get the unsigned L1ValidatorWeightMessage
    const unsignedL1ValidatorWeightMessage = weightWarpLog.args.message;

    // Aggregate signatures from validators for the weight message
    logger.log("\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
    const signedL1ValidatorWeightMessage = await collectSignatures(client.network, unsignedL1ValidatorWeightMessage);
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

    // Aggregate signatures from validators for the P-Chain weight message
    logger.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
    const signedPChainWeightMessage = await collectSignatures(client.network, unsignedPChainWeightWarpMsgHex);
    logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

    // Get the uptime message
    // Use the uptimeBlockchainID passed as parameter (same as KiteStakingManager settings)
    const warpNetworkID = client.network === 'fuji' ? 5 : 1;
    const sourceChainID = utils.base58check.encode(hexToBytes(uptimeBlockchainID));
    logger.log("\nGetting validation uptime message...");
    const signedUptimeMessage = await getValidationUptimeMessage(
        client.network,
        rpcUrl,
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
 * @param config - The config object
 * @param stakingVaultAddress - The StakingVault contract address
 * @param delegationID - The delegation ID to remove
 */
export async function initiateDelegatorRemovalStakingVault(
    client: ExtendedWalletClient,
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
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
        }) as any[];

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
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVaultFull'],
    validatorManager: SafeSuzakuContract['ValidatorManager'],
    initiateRemovalTxHash: Hex,
    waitValidatorVisible: boolean,
    delegationIDs?: Hex[],
    initiateTxHash?: Hex
): Promise<Hex> {
    logger.log("Completing delegator removal in StakingVault...");

    // Wait for the initiate removal transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

    // Parse StakingVault__DelegatorRemovalInitiated events from StakingVaultOperations
    const delegatorRemovalInitiatedEvents = parseEventLogs({
        abi: stakingVault.abi,
        logs: receipt.logs,
        eventName: 'StakingVault__DelegatorRemovalInitiated'
    }) as any[];

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
    }) as any[];

    const subnetIDHex = await validatorManager.read.subnetID();
    const currentValidators = await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)));

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
            }) as any[];

            if (registrationEvents.some((e) => e.args?.delegationID === delegationID)) {
                addNodeBlockNumber = addNodeReceipt.blockNumber;
            }
        }

        // Look for InitiatedValidatorWeightUpdate events from ValidatorManager (similar to completeWeightUpdate)
        const initiatedValidatorWeightUpdates = parseEventLogs({
            abi: validatorManager.abi,
            logs: receipt.logs,
            eventName: 'InitiatedValidatorWeightUpdate'
        }).filter((e) => e.args.validationID === validationID) as any[];

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

        const unsignedL1ValidatorWeightMessage = warpLog.args.message;
        const weight = weightUpdateEvent.args.weight;
        const nonce = weightUpdateEvent.args.nonce;

        // Aggregate signatures from validators for the weight message
        logger.log("\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
        const signedL1ValidatorWeightMessage = await collectSignatures(client.network, unsignedL1ValidatorWeightMessage);
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
        const signedPChainMessage = await collectSignatures(client.network, unsignedPChainWarpMsgHex);
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

        if (waitValidatorVisible) {
            logger.log("Waiting for the validator to be removed from the P-Chain (may take a while)...");
            await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeID), 5000, 180000, (res) => res === false);
        }

        logger.log("completeDelegatorRemoval executed successfully, tx hash:", hash);
        lastHash = hash;
    }

    if (!lastHash) {
        throw new Error("No delegator removals processed");
    }

    return lastHash;
}
