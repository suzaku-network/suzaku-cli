import { ExtendedWalletClient } from './client';
import { Config } from './config';
import { SafeSuzakuContract } from './lib/viemUtils';
import { logger } from './lib/logger';
import { color } from 'console-log-colors';
import { Hex, formatUnits, parseAbiItem } from 'viem';
import {
    processEpochStakingVault,
    prepareWithdrawalsStakingVault,
    harvestStakingVault,
    claimWithdrawalsForStakingVault,
    completeValidatorRemovalStakingVault,
    completeDelegatorRemovalStakingVault,
    getValidatorManagerAddress,
} from './stakingVault';

interface KeeperRunResult {
    epochProcessed: boolean;
    epochIterations: number;
    prepareWithdrawalsCalled: boolean;
    harvestCalled: boolean;
    queueCleanupCount: number;
    validatorRemovalsCompleted: number;
    delegatorRemovalsCompleted: number;
    errors: string[];
}

// ── Process epoch loop (wraps processEpochStakingVault) ───────────────

async function processEpochLoop(
    client: ExtendedWalletClient,
    stakingVault: SafeSuzakuContract['StakingVault']
): Promise<{ processed: boolean; iterations: number }> {
    const [currentEpoch, lastEpochProcessedBefore] = await stakingVault.multicall([
        'getCurrentEpoch', 'getLastEpochProcessed',
    ]);

    if (currentEpoch <= lastEpochProcessedBefore) {
        logger.log("\nEpoch already up to date (current:", currentEpoch.toString(), ", last processed:", lastEpochProcessedBefore.toString(), ")");
        return { processed: false, iterations: 0 };
    }

    logger.log("\nCurrent epoch:", currentEpoch.toString(), "Last processed:", lastEpochProcessedBefore.toString());
    logger.log("Epochs behind:", (currentEpoch - lastEpochProcessedBefore).toString());

    let iteration = 0;

    while (true) {
        iteration++;
        logger.log(`\nProcess epoch iteration ${iteration}...`);

        const result = await processEpochStakingVault(client, stakingVault);

        // undefined means tx was skipped (Safe propose / cast mode)
        if (!result) {
            return { processed: true, iterations: iteration };
        }

        if (result.finished) {
            break;
        }

        logger.log("More processing needed, continuing...");
    }

    return { processed: true, iterations: iteration };
}

// ── keeper run ────────────────────────────────────────────────────────

export async function keeperRun(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient | undefined,
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVault'],
    options: {
        harvest?: boolean;
        skipCompletions?: boolean;
    } = {}
): Promise<KeeperRunResult> {
    const result: KeeperRunResult = {
        epochProcessed: false,
        epochIterations: 0,
        prepareWithdrawalsCalled: false,
        harvestCalled: false,
        queueCleanupCount: 0,
        validatorRemovalsCompleted: 0,
        delegatorRemovalsCompleted: 0,
        errors: [],
    };

    logger.log(color.bold("\n══════════════════════════════════════"));
    logger.log(color.bold("  Keeper Run — StakingVault"));
    logger.log(color.bold("══════════════════════════════════════"));
    logger.log("Vault:", stakingVault.address);
    logger.log("Time:", new Date().toISOString());

    // ── Step 1: Process epoch (loop until caught up) ──────────────
    try {
        const epochResult = await processEpochLoop(client, stakingVault);
        result.epochProcessed = epochResult.processed;
        result.epochIterations = epochResult.iterations;

        if (epochResult.processed) {
            logger.log(color.green(`\nEpoch processing complete (${epochResult.iterations} iteration(s))`));
        }
    } catch (error: any) {
        const msg = `Epoch processing failed: ${error.message || error}`;
        logger.error(msg);
        result.errors.push(msg);
    }

    // ── Step 2: Prepare withdrawals if needed ─────────────────────
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

    // ── Step 3: Complete pending removals (P-Chain) ───────────────
    if (pchainClient && !options.skipCompletions) {
        try {
            const completions = await completePendingRemovals(client, pchainClient, config, stakingVault);
            result.validatorRemovalsCompleted = completions.validators;
            result.delegatorRemovalsCompleted = completions.delegators;
        } catch (error: any) {
            const msg = `Completion scanning failed: ${error.message || error}`;
            logger.error(msg);
            result.errors.push(msg);
        }
    } else if (!pchainClient) {
        logger.log("\nNo P-Chain key provided — skipping removal completions");
    }

    // ── Step 4: Harvest ───────────────────────────────────────────
    if (options.harvest) {
        try {
            logger.log("\nRunning harvest...");
            await harvestStakingVault(client, stakingVault);
            result.harvestCalled = true;
            logger.log(color.green("Harvest completed"));
        } catch (error: any) {
            const msg = `Harvest failed: ${error.message || error}`;
            logger.error(msg);
            result.errors.push(msg);
        }
    }

    // ── Step 5: Queue head cleanup ────────────────────────────────
    try {
        const cleanedUp = await cleanupQueueHead(client, stakingVault);
        result.queueCleanupCount = cleanedUp;
    } catch (error: any) {
        const msg = `Queue cleanup failed: ${error.message || error}`;
        logger.error(msg);
        result.errors.push(msg);
    }

    // ── Step 6: Protocol fees warning ─────────────────────────────
    try {
        const [pendingProtocolFees, decimals] = await stakingVault.multicall([
            'getPendingProtocolFees', 'decimals',
        ]);
        if (pendingProtocolFees > 0n) {
            logger.warn(`\nPending protocol fees: ${formatUnits(pendingProtocolFees, decimals)} AVAX (requires VAULT_ADMIN_ROLE to claim)`);
        }
    } catch { /* non-critical */ }

    // ── Summary ───────────────────────────────────────────────────
    logger.log(color.bold("\n── Keeper Run Summary ──"));
    logger.log(`  Epoch processed:       ${result.epochProcessed} (${result.epochIterations} iterations)`);
    logger.log(`  prepareWithdrawals:    ${result.prepareWithdrawalsCalled}`);
    logger.log(`  Harvest:               ${result.harvestCalled}`);
    logger.log(`  Queue cleanup:         ${result.queueCleanupCount} entries`);
    logger.log(`  Validator completions: ${result.validatorRemovalsCompleted}`);
    logger.log(`  Delegator completions: ${result.delegatorRemovalsCompleted}`);
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

    // Scan from queue head forward to find claimable entries
    const claimableIds: bigint[] = [];
    const maxScan = 50; // Limit scan depth

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
    config: Config,
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
                    client, pchainClient, config, stakingVault, validatorManager,
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
                    delegationID
                );

                if (!removalTxHash) continue; // Not pending removal

                logger.log(`\nFound pending delegator removal: ${delegationID} (operator: ${operator})`);
                logger.log(`Found initiate removal tx: ${removalTxHash}`);

                await completeDelegatorRemovalStakingVault(
                    client, pchainClient, config, stakingVault, validatorManager,
                    removalTxHash, false
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
    id: Hex
): Promise<Hex | null> {
    // Scan recent blocks for the removal initiation event
    // The indexed param is the second one (validationID or delegationID)
    const currentBlock = await client.getBlockNumber();
    // Look back ~7 days of blocks (~2s block time on Kite L1)
    const fromBlock = currentBlock > 302400n ? currentBlock - 302400n : 0n;

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
            // Use the most recent event
            return logs[logs.length - 1].transactionHash;
        }
    } catch (error: any) {
        logger.debug(`Event scan failed for ${eventName}: ${error.message || error}`);
    }

    return null;
}

// ── keeper watch ──────────────────────────────────────────────────────

export async function keeperWatch(
    client: ExtendedWalletClient,
    pchainClient: ExtendedWalletClient | undefined,
    config: Config,
    stakingVault: SafeSuzakuContract['StakingVault'],
    options: {
        pollInterval: number;      // seconds
        harvestInterval: number;   // seconds
    }
): Promise<never> {
    logger.log(color.bold("\n══════════════════════════════════════"));
    logger.log(color.bold("  Keeper Watch — StakingVault"));
    logger.log(color.bold("══════════════════════════════════════"));
    logger.log("Vault:", stakingVault.address);
    logger.log("Poll interval:", options.pollInterval, "seconds");
    logger.log("Harvest interval:", options.harvestInterval, "seconds");
    logger.log("P-Chain completions:", pchainClient ? "enabled" : "disabled");
    logger.log("Started at:", new Date().toISOString());

    let lastHarvestTime = 0;

    // Graceful shutdown
    let running = true;
    const shutdown = () => {
        logger.log("\nShutting down keeper watch...");
        running = false;
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    while (running) {
        const now = Date.now();
        const shouldHarvest = (now - lastHarvestTime) >= options.harvestInterval * 1000;

        try {
            logger.log(color.bold(`\n── Keeper tick at ${new Date().toISOString()} ──`));

            const result = await keeperRun(client, pchainClient, config, stakingVault, {
                harvest: shouldHarvest,
            });

            if (result.harvestCalled) {
                lastHarvestTime = now;
            }

            if (result.errors.length > 0) {
                logger.warn(`Tick completed with ${result.errors.length} error(s)`);
            }
        } catch (error: any) {
            logger.error(`Keeper tick failed: ${error.message || error}`);
        }

        // Wait for next tick
        if (running) {
            logger.log(`\nNext tick in ${options.pollInterval} seconds...`);
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, options.pollInterval * 1000);
                // Allow early exit on shutdown
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
    process.exit(0);
}
