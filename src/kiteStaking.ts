import { Account, bytesToHex, Hex, hexToBytes, parseEventLogs } from "viem";
import { ExtendedWalletClient } from "./client";
import { Config, pChainChainID } from "./config";
import { SafeSuzakuContract } from "./lib/viemUtils";
import { encodeNodeID, NodeId, parseNodeID, retryWhileError } from "./lib/utils";
import { logger } from './lib/logger';
import { color } from "./lib/safeColors";
import { collectSignatures, getSigningSubnetIdFromWarpMessage, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from "./lib/warpUtils";
import { getCurrentValidators, registerL1Validator, setValidatorWeight } from "./lib/pChainUtils";
import { pipe, R } from "@mobily/ts-belt";
import { GetRegistrationJustification } from "./lib/justification";
import { utils } from "@avalabs/avalanchejs";
import { getValidationUptimeMessage } from "./uptime";

export async function updateStakingConfig(
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    minimumStakeAmount: bigint,
    maximumStakeAmount: bigint,
    minimumStakeDuration: bigint,
    minimumDelegationFeeBips: number,
    maximumStakeMultiplier: number
) {
    logger.log("Updating staking config...");

    const hash = await kiteStakingManager.safeWrite.updateStakingConfig([
        minimumStakeAmount,
        maximumStakeAmount,
        minimumStakeDuration,
        minimumDelegationFeeBips,
        maximumStakeMultiplier
    ]);

    logger.log("updateStakingConfig executed successfully, tx hash:", hash);
    return hash;
}

export async function initiateValidatorRegistration(
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    nodeId: NodeId,
    blsKey: Hex,
    remainingBalanceOwner: [number, Hex[]],
    disableOwner: [number, Hex[]],
    delegationFeeBips: number,
    minStakeDuration: bigint,
    rewardRecipient: Hex,
    initialStake: bigint
) {
    logger.log("Initiating validator registration...");

    // Parse NodeID to bytes32 format
    const nodeIdHex32 = parseNodeID(nodeId, false)

    const hash = await kiteStakingManager.safeWrite.initiateValidatorRegistration(
        [
            nodeIdHex32,
            blsKey,
            { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] },
            { threshold: disableOwner[0], addresses: disableOwner[1] },
            delegationFeeBips,
            minStakeDuration,
            rewardRecipient
        ],
        {
            value: initialStake,
            chain: null
        }
    );

    logger.log("initiateValidatorRegistration executed successfully, tx hash:", hash);
    return hash;
}

export async function initiateDelegatorRegistration(
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    config: Config,
    nodeId: NodeId,
    rewardRecipient: Hex,
    stakeAmount: bigint
): Promise<Hex> {
    logger.log("Initiating delegator registration...");

    // Get ValidatorManager from settings
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await config.contracts.ValidatorManager(settings.manager);

    // Parse NodeID to bytes format (20 bytes, no padding)
    const nodeIdBytes = parseNodeID(nodeId, false);

    // Get validationID from ValidatorManager
    const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);

    const txHash = await kiteStakingManager.safeWrite.initiateDelegatorRegistration([
        validationID,
        rewardRecipient
    ], {
        value: stakeAmount,
        chain: null
    });

    logger.log("initiateDelegatorRegistration executed successfully, tx hash:", txHash);
    return txHash;
}

export async function initiateDelegatorRemoval(
    client: ExtendedWalletClient,
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    config: Config,
    delegationID: Hex,
    includeUptimeProof: boolean,
    rpcUrl?: string
): Promise<Hex> {
    logger.log("Initiating delegator removal...");

    // messageIndex is always 0 for KiteStakingManager
    const messageIndex = 0;

    // If uptime proof is required, fetch and pack it into access list
    let accessList: Array<{ address: Hex; storageKeys: Hex[] }> | undefined = undefined;

    if (includeUptimeProof) {
        if (!rpcUrl) {
            logger.error(color.red("RPC URL is required when includeUptimeProof is true."));
            process.exit(1);
        }

        // Get ValidatorManager from settings
        const settings = await kiteStakingManager.read.getStakingManagerSettings();
        const validatorManager = await config.contracts.ValidatorManager(settings.manager);

        // Get delegator info to get validationID
        const delegatorInfo = await kiteStakingManager.read.getDelegatorInfo([delegationID]);
        const validationID = delegatorInfo.validationID;

        // Get the validator info to get nodeID
        const validator = await validatorManager.read.getValidator([validationID]);
        const nodeId = encodeNodeID(validator.nodeID as Hex);

        // Get the uptime message
        const warpNetworkID = client.network === 'fuji' ? 5 : 1;
        const sourceChainID = utils.base58check.encode(hexToBytes(settings.uptimeBlockchainID));
        logger.log("\nGetting validation uptime message...");
        const signedUptimeMessage = await getValidationUptimeMessage(
            client,
            rpcUrl,
            nodeId,
            warpNetworkID,
            sourceChainID
        );

        // Ensure signedUptimeMessage has 0x prefix
        const signedUptimeMessageHex = signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`;

        // Pack uptime message into access list
        const signedUptimeMessageBytes = hexToBytes(signedUptimeMessageHex as Hex);
        const uptimeAccessList = packWarpIntoAccessList(signedUptimeMessageBytes);
        accessList = [uptimeAccessList[0]];
    }

    const hash = await kiteStakingManager.safeWrite.initiateDelegatorRemoval(
        [delegationID, includeUptimeProof, messageIndex],
        accessList ? {
            account: client.account!,
            chain: null,
            accessList
        } : undefined
    );

    logger.log("initiateDelegatorRemoval executed successfully, tx hash:", hash);
    return hash;
}

export async function initiateValidatorRemoval(
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    config: Config,
    nodeId: NodeId,
    includeUptimeProof: boolean
) {
    logger.log("Initiating validator removal...");

    // Get ValidatorManager from settings
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await config.contracts.ValidatorManager(settings.manager);

    // Parse NodeID to bytes format (20 bytes, no padding)
    const nodeIdBytes = parseNodeID(nodeId, false);

    // Get validationID from ValidatorManager
    const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);

    // messageIndex is always 0 for KiteStakingManager
    const messageIndex = 0;

    const hash = await kiteStakingManager.safeWrite.initiateValidatorRemoval([
        validationID,
        includeUptimeProof,
        messageIndex
    ]);

    logger.log("initiateValidatorRemoval executed successfully, tx hash:", hash);
    return hash;
}

export async function completeDelegatorRegistration(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    config: Config,
    initiateTxHash: Hex,
    rpcUrl: string
): Promise<Hex> {
    logger.log("Completing delegator registration...");

    // Wait for the initiate delegator registration transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls resend the initiate delegator registration transaction`);

    // Get ValidatorManager from settings
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await config.contracts.ValidatorManager(settings.manager);

    // Parse InitiatedDelegatorRegistration event from KiteStakingManager
    const initiatedDelegatorRegistration = parseEventLogs({
        abi: kiteStakingManager.abi,
        logs: receipt.logs,
        eventName: 'InitiatedDelegatorRegistration'
    })[0];

    if (!initiatedDelegatorRegistration) {
        logger.error(color.red("No InitiatedDelegatorRegistration event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    const delegationID = initiatedDelegatorRegistration.args.delegationID;
    const validationID = initiatedDelegatorRegistration.args.validationID;
    const validatorWeight = initiatedDelegatorRegistration.args.validatorWeight;
    const nonce = initiatedDelegatorRegistration.args.nonce;
    const setWeightMessageID = initiatedDelegatorRegistration.args.setWeightMessageID;

    // Get the validator info to get nodeID
    const validator = await validatorManager.read.getValidator([validationID]);
    const nodeId = encodeNodeID(validator.nodeID as Hex);

    // Get warp logs to find the weight message
    const warpLogs = parseEventLogs({
        abi: config.abis.IWarpMessenger,
        logs: receipt.logs,
    });

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLogs[0].args.message);

    const weightWarpLog = warpLogs.find((w) => w.args.messageID === setWeightMessageID);
    if (!weightWarpLog) {
        logger.error(color.red("No matching warp message found for setWeightMessageID, verify the transaction hash."));
        process.exit(1);
    }

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

    // Aggregate signatures from validators for the P-Chain weight message
    logger.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
    const signedPChainWeightMessage = await collectSignatures({ network: client.network, message: unsignedPChainWeightWarpMsgHex, signingSubnetId });
    logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

    // Get the uptime message
    const warpNetworkID = client.network === 'fuji' ? 5 : 1;
    const sourceChainID = utils.base58check.encode(hexToBytes(settings.uptimeBlockchainID));
    logger.log("\nGetting validation uptime message...");
    const signedUptimeMessage = await getValidationUptimeMessage(
        client,
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

    // messageIndex is always 0 for KiteStakingManager
    const messageIndex = 0;
    const uptimeMessageIndex = 1;

    logger.log("\nCalling function completeDelegatorRegistration...");
    const hash = await kiteStakingManager.safeWrite.completeDelegatorRegistration(
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

export async function completeDelegatorRemoval(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    config: Config,
    initiateRemovalTxHash: Hex,
    rpcUrl: string,
    waitValidatorVisible: boolean,
    delegationIDs?: Hex[],
    initiateTxHash?: Hex
): Promise<Hex> {
    logger.log("Completing delegator removal...");

    // Wait for the initiate removal transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

    // Get ValidatorManager from settings
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await config.contracts.ValidatorManager(settings.manager);

    // Parse InitiatedDelegatorRemoval events from KiteStakingManager
    const initiatedDelegatorRemovals = parseEventLogs({
        abi: kiteStakingManager.abi,
        logs: receipt.logs,
        eventName: 'InitiatedDelegatorRemoval'
    });

    if (initiatedDelegatorRemovals.length === 0) {
        logger.error(color.red("No InitiatedDelegatorRemoval event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    // Filter by delegationIDs if provided
    const filteredRemovals = delegationIDs
        ? initiatedDelegatorRemovals.filter((e) => {
            const delegationID = e.args.delegationID;
            return delegationIDs.includes(delegationID);
        })
        : initiatedDelegatorRemovals;

    if (filteredRemovals.length === 0) {
        logger.error(color.red("No matching InitiatedDelegatorRemoval event found for the provided delegationIDs, verify the transaction hash and delegationIDs."));
        process.exit(1);
    }

    // Get warp logs
    const warpLogs = parseEventLogs({
        abi: config.abis.IWarpMessenger,
        logs: receipt.logs,
    });

    let lastHash: Hex | undefined;

    for (const event of filteredRemovals) {
        const delegationID = event.args.delegationID;
        const validationID = event.args.validationID;

        // Get the validator info to get nodeID
        const validator = await validatorManager.read.getValidator([validationID]);
        const nodeID = encodeNodeID(validator.nodeID as Hex);
        logger.log(`Processing removal for delegation ${delegationID}, node ${nodeID}`);

        // Get delegator info to find the registration block number
        const delegatorInfo = await kiteStakingManager.read.getDelegatorInfo([delegationID]);

        let addNodeBlockNumber = receipt.blockNumber;

        if (initiateTxHash) {
            const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 0 });
            if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls use another initiate tx`);

            // Check if this delegationID is in the registration event
            const registrationEvents = parseEventLogs({
                abi: kiteStakingManager.abi,
                logs: addNodeReceipt.logs,
                eventName: 'InitiatedDelegatorRegistration'
            });

            if (registrationEvents.some((e) => e.args.delegationID === delegationID)) {
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

        const unsignedL1ValidatorWeightMessage = warpLog.args.message;
        const weight = weightUpdateEvent.args.weight;
        const nonce = weightUpdateEvent.args.nonce;

        const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, unsignedL1ValidatorWeightMessage);

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
        const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, signingSubnetId });
        logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

        // Convert the signed warp message to bytes and pack into access list
        const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
        const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

        // messageIndex is always 0 for KiteStakingManager
        const messageIndex = 0;

        logger.log("\nCalling function completeDelegatorRemoval...");
        const hash = await kiteStakingManager.safeWrite.completeDelegatorRemoval(
            [delegationID, messageIndex],
            {
                account: client.account!,
                chain: null,
                accessList
            }
        );

        if (waitValidatorVisible) {
            const subnetIDHex = await validatorManager.read.subnetID();
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

export async function completeValidatorRegistration(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    config: Config,
    blsProofOfPossession: string,
    initiateTxHash: Hex,
    initialBalance: bigint,
    waitValidatorVisible: boolean
) {
    logger.log("Completing validator registration...");

    // Wait for transaction receipt to extract warp message and validation ID
    const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash });

    // Parse InitiatedStakingValidatorRegistration event from KiteStakingManager
    const initiatedStakingRegistration = parseEventLogs({
        abi: kiteStakingManager.abi,
        logs: receipt.logs,
        eventName: 'InitiatedStakingValidatorRegistration'
    })[0];

    if (!initiatedStakingRegistration) {
        logger.error(color.red("No InitiatedStakingValidatorRegistration event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    // Get ValidatorManager from settings
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await config.contracts.ValidatorManager(settings.manager);

    // Parse InitiatedValidatorRegistration event from ValidatorManager
    const initiatedValidatorRegistration = parseEventLogs({
        abi: validatorManager.abi,
        logs: receipt.logs,
        eventName: 'InitiatedValidatorRegistration'
    })[0];

    if (!initiatedValidatorRegistration) {
        logger.error(color.red("No InitiatedValidatorRegistration event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    // messageIndex is always 0 for KiteStakingManager
    const messageIndex = 0;

    const warpLogs = parseEventLogs({
        abi: config.abis.IWarpMessenger,
        logs: receipt.logs,
    })[0];

    if (!warpLogs) {
        logger.error(color.red("No IWarpMessenger event found in the transaction logs."));
        process.exit(1);
    }

    const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLogs.args.message);

    const validationIDHex = initiatedValidatorRegistration.args.validationID;
    const nodeId = encodeNodeID(initiatedValidatorRegistration.args.nodeID as Hex); // Convert bytes20 to NodeID format

    // Check if the node is still registered as a validator on the P-Chain
    const subnetIDHex = await validatorManager.read.subnetID();
    const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
    const isValidator = (await getCurrentValidators(client, subnetID)).some((v) => v.nodeID === nodeId);

    if (isValidator) {
        logger.log(color.yellow("Node is already registered as a validator on the P-Chain, skipping registerL1Validator call."));
    } else {
        // Get the unsigned warp message from the receipt
        const RegisterL1ValidatorUnsignedWarpMsg = warpLogs.args.message;

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

    logger.log("\nCalling function completeValidatorRegistration...");
    const hash = await kiteStakingManager.safeWrite.completeValidatorRegistration(
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
        await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeId), 5000, 180000, (res) => res === true);
    }

    logger.log("completeValidatorRegistration executed successfully, tx hash:", hash);
    return hash;
}

export async function completeValidatorRemoval(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    config: Config,
    initiateRemovalTxHash: Hex,
    waitValidatorVisible: boolean,
    nodeIDs?: NodeId[],
    initiateTxHash?: Hex[]
) {
    logger.log("Completing validator removal...");

    // Wait for the initiate removal transaction to be confirmed
    const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
    if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

    // Get ValidatorManager from settings
    const settings = await kiteStakingManager.read.getStakingManagerSettings();
    const validatorManager = await config.contracts.ValidatorManager(settings.manager);

    // Parse InitiatedValidatorRemoval events from ValidatorManager
    const initiatedValidatorRemovals = parseEventLogs({
        abi: validatorManager.abi,
        logs: receipt.logs,
        eventName: 'InitiatedValidatorRemoval'
    });

    if (initiatedValidatorRemovals.length === 0) {
        logger.error(color.red("No InitiatedValidatorRemoval event found in the transaction logs, verify the transaction hash."));
        process.exit(1);
    }

    // Filter by nodeIDs if provided
    // Note: InitiatedValidatorRemoval event doesn't include nodeID, so we need to get it from the validator
    const filteredRemovals = nodeIDs
        ? (await Promise.all(
            initiatedValidatorRemovals.map(async (e) => {
                const validator = await validatorManager.read.getValidator([e.args.validationID]);
                const nodeId = encodeNodeID(validator.nodeID as Hex);
                return { event: e, nodeId };
            })
        )).filter(({ nodeId }) => nodeIDs.includes(nodeId)).map(({ event }) => event)
        : initiatedValidatorRemovals;

    if (filteredRemovals.length === 0) {
        logger.error(color.red("No matching InitiatedValidatorRemoval event found for the provided NodeIDs, verify the transaction hash and NodeIDs."));
        process.exit(1);
    }

    const warpLogs = parseEventLogs({
        abi: config.abis.IWarpMessenger,
        logs: receipt.logs,
    });

    const subnetIDHex = await validatorManager.read.subnetID();
    const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
    const currentValidators = await getCurrentValidators(client, subnetID);

    for (const event of filteredRemovals) {
        const eventIndex = filteredRemovals.indexOf(event);
        const validationID = event.args.validationID;

        // Get nodeID from validator - ValidatorManager InitiatedValidatorRemoval doesn't include nodeID
        const validator = await validatorManager.read.getValidator([validationID]);
        const nodeID = encodeNodeID(validator.nodeID as Hex);
        logger.log(`Processing removal for node ${nodeID}`);

        // Find the corresponding warp log
        // ValidatorManager InitiatedValidatorRemoval event has validatorWeightMessageID field
        const warpLog = warpLogs.find((w) => {
            // Match by messageID - ValidatorManager event has validatorWeightMessageID
            return w.args.messageID === event.args.validatorWeightMessageID;
        });

        if (!warpLog) {
            logger.error(color.red(`No matching warp log found for validationID ${validationID}`));
            continue;
        }

        const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);

        let addNodeBlockNumber = receipt.blockNumber;

        if (initiateTxHash && initiateTxHash.length > eventIndex) {
            const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHash[eventIndex], confirmations: 0 });
            if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash[eventIndex]} reverted, pls use another initiate tx`);
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
            const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: unsignedL1ValidatorWeightMessage, signingSubnetId });
            logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

            // Call setValidatorWeight on the P-Chain with the signed L1ValidatorWeightMessage
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
        const justification = await GetRegistrationJustification(nodeID, validationID, subnetID, client, addNodeBlockNumber);
        if (!justification) {
            throw new Error("Justification not found for validator removal");
        }

        // Pack and sign the P-Chain warp message
        const validationIDBytes = hexToBytes(validationID);
        const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, client.network === 'fuji' ? 5 : 1, pChainChainID);
        const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

        // Aggregate signatures from validators
        const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: bytesToHex(justification), signingSubnetId });
        logger.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

        // Convert the signed warp message to bytes and pack into access list
        const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
        const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

        // messageIndex is always 0 for KiteStakingManager
        const messageIndex = 0;
        // Execute completeValidatorRemoval transaction
        logger.log("Executing completeValidatorRemoval transaction...");
        // Checking if the node was only in the vmc or also in the stakingManager
        const completeHash = await kiteStakingManager.safeWrite.completeValidatorRemoval(
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

// ─── Info Aggregators ────────────────────────────────────────────────────────

const NANOS_PER_AVAX = 1_000_000_000n;

function formatAvax(wei: bigint): string {
    const whole = wei / NANOS_PER_AVAX;
    const frac = wei % NANOS_PER_AVAX;
    return frac === 0n
        ? `${whole} AVAX`
        : `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '')} AVAX`;
}

function formatDuration(seconds: bigint): string {
    const s = Number(seconds);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function formatTimestamp(ts: bigint): string {
    if (ts === 0n) return 'never';
    return new Date(Number(ts) * 1000).toISOString();
}

/** Aggregate all global-level information from KiteStakingManager */
export async function getKiteStakingManagerInfo(
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager']
) {
    const [
        config,
        settings,
        rewardCalculator,
        rewardVault,
        owner,
        pendingOwner,
        bipsFactor,
        maxDelegationFeeBips,
        maxStakeMultiplierLimit,
    ] = await Promise.all([
        kiteStakingManager.read.getStakingConfig(),
        kiteStakingManager.read.getStakingManagerSettings(),
        kiteStakingManager.read.getRewardCalculator(),
        kiteStakingManager.read.getRewardVault(),
        kiteStakingManager.read.owner(),
        kiteStakingManager.read.pendingOwner(),
        kiteStakingManager.read.BIPS_CONVERSION_FACTOR(),
        kiteStakingManager.read.MAXIMUM_DELEGATION_FEE_BIPS(),
        kiteStakingManager.read.MAXIMUM_STAKE_MULTIPLIER_LIMIT(),
    ]);

    return {
        // Staking config
        minimumStakeAmount: config[0].toString(),
        maximumStakeAmount: config[1].toString(),
        minimumStakeDuration: config[2].toString(),
        minimumDelegationFeeBips: config[3].toString(),
        maximumStakeMultiplier: config[4].toString(),
        weightToValueFactor: config[5].toString(),
        // Addresses
        validatorManager: settings.manager,
        rewardCalculator,
        rewardVault,
        uptimeBlockchainID: settings.uptimeBlockchainID,
        // Ownership
        owner,
        pendingOwner,
        // Protocol constants
        BIPS_CONVERSION_FACTOR: bipsFactor,
        MAXIMUM_DELEGATION_FEE_BIPS: maxDelegationFeeBips,
        MAXIMUM_STAKE_MULTIPLIER_LIMIT: maxStakeMultiplierLimit,
        // Human-readable summaries
        formatted: {
            minimumStakeAmount: formatAvax(config[0]),
            maximumStakeAmount: formatAvax(config[1]),
            minimumStakeDuration: formatDuration(config[2]),
            minimumDelegationFeeBips: `${config[3] / 100}%`,
            maximumStakeMultiplier: `${config[4]}x`,
        },
    };
}

/** Aggregate all information for a specific validator by validationID */
export async function getValidatorFullInfo(
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    validationID: Hex
) {
    const [validator, pendingRewards, rewardInfo] = await Promise.all([
        kiteStakingManager.read.getStakingValidator([validationID]),
        kiteStakingManager.read.getValidatorPendingRewards([validationID]),
        kiteStakingManager.read.getValidatorRewardInfo([validationID]),
    ]);

    const [rewardRecipient, accruedRewards] = rewardInfo;

    return {
        validationID,
        // PoS validator info
        owner: validator.owner,
        delegationFeeBips: validator.delegationFeeBips,
        minStakeDuration: validator.minStakeDuration.toString(),
        uptimeSeconds: validator.uptimeSeconds.toString(),
        lastRewardClaimTime: validator.lastRewardClaimTime.toString(),
        lastClaimUptimeSeconds: validator.lastClaimUptimeSeconds.toString(),
        // Pending rewards
        stakingReward: pendingRewards[0].toString(),
        delegationFees: pendingRewards[1].toString(),
        totalPendingReward: pendingRewards[2].toString(),
        // Reward accounting
        rewardRecipient,
        accruedRewards: accruedRewards.toString(),
        // Human-readable
        formatted: {
            delegationFeeBips: `${validator.delegationFeeBips / 100}%`,
            minStakeDuration: formatDuration(validator.minStakeDuration),
            uptime: formatDuration(validator.uptimeSeconds),
            lastRewardClaimTime: formatTimestamp(validator.lastRewardClaimTime),
            stakingReward: formatAvax(pendingRewards[0]),
            delegationFees: formatAvax(pendingRewards[1]),
            totalPendingReward: formatAvax(pendingRewards[2]),
            accruedRewards: formatAvax(accruedRewards),
        },
    };
}

/** Aggregate all information for a specific delegator by delegationID */
export async function getDelegatorFullInfo(
    kiteStakingManager: SafeSuzakuContract['KiteStakingManager'],
    delegationID: Hex
) {
    const [delegator, pendingRewards, rewardInfo] = await Promise.all([
        kiteStakingManager.read.getDelegatorInfo([delegationID]),
        kiteStakingManager.read.getDelegatorPendingRewards([delegationID]),
        kiteStakingManager.read.getDelegatorRewardInfo([delegationID]),
    ]);

    const [rewardRecipient, accruedRewards] = rewardInfo;

    return {
        delegationID,
        // Delegator info
        status: delegator.status,
        owner: delegator.owner,
        validationID: delegator.validationID,
        weight: delegator.weight.toString(),
        startTime: delegator.startTime.toString(),
        startingNonce: delegator.startingNonce.toString(),
        endingNonce: delegator.endingNonce.toString(),
        lastRewardClaimTime: delegator.lastRewardClaimTime.toString(),
        lastClaimUptimeSeconds: delegator.lastClaimUptimeSeconds.toString(),
        // Pending rewards
        grossReward: pendingRewards[0].toString(),
        validatorFee: pendingRewards[1].toString(),
        netPendingReward: pendingRewards[2].toString(),
        // Reward accounting
        rewardRecipient,
        accruedRewards: accruedRewards.toString(),
        // Human-readable
        formatted: {
            startTime: formatTimestamp(delegator.startTime),
            lastRewardClaimTime: formatTimestamp(delegator.lastRewardClaimTime),
            grossReward: formatAvax(pendingRewards[0]),
            validatorFee: formatAvax(pendingRewards[1]),
            netPendingReward: formatAvax(pendingRewards[2]),
            accruedRewards: formatAvax(accruedRewards),
        },
    };
}
