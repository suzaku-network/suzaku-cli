import { ExtendedWalletClient } from 'suzaku-cli/dist/client';
import { Config } from 'suzaku-cli/dist/config';
import { SafeSuzakuContract } from 'suzaku-cli/dist/lib/viemUtils';
import { logger } from 'suzaku-cli/dist/lib/logger';
import { color } from 'console-log-colors';
import { Hex, formatUnits, parseAbiItem } from 'viem';
import type { Monitor } from './monitor';
import { logTickStructured } from './log';
import {
    processEpochStakingVault,
    prepareWithdrawalsStakingVault,
    harvestValidatorsStakingVault,
    harvestDelegatorsStakingVault,
    claimWithdrawalsForStakingVault,
    completeValidatorRemovalStakingVault,
    completeDelegatorRemovalStakingVault,
    completeValidatorRegistrationStakingVault,
    completeDelegatorRegistrationStakingVault,
    getValidatorManagerAddress,
} from 'suzaku-cli/dist/stakingVault';

export interface KeeperRunResult {
    epochProcessed: boolean;
    epochIterations: number;
    prepareWithdrawalsCalled: boolean;
    harvestCalled: boolean;
    queueCleanupCount: number;
    validatorRegistrationsCompleted: number;
    delegatorRegistrationsCompleted: number;
    validatorRemovalsCompleted: number;
    delegatorRemovalsCompleted: number;
    errors: string[];
}

const HARVEST_BATCH_SIZE = 50n;
const MAX_EPOCH_ITERATIONS = 100;

// ── Process epoch loop (wraps processEpochStakingVault) ───────────────

async function processEpochLoop(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault']
): Promise<{ processed: boolean; iterations: number; stalledOnLiquidity: boolean }> {
    const [currentEpoch, lastEpochProcessedBefore] = await stakingVault.multicall([
        'getCurrentEpoch', 'getLastEpochProcessed',
    ]);

    if (currentEpoch <= lastEpochProcessedBefore) {
        logger.log("\nEpoch already up to date (current:", currentEpoch.toString(), ", last processed:", lastEpochProcessedBefore.toString(), ")");
        return { processed: false, iterations: 0, stalledOnLiquidity: false };
    }

    logger.log("\nCurrent epoch:", currentEpoch.toString(), "Last processed:", lastEpochProcessedBefore.toString());
    logger.log("Epochs behind:", (currentEpoch - lastEpochProcessedBefore).toString());

    let iteration = 0;

    while (iteration < MAX_EPOCH_ITERATIONS) {
        iteration++;
        logger.log(`\nProcess epoch iteration ${iteration}...`);

        await processEpochStakingVault(client, stakingVault, { gas: 2_000_000n });

        // Check if we've caught up
        const lastProcessedNow = await stakingVault.read.getLastEpochProcessed();
        if (lastProcessedNow >= currentEpoch) {
            break;
        }

        // Detect liquidity stall: if available stake is 0, epoch can't seal —
        // break early so prepareWithdrawals can free up liquidity
        const available = await stakingVault.read.getAvailableStake();
        if (available === 0n) {
            logger.warn(`Liquidity stall detected at iteration ${iteration} — no available stake to process`);
            return { processed: false, iterations: iteration, stalledOnLiquidity: true };
        }

        logger.log("More processing needed, continuing...");
    }

    if (iteration >= MAX_EPOCH_ITERATIONS) {
        throw new Error(`Epoch processing did not finish after ${MAX_EPOCH_ITERATIONS} iterations — aborting`);
    }

    return { processed: true, iterations: iteration, stalledOnLiquidity: false };
}

// ── keeper run ────────────────────────────────────────────────────────

export async function keeperRun(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient | undefined,
    config: Config<ExtendedWalletClient>,
    stakingVault: SafeSuzakuContract['StakingVault'],
    options: {
        harvest?: boolean;
        coreOnly?: boolean;
        completionsOnly?: boolean;
        rpcUrl?: string;
        uptimeBlockchainID?: Hex;
    } = {}
): Promise<KeeperRunResult> {
    const result: KeeperRunResult = {
        epochProcessed: false,
        epochIterations: 0,
        prepareWithdrawalsCalled: false,
        harvestCalled: false,
        queueCleanupCount: 0,
        validatorRegistrationsCompleted: 0,
        delegatorRegistrationsCompleted: 0,
        validatorRemovalsCompleted: 0,
        delegatorRemovalsCompleted: 0,
        errors: [],
    };

    logger.log(color.bold("\n══════════════════════════════════════"));
    logger.log(color.bold("  Keeper Run — StakingVault"));
    logger.log(color.bold("══════════════════════════════════════"));
    logger.log("Vault:", stakingVault.address);
    logger.log("Time:", new Date().toISOString());

    if (!options.completionsOnly) {
        try {
            const epochResult = await processEpochLoop(client, stakingVault);
            result.epochProcessed = epochResult.processed;
            result.epochIterations = epochResult.iterations;

            if (epochResult.stalledOnLiquidity) {
                logger.warn(color.yellow(`\nEpoch processing stalled on liquidity after ${epochResult.iterations} iteration(s) — waiting for prepareWithdrawals`));
            } else if (epochResult.processed) {
                logger.log(color.green(`\nEpoch processing complete (${epochResult.iterations} iteration(s))`));
            }
        } catch (error: any) {
            const msg = `Epoch processing failed: ${error.message || error}`;
            logger.error(msg);
            result.errors.push(msg);
        }

        try {
            const [pendingWithdrawals, decimals] = await stakingVault.multicall([
                'getPendingWithdrawals', 'decimals',
            ]);

            if (pendingWithdrawals > 0n) {
                logger.log(`\nPending withdrawals: ${formatUnits(pendingWithdrawals, decimals)} AVAX — calling prepareWithdrawals...`);
                try {
                    await prepareWithdrawalsStakingVault(client, stakingVault);
                    result.prepareWithdrawalsCalled = true;
                    logger.log(color.green("prepareWithdrawals completed"));
                } catch (error: any) {
                    // StakingVault__NoEligibleStake is expected when nothing eligible
                    if (error.message?.includes('StakingVault__NoEligibleStake')) {
                        logger.log("No eligible stake for withdrawal preparation (expected if liquidity is sufficient)");
                    } else {
                        throw error;
                    }
                }
            } else {
                logger.log("\nNo pending withdrawals");
            }
        } catch (error: any) {
            const msg = `Prepare withdrawals failed: ${error.message || error}`;
            logger.error(msg);
            result.errors.push(msg);
        }
    }

    if (pchainClient && !options.coreOnly) {
        try {
            const registrations = await completePendingRegistrations(
                client, pchainClient, config, stakingVault, options.rpcUrl, options.uptimeBlockchainID
            );
            result.validatorRegistrationsCompleted = registrations.validators;
            result.delegatorRegistrationsCompleted = registrations.delegators;
        } catch (error: any) {
            const msg = `Registration completion scanning failed: ${error.message || error}`;
            logger.error(msg);
            result.errors.push(msg);
        }

        try {
            const removals = await completePendingRemovals(client, pchainClient, config, stakingVault);
            result.validatorRemovalsCompleted = removals.validators;
            result.delegatorRemovalsCompleted = removals.delegators;
        } catch (error: any) {
            const msg = `Removal completion scanning failed: ${error.message || error}`;
            logger.error(msg);
            result.errors.push(msg);
        }
    } else if (!pchainClient && options.completionsOnly) {
        throw new Error("--completions requires --pchain-tx-private-key or PCHAIN_TX_PRIVATE_KEY");
    } else if (!pchainClient) {
        logger.log("\nNo P-Chain key provided — skipping completions");
    }

    if (!options.completionsOnly) {
        if (options.harvest) {
            try {
                logger.log("\nRunning batched harvest...");
                await batchedHarvest(client, stakingVault);
                result.harvestCalled = true;
                logger.log(color.green("Harvest completed"));
            } catch (error: any) {
                const msg = `Harvest failed: ${error.message || error}`;
                logger.error(msg);
                result.errors.push(msg);
            }
        }

        try {
            const cleanedUp = await cleanupQueueHead(client, stakingVault);
            result.queueCleanupCount = cleanedUp;
        } catch (error: any) {
            const msg = `Queue cleanup failed: ${error.message || error}`;
            logger.error(msg);
            result.errors.push(msg);
        }
    }

    if (!options.completionsOnly) try {
        const [pendingProtocolFees, decimals] = await stakingVault.multicall([
            'getPendingProtocolFees', 'decimals',
        ]);
        if (pendingProtocolFees > 0n) {
            logger.warn(`\nPending protocol fees: ${formatUnits(pendingProtocolFees, decimals)} AVAX (requires VAULT_ADMIN_ROLE to claim)`);
        }
    } catch { /* non-critical */ }

    logger.log(color.bold("\n── Keeper Run Summary ──"));
    logger.log(`  Epoch processed:              ${result.epochProcessed} (${result.epochIterations} iterations)`);
    logger.log(`  prepareWithdrawals:           ${result.prepareWithdrawalsCalled}`);
    logger.log(`  Harvest:                      ${result.harvestCalled}`);
    logger.log(`  Queue cleanup:                ${result.queueCleanupCount} entries`);
    logger.log(`  Validator registrations:      ${result.validatorRegistrationsCompleted}`);
    logger.log(`  Delegator registrations:      ${result.delegatorRegistrationsCompleted}`);
    logger.log(`  Validator removals:           ${result.validatorRemovalsCompleted}`);
    logger.log(`  Delegator removals:           ${result.delegatorRemovalsCompleted}`);
    if (result.errors.length > 0) {
        logger.log(color.red(`  Errors:                ${result.errors.length}`));
        result.errors.forEach(e => logger.log(color.red(`    - ${e}`)));
    }

    logger.addData('keeperRun', result);
    return result;
}

// ── Queue head cleanup ────────────────────────────────────────────────

async function cleanupQueueHead(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault']
): Promise<number> {
    const [queueHead, queueLength] = await stakingVault.multicall([
        'getQueueHead', 'getWithdrawalQueueLength',
    ]);

    if (queueLength === 0n || queueHead >= queueLength) {
        logger.log("\nWithdrawal queue empty — no cleanup needed");
        return 0;
    }

    const claimableIds: bigint[] = [];
    const maxScan = 50;

    for (let i = queueHead; i < queueLength && i < queueHead + BigInt(maxScan); i++) {
        try {
            const claimable = await stakingVault.read.isWithdrawalClaimable([i]);
            if (claimable) {
                claimableIds.push(i);
            } else {
                // Stop at the first non-claimable entry since queue is FIFO
                break;
            }
        } catch {
            break;
        }
    }

    if (claimableIds.length === 0) {
        logger.log("\nNo claimable entries at queue head");
        return 0;
    }

    logger.log(`\nClaiming ${claimableIds.length} withdrawal(s) at queue head for cleanup...`);
    await claimWithdrawalsForStakingVault(client, stakingVault, claimableIds);
    logger.log(color.green(`Cleaned up ${claimableIds.length} withdrawal(s)`));
    return claimableIds.length;
}

// ── Complete pending removals ─────────────────────────────────────────

async function completePendingRemovals(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    config: Config<ExtendedWalletClient>,
    stakingVault: SafeSuzakuContract['StakingVault']
): Promise<{ validators: number; delegators: number }> {
    let validators = 0;
    let delegators = 0;

    const { validatorManagerAddress, stakingManager } = await getValidatorManagerAddress(config, stakingVault);
    const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);

    // Get all operators and check their validators/delegators for pending removals
    const operatorList = await stakingVault.read.getOperatorList();

    for (const operator of operatorList) {
        // Check validators pending removal
        const validatorIDs = await stakingVault.read.getOperatorValidators([operator]);
        for (const validationID of validatorIDs) {
            try {
                const isPending = await stakingVault.read.isValidatorPendingRemoval([validationID]);
                if (!isPending) continue;

                logger.log(`\nFound pending validator removal: ${validationID} (operator: ${operator})`);

                // Scan for the initiate removal tx hash via events
                const removalTxHash = await findRemovalTxHash(
                    client,
                    stakingVault.address,
                    'StakingVault__ValidatorRemovalInitiated',
                    validationID
                );

                if (!removalTxHash) {
                    logger.warn(`Could not find initiate removal tx for validator ${validationID} — skipping`);
                    continue;
                }

                logger.log(`Found initiate removal tx: ${removalTxHash}`);
                await completeValidatorRemovalStakingVault(
                    pchainClient, config, stakingVault, validatorManager,
                    removalTxHash, false
                );
                validators++;
                logger.log(color.green(`Completed validator removal: ${validationID}`));
            } catch (error: any) {
                logger.warn(`Failed to complete validator removal ${validationID}: ${error.message || error}`);
            }
        }

        // Check delegators pending removal
        const delegatorIDs = await stakingVault.read.getOperatorDelegators([operator]);
        for (const delegationID of delegatorIDs) {
            try {
                // Check delegator info — if the removal was initiated, the delegator
                // will still be listed but we need to find the removal event
                const removalTxHash = await findRemovalTxHash(
                    client,
                    stakingVault.address,
                    'StakingVault__DelegatorRemovalInitiated',
                    delegationID,
                    43200n // ~1 day lookback for delegators (vs 7 days for validators)
                );

                if (!removalTxHash) continue; // Not pending removal

                logger.log(`\nFound pending delegator removal: ${delegationID} (operator: ${operator})`);
                logger.log(`Found initiate removal tx: ${removalTxHash}`);

                await completeDelegatorRemovalStakingVault(
                    pchainClient, config, stakingVault, validatorManager,
                    removalTxHash
                );
                delegators++;
                logger.log(color.green(`Completed delegator removal: ${delegationID}`));
            } catch (error: any) {
                logger.warn(`Failed to complete delegator removal ${delegationID}: ${error.message || error}`);
            }
        }
    }

    if (validators > 0 || delegators > 0) {
        logger.log(`\nCompleted ${validators} validator removal(s) and ${delegators} delegator removal(s)`);
    } else {
        logger.log("\nNo pending removals to complete");
    }

    return { validators, delegators };
}

// ── Event scanning helpers ────────────────────────────────────────────

async function findRemovalTxHash(
    client: ExtendedWalletClient,
    contractAddress: Hex,
    eventName: 'StakingVault__ValidatorRemovalInitiated' | 'StakingVault__DelegatorRemovalInitiated',
    id: Hex,
    lookbackBlocks = 302400n
): Promise<Hex | null> {
    // Scan recent blocks for the removal initiation event
    // The indexed param is the second one (validationID or delegationID)
    const currentBlock = await client.getBlockNumber();
    const fromBlock = currentBlock > lookbackBlocks ? currentBlock - lookbackBlocks : 0n;

    const event = eventName === 'StakingVault__ValidatorRemovalInitiated'
        ? parseAbiItem('event StakingVault__ValidatorRemovalInitiated(address indexed operator, bytes32 indexed validationID)')
        : parseAbiItem('event StakingVault__DelegatorRemovalInitiated(address indexed operator, bytes32 indexed delegationID)');

    try {
        const logs = await client.getLogs({
            address: contractAddress,
            event,
            args: eventName === 'StakingVault__ValidatorRemovalInitiated'
                ? { validationID: id }
                : { delegationID: id },
            fromBlock,
            toBlock: 'latest',
        });

        if (logs.length > 0) {
            return logs[logs.length - 1].transactionHash;
        }
    } catch (error: any) {
        logger.debug(`Event scan failed for ${eventName}: ${error.message || error}`);
    }

    return null;
}

// ── Batched harvest ──────────────────────────────────────────────────

async function batchedHarvest(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault']
): Promise<void> {
    const operatorList = await stakingVault.read.getOperatorList();

    for (let opIdx = 0n; opIdx < BigInt(operatorList.length); opIdx++) {
        const operator = operatorList[Number(opIdx)];

        // Harvest validators in batches
        const validatorIDs = await stakingVault.read.getOperatorValidators([operator]);
        const validatorCount = BigInt(validatorIDs.length);
        if (validatorCount > 0n) {
            for (let start = 0n; start < validatorCount; start += HARVEST_BATCH_SIZE) {
                const batchSize = validatorCount - start < HARVEST_BATCH_SIZE
                    ? validatorCount - start
                    : HARVEST_BATCH_SIZE;
                logger.log(`  Harvesting validators for operator ${opIdx} [${start}..${start + batchSize})`);
                await harvestValidatorsStakingVault(client, stakingVault, opIdx, start, batchSize);
            }
        }

        // Harvest delegators in batches
        const delegatorIDs = await stakingVault.read.getOperatorDelegators([operator]);
        const delegatorCount = BigInt(delegatorIDs.length);
        if (delegatorCount > 0n) {
            for (let start = 0n; start < delegatorCount; start += HARVEST_BATCH_SIZE) {
                const batchSize = delegatorCount - start < HARVEST_BATCH_SIZE
                    ? delegatorCount - start
                    : HARVEST_BATCH_SIZE;
                logger.log(`  Harvesting delegators for operator ${opIdx} [${start}..${start + batchSize})`);
                await harvestDelegatorsStakingVault(client, stakingVault, opIdx, start, batchSize);
            }
        }
    }
}

// ── Complete pending registrations ───────────────────────────────────

async function completePendingRegistrations(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient,
    config: Config<ExtendedWalletClient>,
    stakingVault: SafeSuzakuContract['StakingVault'],
    rpcUrl?: string,
    uptimeBlockchainID?: Hex,
): Promise<{ validators: number; delegators: number }> {
    let validators = 0;
    let delegators = 0;

    const { validatorManagerAddress, stakingManager, stakingManagerStorageLocation } =
        await getValidatorManagerAddress(config, stakingVault);
    const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);

    const resolvedRpcUrl = rpcUrl || client.chain?.rpcUrls?.default?.http?.[0];
    let resolvedUptimeBlockchainID = uptimeBlockchainID;
    if (!resolvedUptimeBlockchainID) {
        const slot = `0x${(BigInt(stakingManagerStorageLocation) + 6n).toString(16).padStart(64, '0')}` as Hex;
        resolvedUptimeBlockchainID = await config.client.getStorageAt({
            address: stakingManager.address,
            slot,
        }) as Hex;
        if (!resolvedUptimeBlockchainID || resolvedUptimeBlockchainID === '0x' + '0'.repeat(64) || resolvedUptimeBlockchainID === '0x0') {
            resolvedUptimeBlockchainID = undefined;
        }
    }

    const operatorList = await stakingVault.read.getOperatorList();

    for (const operator of operatorList) {
        // Check validators pending registration
        const validatorIDs = await stakingVault.read.getOperatorValidators([operator]);
        for (const validationID of validatorIDs) {
            try {
                const validatorInfo = await validatorManager.read.getValidator([validationID]);
                // Status 1 = PendingAdded
                if (validatorInfo.status !== 1) continue;

                logger.log(`\nFound pending validator registration: ${validationID} (operator: ${operator})`);

                const txHash = await findRegistrationTxHash(
                    client,
                    stakingVault.address,
                    'validator',
                    validationID
                );

                if (!txHash) {
                    logger.warn(`Could not find initiate registration tx for validator ${validationID} — skipping`);
                    continue;
                }

                logger.log(`Found initiate registration tx: ${txHash}`);
                // blsProofOfPossession='', initialBalance=0: not needed for keeper completion
                // — the node is already registered on P-Chain; the keeper only submits the
                // C-Chain warp completion step.
                await completeValidatorRegistrationStakingVault(
                    pchainClient, config, stakingVault, validatorManager,
                    '', txHash, 0n, false
                );
                validators++;
                logger.log(color.green(`Completed validator registration: ${validationID}`));
            } catch (error: any) {
                logger.warn(`Failed to complete validator registration ${validationID}: ${error.message || error}`);
            }
        }

        // Check delegators pending registration
        const delegatorIDs = await stakingVault.read.getOperatorDelegators([operator]);
        for (const delegationID of delegatorIDs) {
            try {
                const delegatorInfo = await stakingManager.read.getDelegatorInfo([delegationID]);
                // Status 1 = PendingAdded
                if (delegatorInfo.status !== 1) continue;

                if (!resolvedRpcUrl) {
                    logger.warn(`No RPC URL available for delegator registration completion — skipping ${delegationID}`);
                    continue;
                }
                if (!resolvedUptimeBlockchainID) {
                    logger.warn(`Could not resolve uptimeBlockchainID — skipping delegator ${delegationID}`);
                    continue;
                }

                logger.log(`\nFound pending delegator registration: ${delegationID} (operator: ${operator})`);

                const txHash = await findRegistrationTxHash(
                    client,
                    stakingVault.address,
                    'delegator',
                    delegationID,
                    delegatorInfo.validationID
                );

                if (!txHash) {
                    logger.warn(`Could not find initiate registration tx for delegator ${delegationID} — skipping`);
                    continue;
                }

                logger.log(`Found initiate registration tx: ${txHash}`);
                await completeDelegatorRegistrationStakingVault(
                    pchainClient, config, stakingVault, validatorManager,
                    txHash, resolvedRpcUrl, resolvedUptimeBlockchainID
                );
                delegators++;
                logger.log(color.green(`Completed delegator registration: ${delegationID}`));
            } catch (error: any) {
                logger.warn(`Failed to complete delegator registration ${delegationID}: ${error.message || error}`);
            }
        }
    }

    if (validators > 0 || delegators > 0) {
        logger.log(`\nCompleted ${validators} validator registration(s) and ${delegators} delegator registration(s)`);
    } else {
        logger.log("\nNo pending registrations to complete");
    }

    return { validators, delegators };
}

// ── Registration event scanning ──────────────────────────────────────

async function findRegistrationTxHash(
    client: ExtendedWalletClient,
    contractAddress: Hex,
    type: 'validator' | 'delegator',
    id: Hex,
    validationID?: Hex,
): Promise<Hex | null> {
    const currentBlock = await client.getBlockNumber();
    // Look back ~7 days of blocks (~2s block time on Kite L1)
    const fromBlock = currentBlock > 302400n ? currentBlock - 302400n : 0n;

    try {
        if (type === 'validator') {
            const event = parseAbiItem(
                'event StakingVault__ValidatorRegistrationInitiated(address indexed operator, bytes32 indexed validationID)'
            );
            const logs = await client.getLogs({
                address: contractAddress,
                event,
                args: { validationID: id },
                fromBlock,
                toBlock: 'latest',
            });
            if (logs.length > 0) {
                return logs[logs.length - 1].transactionHash;
            }
        } else {
            // delegationID is NOT indexed — filter by validationID (indexed), then match delegationID in data
            const event = parseAbiItem(
                'event StakingVault__DelegatorRegistrationInitiated(address indexed operator, bytes32 indexed validationID, bytes32 delegationID, uint256 amount)'
            );
            const logs = await client.getLogs({
                address: contractAddress,
                event,
                args: { validationID },
                fromBlock,
                toBlock: 'latest',
            });
            for (let i = logs.length - 1; i >= 0; i--) {
                if (logs[i].args.delegationID === id) {
                    return logs[i].transactionHash;
                }
            }
        }
    } catch (error: any) {
        logger.debug(`Event scan failed for ${type} registration: ${error.message || error}`);
    }

    return null;
}

// ── keeper watch ──────────────────────────────────────────────────────

export async function keeperWatch(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient | undefined,
    config: Config<ExtendedWalletClient>,
    stakingVault: SafeSuzakuContract['StakingVault'],
    options: {
        pollInterval: number;      // seconds
        harvestInterval: number;   // seconds
        coreOnly?: boolean;
        completionsOnly?: boolean;
        rpcUrl?: string;
        uptimeBlockchainID?: Hex;
        monitor?: Monitor;
        onCleanup?: () => void;
        tickTimeoutMs?: number;
    }
): Promise<void> {
    logger.log(color.bold("\n══════════════════════════════════════"));
    logger.log(color.bold("  Keeper Watch — StakingVault"));
    logger.log(color.bold("══════════════════════════════════════"));
    logger.log("Vault:", stakingVault.address);
    logger.log("Mode:", options.completionsOnly ? "completions" : options.coreOnly ? "core" : "full");
    logger.log("Poll interval:", options.pollInterval, "seconds");
    logger.log("Harvest interval:", options.harvestInterval, "seconds");
    logger.log("P-Chain completions:", pchainClient ? "enabled" : "disabled");
    logger.log("Started at:", new Date().toISOString());

    let lastHarvestTime = 0;
    let tickHung = false;

    let running = true;
    const shutdown = () => {
        logger.log("\nShutting down keeper watch...");
        running = false;
        options.onCleanup?.();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    const monitor = options.monitor;
    const tickTimeoutMs = options.tickTimeoutMs && options.tickTimeoutMs > 0 ? options.tickTimeoutMs : 0;

    while (running) {
        // If a previous tick is hung, skip execution — just run alerts and sleep
        if (tickHung) {
            logger.warn('Previous tick still hung — skipping tick execution');
            await monitor?.checkAlerts(options.pollInterval);
        } else {
            const now = Date.now();
            const shouldHarvest = (now - lastHarvestTime) >= options.harvestInterval * 1000;
            const tickStart = Date.now();

            // Trap process.exit during ticks so the daemon survives contract errors.
            // The CLI's handleContractError calls logger.exitError → process.exit(1),
            // which is correct for one-shot CLI usage but kills a long-running daemon.
            const realExit = process.exit;
            let exitTrapped = false;
            process.exit = ((code?: number) => {
                exitTrapped = true;
                process.exitCode = code ?? 1;
            }) as never;

            try {
                logger.log(color.bold(`\n── Keeper tick at ${new Date().toISOString()} ──`));

                await monitor?.collectVaultMetrics(stakingVault).catch(() => {});

                const tickBody = keeperRun(client, pchainClient, config, stakingVault, {
                    harvest: shouldHarvest,
                    coreOnly: options.coreOnly,
                    completionsOnly: options.completionsOnly,
                    rpcUrl: options.rpcUrl,
                    uptimeBlockchainID: options.uptimeBlockchainID,
                });

                let result: KeeperRunResult;

                if (tickTimeoutMs > 0) {
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Tick timed out')), tickTimeoutMs)
                    );
                    try {
                        result = await Promise.race([tickBody, timeoutPromise]);
                    } catch (error: any) {
                        if (error.message === 'Tick timed out') {
                            logger.error(`Tick timed out after ${tickTimeoutMs}ms — marking hung`);
                            // Restore exit immediately — no new tick can start while hung
                            process.exit = realExit;
                            if (!exitTrapped) process.exitCode = 0;
                            tickHung = true;
                            // Let the abandoned promise run; clear hung flag when it settles
                            tickBody.finally(() => { tickHung = false; });

                            const durationMs = Date.now() - tickStart;
                            const timeoutResult: KeeperRunResult = {
                                epochProcessed: false, epochIterations: 0, prepareWithdrawalsCalled: false,
                                harvestCalled: false, queueCleanupCount: 0, validatorRegistrationsCompleted: 0,
                                delegatorRegistrationsCompleted: 0, validatorRemovalsCompleted: 0,
                                delegatorRemovalsCompleted: 0, errors: ['Tick timed out'],
                            };
                            monitor?.recordTickResult(timeoutResult, durationMs, true);
                            await monitor?.checkAlerts(options.pollInterval);
                            logTickStructured(timeoutResult, durationMs);

                            // Skip the normal finally + sleep logic below — go straight to sleep
                            if (running) {
                                logger.log(`\nNext tick in ${options.pollInterval} seconds...`);
                                await new Promise<void>((resolve) => {
                                    const timer = setTimeout(resolve, options.pollInterval * 1000);
                                    const checkShutdown = setInterval(() => {
                                        if (!running) { clearTimeout(timer); clearInterval(checkShutdown); resolve(); }
                                    }, 1000);
                                });
                            }
                            continue;
                        }
                        throw error;
                    }
                } else {
                    result = await tickBody;
                }

                const durationMs = Date.now() - tickStart;
                monitor?.recordTickResult(result, durationMs, exitTrapped || result.errors.length > 0);
                await monitor?.checkAlerts(options.pollInterval);
                logTickStructured(result, durationMs);

                if (result.harvestCalled) {
                    lastHarvestTime = now;
                }

                if (result.errors.length > 0 || exitTrapped) {
                    logger.warn(`Tick completed with ${result.errors.length} error(s)${exitTrapped ? ' (contract error trapped)' : ''}`);
                }
            } catch (error: any) {
                logger.error(`Keeper tick failed: ${error.message || error}`);
                const durationMs = Date.now() - tickStart;
                const emptyResult: KeeperRunResult = {
                    epochProcessed: false, epochIterations: 0, prepareWithdrawalsCalled: false,
                    harvestCalled: false, queueCleanupCount: 0, validatorRegistrationsCompleted: 0,
                    delegatorRegistrationsCompleted: 0, validatorRemovalsCompleted: 0,
                    delegatorRemovalsCompleted: 0, errors: [error.message || String(error)],
                };
                monitor?.recordTickResult(emptyResult, durationMs, true);
                await monitor?.checkAlerts(options.pollInterval);
                logTickStructured(emptyResult, durationMs);
            } finally {
                if (!tickHung) {
                    process.exit = realExit;
                    if (!exitTrapped) process.exitCode = 0;
                }
            }
        }

        if (running) {
            logger.log(`\nNext tick in ${options.pollInterval} seconds...`);
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, options.pollInterval * 1000);
                const checkShutdown = setInterval(() => {
                    if (!running) {
                        clearTimeout(timer);
                        clearInterval(checkShutdown);
                        resolve();
                    }
                }, 1000);
            });
        }
    }

    logger.log("Keeper watch stopped");
}
