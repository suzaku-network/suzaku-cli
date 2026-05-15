import { type Hex, parseUnits } from "viem";
import { generateClient } from "./client";
import { logger } from "./lib/logger";
import { color } from "console-log-colors";
import { chainList, getKiteStakingManager, ksmInitiateValidatorRegistration, ksmCompleteValidatorRegistration, ksmInitiateDelegatorRegistration, ksmCompleteDelegatorRegistration, ksmInitiateDelegatorRemoval, ksmCompleteDelegatorRemoval, ksmInitiateValidatorRemoval, ksmCompleteValidatorRemoval, ksmSubmitUptimeProof, type NodeId } from "@suzaku-sdk/core";
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
        const hash = await ksmInitiateValidatorRegistration(
            client,
            kiteStakingManager,
            nodeId,
            blsKey,
            delegationFeeBips,
            BigInt(minStakeDuration),
            rewardRecipient,
            parseUnits(stakeAmount, 18),
            { threshold: options.pchainRemainingBalanceOwnerThreshold, addresses: options.pchainRemainingBalanceOwnerAddress },
            { threshold: options.pchainDisableOwnerThreshold, addresses: options.pchainDisableOwnerAddress },
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
        const hash = await ksmCompleteValidatorRegistration(
            client,
            kiteStakingManager,
            pchainClient,
            initiateTxHash,
            blsProofOfPossession,
            initialBalance,
            !options.skipWaitApi,
        );
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
        logger.log("Initiating delegator registration...");
        const txHash = await ksmInitiateDelegatorRegistration(
            client,
            kiteStakingManager,
            nodeId,
            rewardRecipient,
            parseUnits(stakeAmount, 18),
        );
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
        const hash = await ksmCompleteDelegatorRegistration(
            client,
            kiteStakingManager,
            pchainClient,
            initiateTxHash,
            rpcUrl,
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
        if (options.includeUptimeProof && !options.rpcUrl) {
            logger.error(color.red("RPC URL is required when includeUptimeProof is true."));
            process.exit(1);
        }
        logger.log("Initiating delegator removal...");
        const hash = await ksmInitiateDelegatorRemoval(
            client,
            kiteStakingManager,
            delegationID,
            options.includeUptimeProof,
            options.rpcUrl,
        );
        logger.log("initiateDelegatorRemoval executed successfully, tx hash:", hash);
    });

kiteStakingManagerCmd
    .command("complete-delegator-removal")
    .description("Complete delegator removal on the P-Chain and on the KiteStakingManager after initiating removal")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgHex("initiateRemovalTxHash", "Initiate delegator removal transaction hash"))
    .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
    .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
    .addOption(new Option("--delegation-id <delegationID>", "Delegation ID of the delegator being removed").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
    .asyncAction({ signer: true }, async (client, initiateRemovalTxHash, options) => {
        const opts = program.opts();
        if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        await requirePChainBallance(client, 50000n, opts.yes);
        const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;
        logger.log("Completing delegator removal...");
        await ksmCompleteDelegatorRemoval(
            client,
            kiteStakingManager,
            pchainClient,
            initiateRemovalTxHash,
            options.delegationId.length > 0 ? options.delegationId : undefined,
            !options.skipWaitApi,
        );
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
        const hash = await ksmInitiateValidatorRemoval(client, kiteStakingManager, nodeId, options.includeUptimeProof);
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
        logger.log("Completing validator removal...");
        await ksmCompleteValidatorRemoval(
            client,
            kiteStakingManager,
            pchainClient,
            initiateRemovalTxHash,
            options.nodeId.length > 0 ? options.nodeId : undefined,
            !options.skipWaitApi,
            options.initiateTx.length > 0 ? options.initiateTx : undefined,
        );
    });

kiteStakingManagerCmd
    .command("submit-uptime-proof")
    .description("Submit uptime proof for a validator")
    .addOption(optKiteStakingManagerAddress)
    .addArgument(ArgNodeID("nodeId", "Node ID of the validator"))
    .argument("rpcUrl", "RPC URL for getting validator uptime")
    .asyncAction({ signer: true }, async (client, nodeId, rpcUrl, options) => {
        const kiteStakingManager = await getKiteStakingManager(client, options.stakingManagerAddress);
        const txHash = await ksmSubmitUptimeProof(client, kiteStakingManager, nodeId, rpcUrl);
        logger.log("submitUptimeProof done, tx hash:", txHash);
    });

return kiteStakingManagerCmd;
}
