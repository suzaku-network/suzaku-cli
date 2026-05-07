import { bytesToHex, fromBytes, Hex, hexToBytes, parseEventLogs, parseUnits } from "viem";
import { generateClient } from "./client";
import { cb58ToHex, encodeNodeID, NodeId, parseNodeID, retryWhileError } from "./lib/utils";
import { logger } from './lib/logger';
import { color } from "console-log-colors";
import { collectSignatures, getSigningSubnetIdFromWarpMessage, packL1ValidatorRegistration, packL1ValidatorWeightMessage, packWarpIntoAccessList } from "./lib/warpUtils";
import { getCurrentValidators, registerL1Validator, setValidatorWeight } from "./lib/pChainUtils";
import { pipe, R } from "@mobily/ts-belt";
import { GetRegistrationJustification } from "../packages/suzaku-sdk/src/core/lib/justification";
import { utils } from "@avalabs/avalanchejs";
import { getCurrentValidatorsFromNode, getValidationUptimeMessage } from "./uptime";
import { chainList, getKiteStakingManager, getValidatorManager, IWarpMessengerABI, pChainChainID } from "@suzaku-sdk/core";
import { ArgAddress, ArgBLSPOP, ArgHex, ArgNodeID, ArgNumber, collectMultiple, OptAddress, ParserAddress, ParserHex, ParserNodeID, ParserNumber, ParserPrivateKey, ParseUnits } from "./lib/cliParser";
import { SuzakuCliProgram } from "./cli";
import { Option } from '@commander-js/extra-typings'
import { requirePChainBallance } from "@suzaku-sdk/node";

export const optKiteStakingManagerAddress = OptAddress("--staking-manager-address <address>", "KiteStakingManager contract address");

const NANOS_PER_AVAX = 1_000_000_000n;

function formatKITE(wei: bigint): string {
    const whole = wei / NANOS_PER_AVAX;
    const frac = wei % NANOS_PER_AVAX;
    return frac === 0n
        ? `${whole} KITE`
        : `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '')} KITE`;
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

/**
 * --------------------------------------------------
 * KITE STAKING MANAGER
 * --------------------------------------------------
 */
export function kiteStakingManagerCommands(program: SuzakuCliProgram) {
const kiteStakingManagerCmd = program
    .command("kite-staking-manager")
    .alias("ksm")
    .description("Commands to interact with KiteStakingManager contracts")
    .hook("preSubcommand", () => {
        const opts = program.opts();
        const newNet = opts.network === "custom" ? opts.network : chainList[opts.network].testnet ? "kiteaitestnet" : "kiteai";
        program.setOptionValue("network", newNet);
    })

kiteStakingManagerCmd
    .command("info")
    .description("Get global clienturation from KiteStakingManager")
    .addOption(optKiteStakingManagerAddress)
    .asyncAction(async (client, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
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
        const info = {
            minimumStakeAmount: config[0].toString(),
            maximumStakeAmount: config[1].toString(),
            minimumStakeDuration: config[2].toString(),
            minimumDelegationFeeBips: config[3].toString(),
            maximumStakeMultiplier: config[4].toString(),
            weightToValueFactor: config[5].toString(),
            validatorManager: settings.manager,
            rewardCalculator,
            rewardVault,
            uptimeBlockchainID: settings.uptimeBlockchainID,
            owner,
            pendingOwner,
            BIPS_CONVERSION_FACTOR: bipsFactor,
            MAXIMUM_DELEGATION_FEE_BIPS: maxDelegationFeeBips,
            MAXIMUM_STAKE_MULTIPLIER_LIMIT: maxStakeMultiplierLimit,
            formatted: {
                minimumStakeAmount: formatKITE(config[0]),
                maximumStakeAmount: formatKITE(config[1]),
                minimumStakeDuration: formatDuration(config[2]),
                minimumDelegationFeeBips: `${config[3] / 100}%`,
                maximumStakeMultiplier: `${config[4]}x`,
            },
        };
        logger.logJsonTree(info);
    });

kiteStakingManagerCmd
    .command("info-validator")
    .description("Get comprehensive information for a validator on KiteStakingManager")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgHex("validationID", "Validation ID of the validator"))
    .asyncAction(async (client, validationID, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const [validator, pendingRewards, rewardInfo] = await Promise.all([
            kiteStakingManager.read.getStakingValidator([validationID]),
            kiteStakingManager.read.getValidatorPendingRewards([validationID]),
            kiteStakingManager.read.getValidatorRewardInfo([validationID]),
        ]);
        const [rewardRecipient, accruedRewards] = rewardInfo;
        const info = {
            validationID,
            owner: validator.owner,
            delegationFeeBips: validator.delegationFeeBips,
            minStakeDuration: validator.minStakeDuration.toString(),
            uptimeSeconds: validator.uptimeSeconds.toString(),
            lastRewardClaimTime: validator.lastRewardClaimTime.toString(),
            lastClaimUptimeSeconds: validator.lastClaimUptimeSeconds.toString(),
            stakingReward: pendingRewards[0].toString(),
            delegationFees: pendingRewards[1].toString(),
            totalPendingReward: pendingRewards[2].toString(),
            rewardRecipient,
            accruedRewards: accruedRewards.toString(),
            formatted: {
                delegationFeeBips: `${validator.delegationFeeBips / 100}%`,
                minStakeDuration: formatDuration(validator.minStakeDuration),
                uptime: formatDuration(validator.uptimeSeconds),
                lastRewardClaimTime: formatTimestamp(validator.lastRewardClaimTime),
                stakingReward: formatKITE(pendingRewards[0]),
                delegationFees: formatKITE(pendingRewards[1]),
                totalPendingReward: formatKITE(pendingRewards[2]),
                accruedRewards: formatKITE(accruedRewards),
            },
        };
        logger.logJsonTree(info);
    });

kiteStakingManagerCmd
    .command("info-delegator")
    .description("Get comprehensive information for a delegator on KiteStakingManager")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgHex("delegationID", "Delegation ID of the delegator"))
    .asyncAction(async (client, delegationID, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const [delegator, pendingRewards, rewardInfo] = await Promise.all([
            kiteStakingManager.read.getDelegatorInfo([delegationID]),
            kiteStakingManager.read.getDelegatorPendingRewards([delegationID]),
            kiteStakingManager.read.getDelegatorRewardInfo([delegationID]),
        ]);
        const [rewardRecipient, accruedRewards] = rewardInfo;
        const info = {
            delegationID,
            status: delegator.status,
            owner: delegator.owner,
            validationID: delegator.validationID,
            weight: delegator.weight.toString(),
            startTime: delegator.startTime.toString(),
            startingNonce: delegator.startingNonce.toString(),
            endingNonce: delegator.endingNonce.toString(),
            lastRewardClaimTime: delegator.lastRewardClaimTime.toString(),
            lastClaimUptimeSeconds: delegator.lastClaimUptimeSeconds.toString(),
            grossReward: pendingRewards[0].toString(),
            validatorFee: pendingRewards[1].toString(),
            netPendingReward: pendingRewards[2].toString(),
            rewardRecipient,
            accruedRewards: accruedRewards.toString(),
            formatted: {
                startTime: formatTimestamp(delegator.startTime),
                lastRewardClaimTime: formatTimestamp(delegator.lastRewardClaimTime),
                grossReward: formatKITE(pendingRewards[0]),
                validatorFee: formatKITE(pendingRewards[1]),
                netPendingReward: formatKITE(pendingRewards[2]),
                accruedRewards: formatKITE(accruedRewards),
            },
        };
        logger.logJsonTree(info);
    });

kiteStakingManagerCmd
    .command("update-staking-client")
    .description("Update staking clienturation")
    .addOption(optKiteStakingManagerAddress)
    .argument("minimumStakeAmount", "Minimum stake amount")
    .argument("maximumStakeAmount", "Maximum stake amount")
    .argument("minimumStakeDuration", "Minimum stake duration in seconds")
    .addArgument(ArgNumber("minimumDelegationFeeBips", "Minimum delegation fee in basis points"))
    .addArgument(ArgNumber("maximumStakeMultiplier", "Maximum stake multiplier"))
    .asyncAction({ signer: true }, async (client, minimumStakeAmount, maximumStakeAmount, minimumStakeDuration, minimumDelegationFeeBips, maximumStakeMultiplier, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const minimumStakeAmountWei = parseUnits(minimumStakeAmount, 18);
        const maximumStakeAmountWei = parseUnits(maximumStakeAmount, 18);
        const minimumStakeDurationBigInt = BigInt(minimumStakeDuration);
        logger.log("Updating staking config...");
        const hash = await kiteStakingManager.safeWrite.updateStakingConfig([
            minimumStakeAmountWei,
            maximumStakeAmountWei,
            minimumStakeDurationBigInt,
            minimumDelegationFeeBips,
            maximumStakeMultiplier
        ]);
        logger.log("updateStakingConfig executed successfully, tx hash:", hash);
    });

kiteStakingManagerCmd
    .command("initiate-validator-registration")
    .description("Initiate validator registration on KiteStakingManager")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgNodeID())
    .addArgument(ArgHex("blsKey", "BLS public key"))
    .addArgument(ArgNumber("delegationFeeBips", "Delegation fee in basis points"))
    .argument("minStakeDuration", "Minimum stake duration in seconds")
    .addArgument(ArgAddress("rewardRecipient", "Reward recipient address"))
    .argument("stakeAmount", "Initial stake amount")
    .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
    .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
    .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
    .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
    .asyncAction({ signer: true }, async (client, nodeId, blsKey, delegationFeeBips, minStakeDuration, rewardRecipient, stakeAmount, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex');

        const remainingBalanceOwnerAddress = options.pchainRemainingBalanceOwnerAddress.length > 0 ? options.pchainRemainingBalanceOwnerAddress : [defaultOwnerAddress];
        const disableOwnerAddress = options.pchainDisableOwnerAddress.length > 0 ? options.pchainDisableOwnerAddress : [defaultOwnerAddress];
        const remainingBalanceOwner: [number, Hex[]] = [Number(options.pchainRemainingBalanceOwnerThreshold), remainingBalanceOwnerAddress];
        const disableOwner: [number, Hex[]] = [Number(options.pchainDisableOwnerThreshold), disableOwnerAddress];

        const stakeAmountWei = parseUnits(stakeAmount, 18);
        const minStakeDurationBigInt = BigInt(minStakeDuration);

        logger.log("Initiating validator registration...");
        const nodeIdHex32 = parseNodeID(nodeId, false);
        const hash = await kiteStakingManager.safeWrite.initiateValidatorRegistration(
            [
                nodeIdHex32,
                blsKey,
                { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] },
                { threshold: disableOwner[0], addresses: disableOwner[1] },
                delegationFeeBips,
                minStakeDurationBigInt,
                rewardRecipient
            ],
            { value: stakeAmountWei, chain: null }
        );
        logger.log("initiateValidatorRegistration executed successfully, tx hash:", hash);
    });

kiteStakingManagerCmd
    .command("complete-validator-registration")
    .description("Complete validator registration on the P-Chain and on the KiteStakingManager after initiating registration")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgHex("initiateTxHash", "Initiate validator registration transaction hash"))
    .addArgument(ArgBLSPOP())
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01'))
    .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
    .asyncAction({ signer: true }, async (client, initiateTxHash, blsProofOfPossession, options) => {
        const opts = program.opts();
        if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
        const initialBalance = ParseUnits(options.initialBalance, 9, 'Invalid initial balance');
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;

        logger.log("Completing validator registration...");
        const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash });

        const initiatedStakingRegistration = parseEventLogs({
            abi: kiteStakingManager.abi,
            logs: receipt.logs,
            eventName: 'InitiatedStakingValidatorRegistration'
        })[0];
        if (!initiatedStakingRegistration) {
            logger.error(color.red("No InitiatedStakingValidatorRegistration event found in the transaction logs, verify the transaction hash."));
            process.exit(1);
        }

        const settings = await kiteStakingManager.read.getStakingManagerSettings();
        const validatorManager = await getValidatorManager(client, settings.manager);

        const initiatedValidatorRegistration = parseEventLogs({
            abi: validatorManager.abi,
            logs: receipt.logs,
            eventName: 'InitiatedValidatorRegistration'
        })[0];
        if (!initiatedValidatorRegistration) {
            logger.error(color.red("No InitiatedValidatorRegistration event found in the transaction logs, verify the transaction hash."));
            process.exit(1);
        }

        const messageIndex = 0;
        const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs })[0];
        if (!warpLogs) {
            logger.error(color.red("No IWarpMessenger event found in the transaction logs."));
            process.exit(1);
        }

        const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLogs.args.message);
        const validationIDHex = initiatedValidatorRegistration.args.validationID;
        const nodeId = encodeNodeID(initiatedValidatorRegistration.args.nodeID as Hex);

        const subnetIDHex = await validatorManager.read.subnetID();
        const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
        const isValidator = (await getCurrentValidators(client, subnetID)).some((v) => v.nodeID === nodeId);

        if (isValidator) {
            logger.log(color.yellow("Node is already registered as a validator on the P-Chain, skipping registerL1Validator call."));
        } else {
            const RegisterL1ValidatorUnsignedWarpMsg = warpLogs.args.message;
            logger.log("\nCollecting signatures for the L1ValidatorRegistrationMessage from the Validator Manager chain...");
            const signedMessage = await collectSignatures({ network: client.network, message: RegisterL1ValidatorUnsignedWarpMsg, signingSubnetId });
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

        const validationIDBytes = hexToBytes(validationIDHex as Hex);
        const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, true, client.network === 'fuji' ? 5 : 1, pChainChainID);
        const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

        logger.log("\nAggregating signatures for the L1ValidatorRegistrationMessage from the P-Chain...");
        const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, signingSubnetId });

        const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
        const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);

        logger.log("\nCalling function completeValidatorRegistration...");
        const hash = await kiteStakingManager.safeWrite.completeValidatorRegistration(
            [messageIndex],
            { account: client.account!, chain: null, accessList }
        );

        if (!options.skipWaitApi) {
            logger.log("Waiting for the validator to be visible on the P-Chain (may take a while)...");
            await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeId), 5000, 180000, (res) => res === true);
        }

        logger.log("completeValidatorRegistration executed successfully, tx hash:", hash);
    });

kiteStakingManagerCmd
    .command("initiate-delegator-registration")
    .description("Initiate delegator registration on KiteStakingManager")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgNodeID())
    .addArgument(ArgAddress("rewardRecipient", "Reward recipient address"))
    .argument("stakeAmount", "Initial stake amount")
    .asyncAction({ signer: true }, async (client, nodeId, rewardRecipient, stakeAmount, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const stakeAmountWei = parseUnits(stakeAmount, 18);

        logger.log("Initiating delegator registration...");
        const settings = await kiteStakingManager.read.getStakingManagerSettings();
        const validatorManager = await getValidatorManager(client, settings.manager);
        const nodeIdBytes = parseNodeID(nodeId, false);
        const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);
        const txHash = await kiteStakingManager.safeWrite.initiateDelegatorRegistration([
            validationID,
            rewardRecipient
        ], { value: stakeAmountWei, chain: null });
        logger.log("initiateDelegatorRegistration executed successfully, tx hash:", txHash);
    });

kiteStakingManagerCmd
    .command("complete-delegator-registration")
    .description("Complete delegator registration on the P-Chain and on the KiteStakingManager after initiating registration")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgHex("initiateTxHash", "Initiate delegator registration transaction hash"))
    .argument("rpcUrl", "RPC URL for getting validator uptime")
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .asyncAction({ signer: true }, async (client, initiateTxHash, rpcUrl, options) => {
        const opts = program.opts();
        if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;

        logger.log("Completing delegator registration...");
        const receipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 1 });
        if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls resend the initiate delegator registration transaction`);

        const settings = await kiteStakingManager.read.getStakingManagerSettings();
        const validatorManager = await getValidatorManager(client, settings.manager);

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

        const validator = await validatorManager.read.getValidator([validationID]);
        const nodeId = encodeNodeID(validator.nodeID as Hex);

        const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
        const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLogs[0].args.message);

        const weightWarpLog = warpLogs.find((w) => w.args.messageID === setWeightMessageID);
        if (!weightWarpLog) {
            logger.error(color.red("No matching warp message found for setWeightMessageID, verify the transaction hash."));
            process.exit(1);
        }

        const unsignedL1ValidatorWeightMessage = weightWarpLog.args.message;

        logger.log("\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
        const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: unsignedL1ValidatorWeightMessage, signingSubnetId });
        logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

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

        const validationIDBytes = hexToBytes(validationID as Hex);
        const unsignedPChainWeightWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(validatorWeight), client.network === 'fuji' ? 5 : 1, pChainChainID);
        const unsignedPChainWeightWarpMsgHex = bytesToHex(unsignedPChainWeightWarpMsg);

        logger.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
        const signedPChainWeightMessage = await collectSignatures({ network: client.network, message: unsignedPChainWeightWarpMsgHex, signingSubnetId });
        logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

        const warpNetworkID = client.network === 'fuji' ? 5 : 1;
        const sourceChainID = utils.base58check.encode(hexToBytes(settings.uptimeBlockchainID));
        logger.log("\nGetting validation uptime message...");
        const signedUptimeMessage = await getValidationUptimeMessage(client, rpcUrl, nodeId, warpNetworkID, sourceChainID);
        const signedUptimeMessageHex = signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`;

        const signedPChainWeightWarpMsgBytes = hexToBytes(`0x${signedPChainWeightMessage}`);
        const signedUptimeMessageBytes = hexToBytes(signedUptimeMessageHex as Hex);
        const weightAccessList = packWarpIntoAccessList(signedPChainWeightWarpMsgBytes);
        const uptimeAccessList = packWarpIntoAccessList(signedUptimeMessageBytes);
        const combinedAccessList = [weightAccessList[0], uptimeAccessList[0]];

        const messageIndex = 0;
        const uptimeMessageIndex = 1;

        logger.log("\nCalling function completeDelegatorRegistration...");
        const hash = await kiteStakingManager.safeWrite.completeDelegatorRegistration(
            [delegationID, messageIndex, uptimeMessageIndex],
            { account: client.account!, chain: null, accessList: combinedAccessList }
        );
        logger.log("completeDelegatorRegistration executed successfully, tx hash:", hash);
    });

kiteStakingManagerCmd
    .command("initiate-delegator-removal")
    .description("Initiate delegator removal on KiteStakingManager")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgHex("delegationID", "Delegation ID"))
    .addOption(new Option("--include-uptime-proof", "Include uptime proof in the removal").default(false))
    .addOption(new Option("--rpc-url <rpcUrl>", "RPC URL for getting validator uptime (required if --include-uptime-proof is true)"))
    .asyncAction({ signer: true }, async (client, delegationID, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        logger.log("Initiating delegator removal...");
        const messageIndex = 0;
        let accessList: Array<{ address: Hex; storageKeys: Hex[] }> | undefined = undefined;

        if (options.includeUptimeProof) {
            if (!options.rpcUrl) {
                logger.error(color.red("RPC URL is required when includeUptimeProof is true."));
                process.exit(1);
            }
            const settings = await kiteStakingManager.read.getStakingManagerSettings();
            const validatorManager = await getValidatorManager(client, settings.manager);
            const delegatorInfo = await kiteStakingManager.read.getDelegatorInfo([delegationID]);
            const validationID = delegatorInfo.validationID;
            const validator = await validatorManager.read.getValidator([validationID]);
            const nodeId = encodeNodeID(validator.nodeID as Hex);
            const warpNetworkID = client.network === 'fuji' ? 5 : 1;
            const sourceChainID = utils.base58check.encode(hexToBytes(settings.uptimeBlockchainID));
            logger.log("\nGetting validation uptime message...");
            const signedUptimeMessage = await getValidationUptimeMessage(client, options.rpcUrl, nodeId, warpNetworkID, sourceChainID);
            const signedUptimeMessageHex = signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`;
            const signedUptimeMessageBytes = hexToBytes(signedUptimeMessageHex as Hex);
            const uptimeAccessList = packWarpIntoAccessList(signedUptimeMessageBytes);
            accessList = [uptimeAccessList[0]];
        }

        const hash = await kiteStakingManager.safeWrite.initiateDelegatorRemoval(
            [delegationID, options.includeUptimeProof, messageIndex],
            accessList ? { account: client.account!, chain: null, accessList } : undefined
        );
        logger.log("initiateDelegatorRemoval executed successfully, tx hash:", hash);
    });

kiteStakingManagerCmd
    .command("complete-delegator-removal")
    .description("Complete delegator removal on the P-Chain and on the KiteStakingManager after initiating removal")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgHex("initiateRemovalTxHash", "Initiate delegator removal transaction hash"))
    .argument("rpcUrl", "RPC URL for getting validator uptime")
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
    .addOption(new Option("--delegation-id <delegationID>", "Delegation ID of the delegator being removed").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
    .addOption(new Option("--initiate-tx <initiateTx>", "Initiate delegator registration transaction hash"))
    .asyncAction({ signer: true }, async (client, initiateRemovalTxHash, rpcUrl, options) => {
        const opts = program.opts();
        if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        await requirePChainBallance(client, 50000n, opts.yes);
        const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;
        const delegationIDs = options.delegationId.length > 0 ? options.delegationId : undefined;
        const initiateTxHash = options.initiateTx ? (options.initiateTx as Hex) : undefined;

        logger.log("Completing delegator removal...");
        const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
        if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

        const settings = await kiteStakingManager.read.getStakingManagerSettings();
        const validatorManager = await getValidatorManager(client, settings.manager);

        const initiatedDelegatorRemovals = parseEventLogs({
            abi: kiteStakingManager.abi,
            logs: receipt.logs,
            eventName: 'InitiatedDelegatorRemoval'
        });
        if (initiatedDelegatorRemovals.length === 0) {
            logger.error(color.red("No InitiatedDelegatorRemoval event found in the transaction logs, verify the transaction hash."));
            process.exit(1);
        }

        const filteredRemovals = delegationIDs
            ? initiatedDelegatorRemovals.filter((e) => delegationIDs.includes(e.args.delegationID))
            : initiatedDelegatorRemovals;
        if (filteredRemovals.length === 0) {
            logger.error(color.red("No matching InitiatedDelegatorRemoval event found for the provided delegationIDs, verify the transaction hash and delegationIDs."));
            process.exit(1);
        }

        const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
        let lastHash: Hex | undefined;

        for (const event of filteredRemovals) {
            const delegationID = event.args.delegationID;
            const validationID = event.args.validationID;
            const validator = await validatorManager.read.getValidator([validationID]);
            const nodeID = encodeNodeID(validator.nodeID as Hex);
            logger.log(`Processing removal for delegation ${delegationID}, node ${nodeID}`);

            let addNodeBlockNumber = receipt.blockNumber;
            if (initiateTxHash) {
                const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHash, confirmations: 0 });
                if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHash} reverted, pls use another initiate tx`);
                const registrationEvents = parseEventLogs({ abi: kiteStakingManager.abi, logs: addNodeReceipt.logs, eventName: 'InitiatedDelegatorRegistration' });
                if (registrationEvents.some((e) => e.args.delegationID === delegationID)) {
                    addNodeBlockNumber = addNodeReceipt.blockNumber;
                }
            }

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

            logger.log("\nCollecting signatures for the L1ValidatorWeightMessage from the Validator Manager chain...");
            const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: unsignedL1ValidatorWeightMessage, signingSubnetId });
            logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");

            logger.log("\nSetting validator weight on P-Chain...");
            pipe(await setValidatorWeight({ client: pchainClient, validationID: validationID, message: signedL1ValidatorWeightMessage }),
                R.tap(pChainSetWeightTxId => logger.log("SetL1ValidatorWeightTx executed on P-Chain:", pChainSetWeightTxId)),
                R.tapError(err => {
                    if (!err.includes('warp message contains stale nonce')) { logger.error(err); process.exit(1); }
                    logger.warn(color.yellow(`Warning: Skipping SetL1ValidatorWeightTx for validationID ${validationID} due to stale nonce (already issued)`));
                }));

            const validationIDBytes = hexToBytes(validationID as Hex);
            const unsignedPChainWarpMsg = packL1ValidatorWeightMessage(validationIDBytes, BigInt(nonce), BigInt(weight), client.network === 'fuji' ? 5 : 1, pChainChainID);
            const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);

            logger.log("\nAggregating signatures for the L1ValidatorWeightMessage from the P-Chain...");
            const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, signingSubnetId });
            logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the P-Chain");

            const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
            const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);
            const messageIndex = 0;

            logger.log("\nCalling function completeDelegatorRemoval...");
            const hash = await kiteStakingManager.safeWrite.completeDelegatorRemoval(
                [delegationID, messageIndex],
                { account: client.account!, chain: null, accessList }
            );

            if (!options.skipWaitApi) {
                const subnetIDHex = await validatorManager.read.subnetID();
                logger.log("Waiting for the validator to be removed from the P-Chain (may take a while)...");
                await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeID), 5000, 180000, (res) => res === false);
            }

            logger.log("completeDelegatorRemoval executed successfully, tx hash:", hash);
            lastHash = hash;
        }

        if (!lastHash) throw new Error("No delegator removals processed");
    });

kiteStakingManagerCmd
    .command("initiate-validator-removal")
    .description("Initiate validator removal on KiteStakingManager")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgNodeID())
    .addOption(new Option("--include-uptime-proof", "Include uptime proof in the removal").default(false))
    .asyncAction({ signer: true }, async (client, nodeId, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        logger.log("Initiating validator removal...");
        const settings = await kiteStakingManager.read.getStakingManagerSettings();
        const validatorManager = await getValidatorManager(client, settings.manager);
        const nodeIdBytes = parseNodeID(nodeId, false);
        const validationID = await validatorManager.read.getNodeValidationID([nodeIdBytes]);
        const messageIndex = 0;
        const hash = await kiteStakingManager.safeWrite.initiateValidatorRemoval([
            validationID,
            options.includeUptimeProof,
            messageIndex
        ]);
        logger.log("initiateValidatorRemoval executed successfully, tx hash:", hash);
    });

kiteStakingManagerCmd
    .command("complete-validator-removal")
    .description("Complete validator removal on the P-Chain and on the KiteStakingManager after initiating removal")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgHex("initiateRemovalTxHash", "Initiate validator removal transaction hash"))
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
    .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
    .addOption(new Option("--initiate-tx <initiateTx>", "Initiate validator registration transaction hash").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
    .asyncAction({ signer: true }, async (client, initiateRemovalTxHash, options) => {
        const opts = program.opts();
        if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        await requirePChainBallance(client, 50000n, opts.yes);
        const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;
        const nodeIDs = options.nodeId.length > 0 ? options.nodeId : undefined;
        const initiateTxHashes = options.initiateTx.length > 0 ? options.initiateTx : undefined;

        logger.log("Completing validator removal...");
        const receipt = await client.waitForTransactionReceipt({ hash: initiateRemovalTxHash, confirmations: 1 });
        if (receipt.status === 'reverted') throw new Error(`Transaction ${initiateRemovalTxHash} reverted, pls resend the removal transaction`);

        const settings = await kiteStakingManager.read.getStakingManagerSettings();
        const validatorManager = await getValidatorManager(client, settings.manager);

        const initiatedValidatorRemovals = parseEventLogs({
            abi: validatorManager.abi,
            logs: receipt.logs,
            eventName: 'InitiatedValidatorRemoval'
        });
        if (initiatedValidatorRemovals.length === 0) {
            logger.error(color.red("No InitiatedValidatorRemoval event found in the transaction logs, verify the transaction hash."));
            process.exit(1);
        }

        const filteredRemovals = nodeIDs
            ? (await Promise.all(
                initiatedValidatorRemovals.map(async (e) => {
                    const validator = await validatorManager.read.getValidator([e.args.validationID]);
                    return { event: e, nodeId: encodeNodeID(validator.nodeID as Hex) };
                })
            )).filter(({ nodeId }) => nodeIDs.includes(nodeId)).map(({ event }) => event)
            : initiatedValidatorRemovals;

        if (filteredRemovals.length === 0) {
            logger.error(color.red("No matching InitiatedValidatorRemoval event found for the provided NodeIDs, verify the transaction hash and NodeIDs."));
            process.exit(1);
        }

        const warpLogs = parseEventLogs({ abi: IWarpMessengerABI, logs: receipt.logs });
        const subnetIDHex = await validatorManager.read.subnetID();
        const subnetID = utils.base58check.encode(hexToBytes(subnetIDHex));
        const currentValidators = await getCurrentValidators(client, subnetID);

        for (const event of filteredRemovals) {
            const eventIndex = filteredRemovals.indexOf(event);
            const validationID = event.args.validationID;
            const validator = await validatorManager.read.getValidator([validationID]);
            const nodeID = encodeNodeID(validator.nodeID as Hex);
            logger.log(`Processing removal for node ${nodeID}`);

            const warpLog = warpLogs.find((w) => w.args.messageID === event.args.validatorWeightMessageID);
            if (!warpLog) {
                logger.error(color.red(`No matching warp log found for validationID ${validationID}`));
                continue;
            }

            const signingSubnetId = await getSigningSubnetIdFromWarpMessage(client, warpLog.args.message);
            let addNodeBlockNumber = receipt.blockNumber;
            if (initiateTxHashes && initiateTxHashes.length > eventIndex) {
                const addNodeReceipt = await client.waitForTransactionReceipt({ hash: initiateTxHashes[eventIndex], confirmations: 0 });
                if (addNodeReceipt.status === 'reverted') throw new Error(`Transaction ${initiateTxHashes[eventIndex]} reverted, pls use another initiate tx`);
                addNodeBlockNumber = addNodeReceipt.blockNumber;
            }

            const isValidator = currentValidators.some((v) => v.nodeID === nodeID);
            if (!isValidator) {
                logger.log(color.yellow("Node is not registered as a validator on the P-Chain."));
            } else {
                const unsignedL1ValidatorWeightMessage = warpLog.args.message;
                const signedL1ValidatorWeightMessage = await collectSignatures({ network: client.network, message: unsignedL1ValidatorWeightMessage, signingSubnetId });
                logger.log("Aggregated signatures for the L1ValidatorWeightMessage from the Validator Manager chain");
                pipe(
                    await setValidatorWeight({ client: pchainClient, validationID: validationID, message: signedL1ValidatorWeightMessage }),
                    R.tapError((error) => { throw new Error("SetL1ValidatorWeightTx failed on P-Chain: " + error + '\n'); }),
                    R.tap((txId) => { logger.log("SetL1ValidatorWeightTx executed on P-Chain: " + txId); })
                );
            }

            const justification = await GetRegistrationJustification(nodeID, validationID, subnetID, client, addNodeBlockNumber);
            if (!justification) throw new Error("Justification not found for validator removal");

            const validationIDBytes = hexToBytes(validationID);
            const unsignedPChainWarpMsg = packL1ValidatorRegistration(validationIDBytes, false, client.network === 'fuji' ? 5 : 1, pChainChainID);
            const unsignedPChainWarpMsgHex = bytesToHex(unsignedPChainWarpMsg);
            const signedPChainMessage = await collectSignatures({ network: client.network, message: unsignedPChainWarpMsgHex, justification: bytesToHex(justification), signingSubnetId });
            logger.log("Aggregated signatures for the L1ValidatorRegistrationMessage from the P-Chain");

            const signedPChainWarpMsgBytes = hexToBytes(`0x${signedPChainMessage}`);
            const accessList = packWarpIntoAccessList(signedPChainWarpMsgBytes);
            const messageIndex = 0;

            logger.log("Executing completeValidatorRemoval transaction...");
            const completeHash = await kiteStakingManager.safeWrite.completeValidatorRemoval(
                [messageIndex],
                { account: client.account!, chain: null, accessList }
            );

            if (!options.skipWaitApi) {
                logger.log("Waiting for the validator to be removed from the P-Chain (may take a while)...");
                await retryWhileError(async () => (await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIDHex)))).some((v) => v.nodeID === nodeID), 5000, 180000, (res) => res === false);
            }

            logger.log("completeValidatorRemoval executed successfully, tx hash:", completeHash);
        }
    });

kiteStakingManagerCmd
    .command("submit-uptime-proof")
    .description("Submit uptime proof for a validator")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgNodeID("nodeId", "Node ID of the validator"))
    .argument("rpcUrl", "RPC URL for getting validator uptime")
    .asyncAction({ signer: true }, async (client, nodeId, rpcUrl, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const [uptimeBlockchainID, manager] = await kiteStakingManager.read.getStakingManagerSettings().then((settings) => [settings.uptimeBlockchainID, settings.manager]);
        const warpNetworkID = client.network === 'fuji' ? 5 : 1;
        const sourceChainID = utils.base58check.encode(hexToBytes(uptimeBlockchainID as Hex));
        logger.log("\nGetting validation uptime message...");
        const signedUptimeMessage = await getValidationUptimeMessage(client, rpcUrl, nodeId, warpNetworkID, sourceChainID);
        const signedUptimeMessageHex = signedUptimeMessage.startsWith('0x') ? signedUptimeMessage : `0x${signedUptimeMessage}`;
        const uptimeAccessList = packWarpIntoAccessList(hexToBytes(signedUptimeMessageHex as Hex));
        const validators = await getCurrentValidatorsFromNode(rpcUrl);
        const validator = validators.find(v => v.nodeID === nodeId);
        if (!validator) throw new Error(`Validator with nodeID ${nodeId} not found in the current validator set`);
        const txHash = await kiteStakingManager.safeWrite.submitUptimeProof([cb58ToHex(validator.validationID), 0], { accessList: uptimeAccessList });
        logger.log("submitUptimeProof done, tx hash:", txHash);
    });

return kiteStakingManagerCmd;
}
