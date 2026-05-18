import { ExtendedClient, ExtendedWalletClient, generateClient } from './client';
import { SafeSuzakuContract, SuzakuContract } from './lib/viemUtils';
import { chainList, getStakingVault, svInitiateValidatorRegistration, svInitiateValidatorRemoval, svForceRemoveValidator, svInitiateDelegatorRegistration, svCompleteValidatorRegistration, svCompleteDelegatorRegistration, svCompleteValidatorRemoval, svCompleteDelegatorRemoval } from '@suzaku-network/suzaku-sdk/core';
import { parseUnits, parseEventLogs, Hex, formatUnits } from 'viem';
import { logger } from './lib/logger';
import { NodeId, encodeNodeID } from './lib/utils';
import { color } from 'console-log-colors';
import { ArgAddress, ArgBigInt, ArgBLSPOP, ArgHex, ArgNodeID, collectMultiple, OptAddress, ParserAddress, ParserHex, ParserNodeID, ParserNumber, ParserPrivateKey, ParseUnits } from './lib/cliParser';
import { SuzakuCliProgram } from './cli';
import { Option } from '@commander-js/extra-typings'
import { argOperatorAddress } from './operator';
import { requirePChainBallance } from '@suzaku-network/suzaku-sdk/node';

export const optStakingVaultAddress = OptAddress("--staking-vault-address <address>", "Staking vault contract address");

// ── Info helpers ──────────────────────────────────────────────────────────────

type StakingVaultContract = SuzakuContract['StakingVault'];

function fmt(amount: bigint, decimals: number): string {
    return formatUnits(amount, decimals);
}

async function getGeneralInfo(stakingVault: StakingVaultContract, client: ExtendedClient) {
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
    logger.log(`  Total Pooled Stake:      ${fmt(totalPooledStake, decimals)} KITE`);
    logger.log(`  Total Supply (LST):      ${fmt(totalSupply, decimals)} ${symbol}`);
    logger.log(`  Exchange Rate:           ${fmt(exchangeRate, decimals)}`);
    logger.log(`  Available Stake:         ${fmt(availableStake, decimals)} KITE`);
    logger.log(`  Total Validator Stake:   ${fmt(totalValidatorStake, decimals)} KITE`);
    logger.log(`  Total Delegated Stake:   ${fmt(totalDelegatedStake, decimals)} KITE`);
    logger.log(`  Pending Withdrawals:     ${fmt(pendingWithdrawals, decimals)} KITE`);
    logger.log(`  Claimable Withdrawals:   ${fmt(claimableWithdrawals, decimals)} KITE`);
    logger.log(`  In-Flight Exiting:       ${fmt(inFlightExiting, decimals)} KITE`);
    logger.log(`  Current Epoch:           ${currentEpoch}`);
    logger.log(`  Last Epoch Processed:    ${lastEpochProcessed}`);
    logger.log(`  Contract Balance:        ${formatUnits(contractBalance, 18)} KITE`);
}

async function getFeesInfo(stakingVault: StakingVaultContract) {
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
    logger.log(`  Pending Protocol Fees:   ${fmt(pendingProtocolFees, decimals)} KITE`);
    logger.log(`  Operator Fee:            ${operatorFeeBips} bips (${Number(operatorFeeBips) / 100}%)`);
    logger.log(`  Total Accrued Op. Fees:  ${fmt(totalAccruedOperatorFees, decimals)} KITE`);
    logger.log(`  Liquidity Buffer:        ${liquidityBufferBips} bips (${Number(liquidityBufferBips) / 100}%)`);
}

async function getOperatorsInfo(stakingVault: StakingVaultContract) {
    const [operatorList, maxOperators, maxValidatorsPerOp, decimals, symbol] = await stakingVault.multicall([
        'getOperatorList', 'getMaxOperators', 'getMaxValidatorsPerOperator', 'decimals', 'symbol',]
    );

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
        logger.log(`    Active Stake:      ${fmt(info.activeStake, decimals)} KITE`);
        logger.log(`    Accrued Fees:      ${fmt(info.accruedFees, decimals)} KITE`);
        logger.log(`    Fee Recipient:     ${info.feeRecipient}`);
        logger.log(`    Exit Debt:         ${fmt(exitDebt, decimals)} KITE`);
        logger.log(`    Validators:        ${validators.length}`);
        logger.log(`    Delegations:       ${delegators.length}`);
    }

    logger.log(`\n  ── Summary ──`);
    logger.log(`    Active / Total:        ${totalActive} / ${operatorList.length}`);
    logger.log(`    Total Allocation:      ${totalAllocationBips} bips (${Number(totalAllocationBips) / 100}%)`);
}

async function getValidatorsInfo(stakingVault: StakingVaultContract) {
    const [operatorList, totalValidatorStake, maxValidatorStake, decimals] = await stakingVault.multicall([
        'getOperatorList', 'getTotalValidatorStake', 'getMaximumValidatorStake', 'decimals',
    ]);

    logger.log(color.bold(`\n═══ Validators Info ═══`));
    logger.log(`  Total Validator Stake:   ${fmt(totalValidatorStake, decimals)} KITE`);
    logger.log(`  Max Validator Stake:     ${fmt(maxValidatorStake, decimals)} KITE`);

    let totalValidators = 0;
    let totalPendingRemoval = 0;

    for (const operator of operatorList) {
        const [validatorIDs] = await stakingVault.multicall([
            { name: 'getOperatorValidators', args: [operator] },
        ]);

        if (validatorIDs.length === 0) continue;

        logger.log(`\n  Operator ${color.cyan(operator)} (${validatorIDs.length} validators):`);

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
            logger.log(`      Stake:           ${fmt(stakeAmount, decimals)} KITE`);
            logger.log(`      Pending Removal: ${pendingRemoval}`);
        }
    }

    logger.log(`\n  ── Summary ──`);
    logger.log(`    Total Validators:      ${totalValidators}`);
    logger.log(`    Pending Removal:       ${totalPendingRemoval}`);
}

async function getDelegatorsInfo(stakingVault: StakingVaultContract) {
    const [operatorList, totalDelegatedStake, maxDelegatorStake, decimals] = await stakingVault.multicall([
        'getOperatorList', 'getTotalDelegatedStake', 'getMaximumDelegatorStake', 'decimals',
    ]);

    logger.log(color.bold(`\n═══ Delegators Info ═══`));
    logger.log(`  Total Delegated Stake:   ${fmt(totalDelegatedStake, decimals)} KITE`);
    logger.log(`  Max Delegator Stake:     ${fmt(maxDelegatorStake, decimals)} KITE`);

    let totalDelegations = 0;

    for (const operator of operatorList) {
        const [delegatorIDs] = await stakingVault.multicall([
            { name: 'getOperatorDelegators', args: [operator] },
        ]);

        if (delegatorIDs.length === 0) continue;

        logger.log(`\n  Operator ${color.cyan(operator)} (${delegatorIDs.length} delegations):`);

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

async function getWithdrawalsInfo(stakingVault: StakingVaultContract) {
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
    logger.log(`  Pending Withdrawals:     ${fmt(pendingWithdrawals, decimals)} KITE`);
    logger.log(`  Claimable Withdrawals:   ${fmt(claimableWithdrawals, decimals)} KITE`);
    logger.log(`  Total Exit Debt:         ${fmt(totalExitDebt, decimals)} KITE`);
    logger.log(`  Current Epoch:           ${currentEpoch}`);
    logger.log(`  Last Epoch Processed:    ${lastEpochProcessed}`);
    logger.log(`  Epoch Duration:          ${epochDuration}s`);
}

async function getEpochInfo(stakingVault: StakingVaultContract) {
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

export function addStakingVaultCommands(program: SuzakuCliProgram) {
    const stakingVaultCmd = program
        .command("staking-vault")
        .alias("sv")
        .description("Commands to interact with StakingVault contracts")
        .hook("preSubcommand", () => {
            const opts = program.opts();
            const newNet = opts.network === "custom" ? opts.network : chainList[opts.network].testnet ? "kiteaitestnet" : "kiteai";
            program.setOptionValue("network", newNet);
        })

    stakingVaultCmd
        .command("deposit")
        .description("Deposit native tokens (AVAX) into the StakingVault")
        .addOption(optStakingVaultAddress)
        .argument("amount", "Amount to deposit in AVAX")
        .addArgument(ArgBigInt("minShares", "Minimum shares expected from the deposit (slippage protection)"))
        .asyncAction({ signer: true }, async (client, amount, minShares, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            logger.log("Depositing to StakingVault...");
            const amountWei = parseUnits(amount, 18);
            logger.log("\n=== Deposit Details ===");
            logger.log("Amount:", amount, "KITE");
            logger.log("Amount in wei:", amountWei.toString());
            logger.log("Minimum shares expected:", minShares.toString());
            logger.log("Vault address:", stakingVault.address);
            const hash = await stakingVault.safeWrite.deposit(
                [minShares],
                { value: amountWei, chain: null }
            );
            logger.log("Deposit tx hash:", hash);
            logger.log("Waiting for deposit confirmation...");
            const receipt = await client.waitForTransactionReceipt({ hash });
            logger.log("Deposit confirmed in block:", receipt.blockNumber);
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
        });

    stakingVaultCmd
        .command("request-withdrawal")
        .description("Request withdrawal from the StakingVault")
        .addOption(optStakingVaultAddress)
        .argument("shares", "Amount of shares to withdraw")
        .asyncAction({ signer: true }, async (client, shares, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            logger.log("Requesting withdrawal from StakingVault...");
            const sharesWei = parseUnits(shares, 18);
            logger.log("\n=== Withdrawal Request Details ===");
            logger.log("Shares:", shares);
            logger.log("Shares in wei:", sharesWei.toString());
            logger.log("Vault address:", stakingVault.address);
            const hash = await stakingVault.safeWrite.requestWithdrawal([sharesWei]);
            logger.log("Request withdrawal tx hash:", hash);
            logger.log("Waiting for transaction confirmation...");
            const receipt = await client.waitForTransactionReceipt({ hash });
            logger.log("Transaction confirmed in block:", receipt.blockNumber);
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
        });

    stakingVaultCmd
        .command("claim-withdrawal")
        .description("Claim a withdrawal from the StakingVault")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("requestId", "Withdrawal request ID to claim"))
        .asyncAction({ signer: true }, async (client, requestId, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            logger.log("Claiming withdrawal from StakingVault...");
            logger.log("\n=== Withdrawal Claim Details ===");
            logger.log("Request ID:", requestId.toString());
            logger.log("Vault address:", stakingVault.address);
            const hash = await stakingVault.safeWrite.claimWithdrawal([requestId]);
            logger.log("Claim withdrawal tx hash:", hash);
            logger.log("Waiting for transaction confirmation...");
            const receipt = await client.waitForTransactionReceipt({ hash });
            logger.log("Transaction confirmed in block:", receipt.blockNumber);
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
        });

    stakingVaultCmd
        .command("claim-withdrawal-for")
        .description("Claim a withdrawal for a request ID (permissionless)")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("requestId", "Withdrawal request ID to claim"))
        .asyncAction({ signer: true }, async (client, requestId, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.claimWithdrawalFor([requestId]);
            logger.log("claimWithdrawalFor tx hash:", hash);
            logger.log("claimWithdrawalFor executed successfully");
        });

    stakingVaultCmd
        .command("claim-withdrawals-for")
        .description("Claim multiple withdrawals for request IDs (permissionless)")
        .addOption(optStakingVaultAddress)
        .argument("requestIds...", "Withdrawal request IDs to claim")
        .asyncAction({ signer: true }, async (client, requestIds, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const ids = (requestIds as string[]).map((id) => BigInt(id));
            const hash = await stakingVault.safeWrite.claimWithdrawalsFor([ids]);
            logger.log("claimWithdrawalsFor tx hash:", hash);
            logger.log("claimWithdrawalsFor executed successfully");
        });

    stakingVaultCmd
        .command("claim-escrowed-withdrawal")
        .description("Claim escrowed withdrawal to a recipient")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgAddress("recipient", "Recipient address"))
        .asyncAction({ signer: true }, async (client, recipient, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.claimEscrowedWithdrawal([recipient]);
            logger.log("claimEscrowedWithdrawal tx hash:", hash);
            logger.log("claimEscrowedWithdrawal executed successfully");
        });

    stakingVaultCmd
        .command("process-epoch")
        .description("Process the current epoch in the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction({ signer: true }, async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            logger.log("Processing epoch in StakingVault...");
            logger.log("\n=== Process Epoch Details ===");
            logger.log("Vault address:", stakingVault.address);
            const hash = await stakingVault.safeWrite.processEpoch([]);
            logger.log("Process epoch tx hash:", hash);
            logger.log("Waiting for transaction confirmation...");
            const receipt = await client.waitForTransactionReceipt({ hash });
            logger.log("Transaction confirmed in block:", receipt.blockNumber);
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
        });

    stakingVaultCmd
        .command("initiate-validator-registration")
        .description("Initiate validator registration in the StakingVault")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("blsKey", "BLS public key"))
        .argument("stakeAmount", "Stake amount in AVAX")
        .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .asyncAction({ signer: true }, async (client, nodeId, blsKey, stakeAmount, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const stakeAmountWei = parseUnits(stakeAmount, 18);
            const hash = await svInitiateValidatorRegistration(
                client, stakingVault, nodeId, blsKey, stakeAmountWei,
                { threshold: options.pchainRemainingBalanceOwnerThreshold, addresses: options.pchainRemainingBalanceOwnerAddress },
                { threshold: options.pchainDisableOwnerThreshold, addresses: options.pchainDisableOwnerAddress },
            );
            logger.log("Initiate validator registration tx hash:", hash);
        });

    stakingVaultCmd
        .command("add-operator")
        .description("Add an operator to the StakingVault")
        .addOption(optStakingVaultAddress)
        .addArgument(argOperatorAddress)
        .argument("allocationBips", "Allocation in basis points (1 bips = 0.01%)")
        .addArgument(ArgAddress("feeRecipient", "Fee recipient address"))
        .asyncAction({ signer: true }, async (client, operator, allocationBips, feeRecipient, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const allocationBipsBigInt = BigInt(allocationBips);
            logger.log("Adding operator to StakingVault...");
            logger.log("\n=== Add Operator Details ===");
            logger.log("Operator address:", operator);
            logger.log("Allocation (bips):", allocationBipsBigInt.toString());
            logger.log("Fee recipient:", feeRecipient);
            logger.log("Vault address:", stakingVault.address);
            const hash = await stakingVault.safeWrite.addOperator([
                operator,
                allocationBipsBigInt,
                feeRecipient
            ]);
            logger.log("Add operator tx hash:", hash);
            logger.log("Waiting for transaction confirmation...");
            const receipt = await client.waitForTransactionReceipt({ hash });
            logger.log("Transaction confirmed in block:", receipt.blockNumber);
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
        });

    stakingVaultCmd
        .command("remove-operator")
        .description("Remove an operator from the StakingVault")
        .addOption(optStakingVaultAddress)
        .addArgument(argOperatorAddress)
        .asyncAction({ signer: true }, async (client, operator, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.removeOperator([operator]);
            logger.log("removeOperator tx hash:", hash);
            logger.log("removeOperator executed successfully");
        });

    stakingVaultCmd
        .command("complete-validator-registration")
        .description("Complete validator registration on the P-Chain and on the StakingVault after initiating registration")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgHex("initiateTxHash", "Initiate validator registration transaction hash"))
        .addArgument(ArgBLSPOP())
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01'))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .asyncAction({ signer: true }, async (client, initiateTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const initialBalance = ParseUnits(options.initialBalance, 9, 'Invalid initial balance');
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;
            const hash = await svCompleteValidatorRegistration(client, stakingVault, pchainClient, initiateTxHash, blsProofOfPossession, initialBalance, !options.skipWaitApi);
            logger.log("completeValidatorRegistration executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("initiate-validator-removal")
        .description("Initiate validator removal in the StakingVault")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgNodeID())
        .asyncAction({ signer: true }, async (client, nodeId, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const { hash, validationID } = await svInitiateValidatorRemoval(client, stakingVault, nodeId);
            logger.log("Initiate validator removal tx hash:", hash);
            logger.log("✅ Validator removal initiated successfully!");
            logger.log("Validation ID:", validationID);
        });

    stakingVaultCmd
        .command("complete-validator-removal")
        .description("Complete validator removal on the P-Chain and on the StakingVault after initiating removal")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgHex("initiateRemovalTxHash", "Initiate validator removal transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be removed from the P-Chain API"))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .addOption(new Option("--initiate-tx <initiateTx>", "Initiate validator registration transaction hash").argParser((value) => value as Hex))
        .asyncAction({ signer: true }, async (client, initiateRemovalTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await requirePChainBallance(client, 50000n, opts.yes);
            const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;
            const nodeIDs = options.nodeId.length > 0 ? options.nodeId : undefined;
            await svCompleteValidatorRemoval(client, stakingVault, pchainClient, initiateRemovalTxHash, nodeIDs, !options.skipWaitApi, options.initiateTx);
        });

    stakingVaultCmd
        .command("force-remove-validator")
        .description("Force remove a validator from the StakingVault (admin/emergency operation)")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgNodeID())
        .asyncAction({ signer: true }, async (client, nodeId, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await svForceRemoveValidator(client, stakingVault, nodeId);
            logger.log("Force remove validator tx hash:", hash);
            logger.log("✅ Validator force-removed successfully!");
        });

    stakingVaultCmd
        .command("initiate-delegator-registration")
        .description("Initiate delegator registration in the StakingVault")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgNodeID())
        .argument("amount", "Stake amount in AVAX")
        .asyncAction({ signer: true }, async (client, nodeId, amount, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const amountWei = parseUnits(amount, 18);
            const { hash, validationID } = await svInitiateDelegatorRegistration(client, stakingVault, nodeId, amountWei);
            logger.log("Initiate delegator registration tx hash:", hash);
            logger.log("✅ Delegator registration initiated successfully!");
            logger.log("Validation ID:", validationID);
        });

    stakingVaultCmd
        .command("complete-delegator-registration")
        .description("Complete delegator registration on the P-Chain and on the StakingVault after initiating registration")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgHex("initiateTxHash", "Initiate delegator registration transaction hash"))
        .argument("rpcUrl", "RPC URL for getting validator uptime (e.g. http(s)://domainOrIp:portIfNeeded)")
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .asyncAction({ signer: true }, async (client, initiateTxHash, rpcUrl, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;
            const bypassToken = process.env.RPC_BYPASS_TOKEN;
            const hash = await svCompleteDelegatorRegistration(client, stakingVault, pchainClient, initiateTxHash, rpcUrl, bypassToken);
            logger.log("completeDelegatorRegistration executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("initiate-delegator-removal")
        .description("Initiate delegator removal in the StakingVault")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgHex("delegationID", "Delegation ID"))
        .asyncAction({ signer: true }, async (client, delegationID, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            logger.log("Initiating delegator removal in StakingVault...");
            logger.log("\n=== Delegator Removal Initiation Details ===");
            logger.log("Delegation ID:", delegationID);
            logger.log("Vault address:", stakingVault.address);
            const hash = await stakingVault.safeWrite.initiateDelegatorRemoval([delegationID]);
            logger.log("Initiate delegator removal tx hash:", hash);
            logger.log("Waiting for transaction confirmation...");
            const receipt = await client.waitForTransactionReceipt({ hash });
            logger.log("Transaction confirmed in block:", receipt.blockNumber);
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
        });

    stakingVaultCmd
        .command("force-remove-delegator")
        .description("Force remove a delegator from the StakingVault (admin/emergency operation)")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgHex("delegationID", "Delegation ID"))
        .asyncAction({ signer: true }, async (client, delegationID, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
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
        });

    stakingVaultCmd
        .command("complete-delegator-removal")
        .description("Complete delegator removal on the P-Chain and on the StakingVault after initiating removal")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgHex("initiateRemovalTxHash", "Initiate delegator removal transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be removed from the P-Chain API"))
        .addOption(new Option("--delegation-id <delegationID>", "Delegation ID of the delegator being removed").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
        .addOption(new Option("--initiate-tx <initiateTx>", "Initiate delegator registration transaction hash").argParser((value) => value as Hex))
        .asyncAction({ signer: true }, async (client, initiateRemovalTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await requirePChainBallance(client, 50000n, opts.yes);
            const pchainClient = options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client;
            const delegationIDs = options.delegationId.length > 0 ? options.delegationId : undefined;
            await svCompleteDelegatorRemoval(client, stakingVault, pchainClient, initiateRemovalTxHash, delegationIDs);
        });

    stakingVaultCmd
        .command("update-operator-allocations")
        .description("Update operator allocations in the StakingVault")
        .addOption(optStakingVaultAddress)
        .addArgument(argOperatorAddress)
        .argument("allocationBips", "Allocation in basis points (1 bips = 0.01%)")
        .asyncAction({ signer: true }, async (client, operator, allocationBips, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const allocationBipsBigInt = BigInt(allocationBips);
            await stakingVault.safeWrite.updateOperatorAllocations([[operator], [allocationBipsBigInt]])
        });

    stakingVaultCmd
        .command("claim-operator-fees")
        .description("Claim operator fees for the caller")
        .addOption(optStakingVaultAddress)
        .asyncAction({ signer: true }, async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.claimOperatorFees([]);
            logger.log("claimOperatorFees executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("force-claim-operator-fees")
        .description("Force claim operator fees for an operator (admin)")
        .addOption(optStakingVaultAddress)
        .addArgument(argOperatorAddress)
        .asyncAction({ signer: true }, async (client, operator, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.forceClaimOperatorFees([operator]);
            logger.log("forceClaimOperatorFees executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("claim-pending-protocol-fees")
        .description("Claim pending protocol fees")
        .addOption(optStakingVaultAddress)
        .asyncAction({ signer: true }, async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.claimPendingProtocolFees([]);
            logger.log("claimPendingProtocolFees executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("harvest")
        .description("Harvest rewards")
        .addOption(optStakingVaultAddress)
        .asyncAction({ signer: true }, async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.harvest([]);
            logger.log("harvest executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("harvest-validators")
        .description("Harvest validator rewards in batches")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("operatorIndex", "Operator index"))
        .addArgument(ArgBigInt("start", "Validator list start index"))
        .addArgument(ArgBigInt("batchSize", "Validator batch size"))
        .asyncAction({ signer: true }, async (client, operatorIndex, start, batchSize, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.harvestValidators([operatorIndex, start, batchSize]);
            logger.log("harvestValidators executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("harvest-delegators")
        .description("Harvest delegator rewards in batches")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("operatorIndex", "Operator index"))
        .addArgument(ArgBigInt("start", "Delegator list start index"))
        .addArgument(ArgBigInt("batchSize", "Delegator batch size"))
        .asyncAction({ signer: true }, async (client, operatorIndex, start, batchSize, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.harvestDelegators([operatorIndex, start, batchSize]);
            logger.log("harvestDelegators executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("prepare-withdrawals")
        .description("Prepare withdrawals by initiating stake removals")
        .addOption(optStakingVaultAddress)
        .asyncAction({ signer: true }, async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.prepareWithdrawals([]);
            logger.log("prepareWithdrawals executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("pause")
        .description("Pause the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction({ signer: true }, async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.pause([]);
            logger.log("pause executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("unpause")
        .description("Unpause the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction({ signer: true }, async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.unpause([]);
            logger.log("unpause executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-liquidity-buffer-bips")
        .description("Set the liquidity buffer in basis points")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("liquidityBufferBips", "Liquidity buffer in basis points"))
        .asyncAction({ signer: true }, async (client, liquidityBufferBips, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setLiquidityBufferBips([liquidityBufferBips]);
            logger.log("setLiquidityBufferBips executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-withdrawal-request-fee")
        .description("Set the withdrawal request fee")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("fee", "Withdrawal request fee"))
        .asyncAction({ signer: true }, async (client, fee, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setWithdrawalRequestFee([fee]);
            logger.log("setWithdrawalRequestFee executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-max-operators")
        .description("Set the maximum number of operators")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("maxOperators", "Maximum number of operators"))
        .asyncAction({ signer: true }, async (client, maxOperators, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setMaxOperators([maxOperators]);
            logger.log("setMaxOperators executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-max-validators-per-operator")
        .description("Set the maximum number of validators per operator")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("maxValidatorsPerOperator", "Maximum number of validators per operator"))
        .asyncAction({ signer: true }, async (client, maxValidatorsPerOperator, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setMaxValidatorsPerOperator([maxValidatorsPerOperator]);
            logger.log("setMaxValidatorsPerOperator executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-maximum-delegator-stake")
        .description("Set the maximum stake amount for a delegator")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("maximumDelegatorStake", "Maximum stake amount for a delegator"))
        .asyncAction({ signer: true }, async (client, maximumDelegatorStake, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setMaximumDelegatorStake([maximumDelegatorStake]);
            logger.log("setMaximumDelegatorStake executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-maximum-validator-stake")
        .description("Set the maximum stake amount for a validator")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("maximumValidatorStake", "Maximum stake amount for a validator"))
        .asyncAction({ signer: true }, async (client, maximumValidatorStake, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setMaximumValidatorStake([maximumValidatorStake]);
            logger.log("setMaximumValidatorStake executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-operations-impl")
        .description("Set the operations implementation")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgAddress("operationsImpl", "Operations implementation"))
        .asyncAction({ signer: true }, async (client, operationsImpl, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setOperationsImpl([operationsImpl]);
            logger.log("setOperationsImpl executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-operator-fee-bips")
        .description("Set the operator fee in basis points")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("operatorFeeBips", "Operator fee in basis points"))
        .asyncAction({ signer: true }, async (client, operatorFeeBips, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setOperatorFeeBips([operatorFeeBips]);
            logger.log("setOperatorFeeBips executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-operator-fee-recipient")
        .description("Set the operator fee recipient")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgAddress("operatorFeeRecipient", "Operator fee recipient"))
        .asyncAction({ signer: true }, async (client, operatorFeeRecipient, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setOperatorFeeRecipient([operatorFeeRecipient]);
            logger.log("setOperatorFeeRecipient executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-protocol-fee-bips")
        .description("Set the protocol fee in basis points")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgBigInt("protocolFeeBips", "Protocol fee in basis points"))
        .asyncAction({ signer: true }, async (client, protocolFeeBips, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setProtocolFeeBips([protocolFeeBips]);
            logger.log("setProtocolFeeBips executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("set-protocol-fee-recipient")
        .description("Set the protocol fee recipient")
        .addOption(optStakingVaultAddress)
        .addArgument(ArgAddress("protocolFeeRecipient", "Protocol fee recipient"))
        .asyncAction({ signer: true }, async (client, protocolFeeRecipient, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const hash = await stakingVault.safeWrite.setProtocolFeeRecipient([protocolFeeRecipient]);
            logger.log("setProtocolFeeRecipient executed successfully, tx hash:", hash);
        });

    stakingVaultCmd
        .command("get-withdrawal-request-fee")
        .description("Get the withdrawal request fee")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const fee = await stakingVault.read.getWithdrawalRequestFee();
            logger.log("Withdrawal request fee:", fee);
        });

    stakingVaultCmd
        .command("info")
        .description("Get general overview of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction({ signer: true }, async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await getGeneralInfo(stakingVault, client);
        });

    stakingVaultCmd
        .command("info-fees")
        .description("Get fees clienturation of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await getFeesInfo(stakingVault);
        });

    stakingVaultCmd
        .command("info-operators")
        .description("Get operators details of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await getOperatorsInfo(stakingVault);
        });

    stakingVaultCmd
        .command("info-validators")
        .description("Get validators details per operator of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await getValidatorsInfo(stakingVault);
        });

    stakingVaultCmd
        .command("info-delegators")
        .description("Get delegations details per operator of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await getDelegatorsInfo(stakingVault);
        });

    stakingVaultCmd
        .command("info-withdrawals")
        .description("Get withdrawal queue info of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await getWithdrawalsInfo(stakingVault);
        });

    stakingVaultCmd
        .command("info-epoch")
        .description("Get epoch info of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await getEpochInfo(stakingVault);
        });

    stakingVaultCmd
        .command("info-full")
        .description("Get all information about the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            await getGeneralInfo(stakingVault, client);
            await getFeesInfo(stakingVault);
            await getOperatorsInfo(stakingVault);
            await getValidatorsInfo(stakingVault);
            await getDelegatorsInfo(stakingVault);
            await getWithdrawalsInfo(stakingVault);
            await getEpochInfo(stakingVault);
        });

    stakingVaultCmd
        .command("get-current-epoch")
        .description("Get current epoch number of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const currentEpoch = await stakingVault.read.getCurrentEpoch();
            logger.log(`Current epoch: ${currentEpoch}`);
        });

    stakingVaultCmd
        .command("get-epoch-duration")
        .description("Get epoch duration in seconds of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const epochDuration = await stakingVault.read.getEpochDuration();
            logger.log(`Epoch duration (seconds): ${epochDuration}`);
        });

    stakingVaultCmd
        .command("get-next-epoch-start-time")
        .description("Get next epoch start time (timestamp) of the StakingVault")
        .addOption(optStakingVaultAddress)
        .asyncAction(async (client, options) => {
            const stakingVault = await getStakingVault(client, options.stakingVaultAddress);
            const startTime = await stakingVault.read.getStartTime();
            const [epochDuration, currentEpoch] = await stakingVault.multicall(["getEpochDuration", "getCurrentEpoch"]);
            const nextEpochStartTime = startTime + (epochDuration * (currentEpoch + 1n));
            const nextEpochStartDate = new Date(Number(nextEpochStartTime) * 1000);
            logger.log(`Next epoch start time (timestamp): ${nextEpochStartTime} => ${nextEpochStartDate.toLocaleString()}`);
        });
    return stakingVaultCmd;
}
