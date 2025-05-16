import { Command } from "commander";
import { parseUnits } from "viem";
import { registerL1, getL1s, setL1MetadataUrl } from "./l1";
import { listOperators, registerOperator } from "./operator";
import { getConfig } from "./config";
import { generateClient, generatePublicClient } from "./client";
import { derivePChainAddressFromPrivateKey } from "./lib/pChainUtils";
import {
    registerVaultL1,
    updateVaultMaxL1Limit,
    removeVault,
    getVaultCount,
    getVaultAtWithTimes,
    getVaultAssetClass
} from "./vaultManager";
import {
    depositVault,
    withdrawVault,
    claimVault,
    getVaultDelegator,
    getStake
} from "./vault";

import {
    setL1Limit,
    setOperatorL1Shares
} from "./delegator";

import {
    middlewareRegisterOperator,
    middlewareDisableOperator,
    middlewareRemoveOperator,
    middlewareAddNode,
    middlewareCompleteValidatorRegistration,
    middlewareRemoveNode,
    middlewareCompleteValidatorRemoval,
    middlewareInitStakeUpdate,
    middlewareCompleteStakeUpdate,
    middlewareCalcNodeStakes,
    middlewareForceUpdateNodes,
    middlewareGetOperatorStake,
    middlewareGetCurrentEpoch,
    middlewareGetEpochStartTs,
    middlewareGetActiveNodesForEpoch,
    middlewareGetOperatorNodesLength,
    middlewareGetNodeStakeCache,
    middlewareGetOperatorLockedStake,
    middlewareNodePendingRemoval,
    middlewareNodePendingUpdate,
    middlewareGetOperatorUsedStake,
    middlewareGetAllOperators
} from "./middleware";

import {
    optInL1,
    optOutL1,
    checkOptInL1,
    optInVault,
    optOutVault,
    checkOptInVault
} from "./operatorOptIn";

import {
    setUpSecurityModule,
    getSecurityModules,
    getSecurityModuleWeights
} from "./balancer";
import { 
    getValidationUptimeMessage, 
    computeValidatorUptime, 
    reportAndSubmitValidatorUptime,
    computeOperatorUptimeAtEpoch,
    computeOperatorUptimeForEpochs,
    getValidatorUptimeForEpoch,
    isValidatorUptimeSetForEpoch,
    getOperatorUptimeForEpoch,
    isOperatorUptimeSetForEpoch,
    getLastUptimeCheckpoint
} from "./uptime";

import {
    distributeRewards,
    claimRewards,
    claimOperatorFee,
    claimCuratorFee,
    claimProtocolFee,
    claimUndistributedRewards,
    setRewardsAmountForEpochs,
    setRewardsShareForAssetClass,
    setMinRequiredUptime,
    setAdminRole,
    setProtocolOwner,
    updateProtocolFee,
    updateOperatorFee,
    updateCuratorFee,
    getRewardsAmountPerTokenFromEpoch,
    getRewardsAmountForTokenFromEpoch,
    getOperatorShares,
    getVaultShares,
    getCuratorShares,
    getProtocolRewards,
    getDistributionBatch,
    getFeesConfiguration,
    getRewardsShareForAssetClass,
    getMinRequiredUptime,
    getLastEpochClaimedStaker,
    getLastEpochClaimedOperator,
    getLastEpochClaimedCurator,
    getLastEpochClaimedProtocol
} from "./rewards";

async function getDefaultAccount(opts: any): Promise<`0x${string}`> {
    const client = generateClient(opts.privateKey, opts.network);
    return client.account?.address as `0x${string}`;
}

function collectMultiple(value: string, previous: string[]): string[] {
    return previous.concat([value]);
}


async function main() {
    const program = new Command();

    program
        .name('suzaku-cli')
        .option('-k, --private-key <privateKey>', '', process.env.PK)
        .option('-n, --network <network>', '', 'fuji')
        .version('0.1.0');

    /* --------------------------------------------------
   * L1 REGISTRY COMMANDS
   * -------------------------------------------------- */
    program
        .command("register-l1")
        .argument("<validatorManager>")
        .argument("<l1Middleware>")
        .argument("<metadataUrl>")
        .action(async (validatorManager, l1Middleware, metadataUrl) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);

            await registerL1(config, client, validatorManager, l1Middleware, metadataUrl);
        });

    program
        .command("get-l1s")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getL1s(client, config.l1Registry as `0x${string}`, config.abis.L1Registry);
        });

    program
        .command("set-l1-metadata-url")
        .argument("<l1Address>")
        .argument("<metadataUrl>")
        .action(async (l1Address, metadataUrl) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await setL1MetadataUrl(client, config.l1Registry as `0x${string}`, config.abis.L1Registry, l1Address, metadataUrl);
        });


    /* --------------------------------------------------
    * OPERATOR REGISTRY COMMANDS
    * -------------------------------------------------- */
    program
        .command("register-operator")
        .argument("<metadataUrl>")
        .action(async (metadataUrl) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await registerOperator(config, client, metadataUrl);
        });

    program
        .command("get-operators")
        .description("List all operators registered in the operator registry")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await listOperators(config, client);
        });

    /* --------------------------------------------------
    * VAULT MANAGER
    * -------------------------------------------------- */
    program
        .command("vault-manager-register-vault-l1")
        .argument("<middlewareVaultManagerAddress>")
        .argument("<vaultAddress>")
        .argument("<assetClass>")
        .argument("<maxLimit>")
        .action(async (middlewareVaultManagerAddress, vaultAddress, assetClass, maxLimit) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await registerVaultL1(
                client,
                middlewareVaultManagerAddress,
                config.abis.VaultManager,
                vaultAddress as `0x${string}`,
                BigInt(assetClass),
                BigInt(maxLimit)
            );
        });

    program
        .command("vault-manager-update-vault-max-l1-limit")
        .argument("<middlewareVaultManagerAddress>")
        .argument("<vaultAddress>")
        .argument("<assetClass>")
        .argument("<maxLimit>")
        .action(async (middlewareVaultManagerAddress, vaultAddress, assetClass, maxLimit) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await updateVaultMaxL1Limit(
                client,
                middlewareVaultManagerAddress,
                config.abis.VaultManager,
                vaultAddress as `0x${string}`,
                BigInt(assetClass),
                BigInt(maxLimit)
            );
        });

    program
        .command("vault-manager-remove-vault")
        .argument("<middlewareVaultManager>")
        .argument("<vaultAddress>")
        .action(async (middlewareVaultManager, vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await removeVault(
                client,
                middlewareVaultManager as `0x${string}`,
                config.abis.VaultManager,
                vaultAddress as `0x${string}`
            );
        });

    program
        .command("get-vault-count")
        .argument("<middlewareVaultManager>")
        .action(async (middlewareVaultManager) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getVaultCount(
                client,
                middlewareVaultManager as `0x${string}`,
                config.abis.VaultManager
            );
        });

    program
        .command("get-vault-at-with-times")
        .argument("<middlewareVaultManager>")
        .argument("<index>")
        .action(async (middlewareVaultManager, index) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getVaultAtWithTimes(
                client,
                middlewareVaultManager as `0x${string}`,
                config.abis.VaultManager,
                BigInt(index)
            );
        });

    program
        .command("get-vault-asset-class")
        .argument("<middlewareVaultManager>")
        .argument("<vaultAddress>")
        .action(async (middlewareVaultManager, vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getVaultAssetClass(
                client,
                middlewareVaultManager as `0x${string}`,
                config.abis.VaultManager,
                vaultAddress as `0x${string}`
            );
        });

    /* --------------------------------------------------
    * VAULT DEPOSIT/WITHDRAW/CLAIM
    * -------------------------------------------------- */
    program
        .command("deposit")
        .argument("<vaultAddress>")
        .argument("<amount>")
        .option("--onBehalfOf <behalfOf>", "Optional onBehalfOf address")
        .action(async (vaultAddress, amount, options) => {
            const onBehalfOf = options.onBehalfOf ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            const amountWei = parseUnits(amount, 18);

            await depositVault(
                client,
                vaultAddress as `0x${string}`,
                config.abis.VaultTokenized,
                onBehalfOf as `0x${string}`,
                amountWei
            );
        });

    program
        .command("withdraw")
        .argument("<vaultAddress>")
        .argument("<amount>")
        .option("--claimer <claimer>", "Optional claimer")
        .action(async (vaultAddress, amount, options) => {
            const claimer = options.claimer ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            const amountWei = parseUnits(amount, 18);
            await withdrawVault(
                client,
                vaultAddress as `0x${string}`,
                config.abis.VaultTokenized,
                claimer as `0x${string}`,
                amountWei
            );
        });

    program
        .command("claim")
        .argument("<vaultAddress>")
        .argument("<epoch>")
        .option("--recipient <recipient>", "Optional recipient")
        .action(async (vaultAddress, epoch, options) => {
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await claimVault(
                client,
                vaultAddress as `0x${string}`,
                config.abis.VaultTokenized,
                recipient as `0x${string}`,
                BigInt(epoch)
            );
        });

    /* --------------------------------------------------
    * L1RestakeDelegator (set-l1-limit / set-operator-l1-shares)
    * -------------------------------------------------- */
    program
        .command("set-l1-limit")
        .argument("<delegatorAddress>")
        .argument("<l1Address>")
        .argument("<limit>")
        .argument("<assetClass>", "Asset class")
        .action(async (delegatorAddress, l1Address, limit, assetClass) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await setL1Limit(
                client,
                delegatorAddress as `0x${string}`,
                config.abis.L1RestakeDelegator,
                l1Address as `0x${string}`,
                BigInt(assetClass),
                BigInt(limit)
            );
        });

    program
        .command("set-operator-l1-shares")
        .argument("<delegatorAddress>")
        .argument("<l1Address>")
        .argument("<operatorAddress>")
        .argument("<shares>")
        .argument("<assetClass>", "Asset class")
        .action(async (delegatorAddress, l1Address, operatorAddress, shares, assetClass) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await setOperatorL1Shares(
                client,
                delegatorAddress as `0x${string}`,
                config.abis.L1RestakeDelegator,
                l1Address as `0x${string}`,
                BigInt(assetClass),
                operatorAddress as `0x${string}`,
                BigInt(shares)
            );
        });

    /* --------------------------------------------------
    * MIDDLEWARE
    * -------------------------------------------------- */

    // Register operator
    program
        .command("middleware-register-operator")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRegisterOperator(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // Disable operator
    program
        .command("middleware-disable-operator")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareDisableOperator(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // Remove operator
    program
        .command("middleware-remove-operator")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRemoveOperator(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // Add node
    program
        .command("middleware-add-node")
        .argument("<middlewareAddress>")
        .argument("<nodeId>")
        .argument("<blsKey>")
        .option("--initial-stake <initialStake>", "Initial stake amount (default: 0)", "0")
        .option("--registration-expiry <expiry>", "Expiry timestamp (default: now + 12 hours)")
        .option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold (default: 1)", "1")
        .option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold (default: 1)", "1")
        .option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address", collectMultiple, [])
        .option("--pchain-disable-owner-address <address>", "P-Chain disable owner address", collectMultiple, [])
        .action(async (middlewareAddress, nodeId, blsKey, options) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);

            // Default registration expiry to now + 12 hours if not provided
            const registrationExpiry = options.registrationExpiry
                ? BigInt(options.registrationExpiry)
                : BigInt(Math.floor(Date.now() / 1000) + 12 * 60 * 60); // current time + 12 hours in seconds

            // Build remainingBalanceOwner and disableOwner PChainOwner structs
            // If pchainRemainingBalanceOwnerAddress or pchainDisableOwnerAddress are empty (not provided), use the client account
            const remainingBalanceOwnerAddress = options.pchainRemainingBalanceOwnerAddress.length > 0 ? options.pchainRemainingBalanceOwnerAddress : [(await getDefaultAccount(program.opts()))];
            const disableOwnerAddress = options.pchainDisableOwnerAddress.length > 0 ? options.pchainDisableOwnerAddress : [(await getDefaultAccount(program.opts()))];
            const remainingBalanceOwner: [bigint, `0x${string}`[]] = [
                BigInt(options.pchainRemainingBalanceOwnerThreshold),
                remainingBalanceOwnerAddress as `0x${string}`[]
            ];
            const disableOwner: [bigint, `0x${string}`[]] = [
                BigInt(options.pchainDisableOwnerThreshold),
                disableOwnerAddress as `0x${string}`[]
            ];

            // Call middlewareAddNode
            await middlewareAddNode(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                nodeId,
                blsKey as `0x${string}`,
                registrationExpiry,
                remainingBalanceOwner,
                disableOwner,
                BigInt(options.initialStake),
            );
        });

    // Complete validator registration
    program
        .command("middleware-complete-validator-registration")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .argument("<nodeId>")
        .argument("<addNodeTxHash>")
        .argument("<blsProofOfPossession>")
        .option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.")
        .option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee (default: 0.1 AVAX)", "0.1")
        .action(async (middlewareAddress, operator, nodeId, addNodeTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey;
            }

            // Derive pchainTxAddress from the private key
            // Determine the right network prefix (e.g., 'P-fuji' vs 'P-avax')
            const networkPrefix = opts.network === 'mainnet' ? 'avax' : 'fuji';
            let pchainTxAddress = derivePChainAddressFromPrivateKey(options.pchainTxPrivateKey, networkPrefix);

            // Call middlewareCompleteValidatorRegistration
            await middlewareCompleteValidatorRegistration(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`,
                nodeId as string,
                options.pchainTxPrivateKey as string,
                pchainTxAddress as string,
                blsProofOfPossession as string,
                addNodeTxHash as `0x${string}`,
                Number(options.initialBalance)
            );
        });

    // Remove node
    program
        .command("middleware-remove-node")
        .argument("<middlewareAddress>")
        .argument("<nodeId>")
        .action(async (middlewareAddress, nodeId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRemoveNode(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                nodeId as string
            );
        });

    // Complete validator removal
    program
        .command("middleware-complete-validator-removal")
        .argument("<middlewareAddress>")
        .argument("<nodeId>")
        .argument("<removeNodeTxHash>")
        .option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.")
        .action(async (middlewareAddress, nodeId, removeNodeTxHash, options) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey;
            }

            // Derive pchainTxAddress from the private key
            const networkPrefix = opts.network === 'mainnet' ? 'avax' : 'fuji';
            let pchainTxAddress = derivePChainAddressFromPrivateKey(options.pchainTxPrivateKey, networkPrefix);

            await middlewareCompleteValidatorRemoval(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                nodeId as string,
                removeNodeTxHash as `0x${string}`,
                options.pchainTxPrivateKey as string,
                pchainTxAddress as string
            );
        });

    // Init stake update
    program
        .command("middleware-init-stake-update")
        .description("Initialize validator stake update and lock")
        .argument("<middlewareAddress>")
        .argument("<nodeId>")
        .argument("<newStake>")
        .action(async (middlewareAddress, nodeId, newStake) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareInitStakeUpdate(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                nodeId as `0x${string}`,
                BigInt(newStake)
            );
        });

    // Complete stake update
    program
        .command("middleware-complete-stake-update")
        .description("Complete validator stake update")
        .argument("<middlewareAddress>")
        .argument("<nodeId>")
        .argument("<validatorStakeUpdateTxHash>")
        .option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.")
        .action(async (middlewareAddress, nodeId, validatorStakeUpdateTxHash, options) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey;
            }

            // Derive pchainTxAddress from the private key
            // Determine the right network prefix (e.g., 'P-fuji' vs 'P-avax')
            const networkPrefix = opts.network === 'mainnet' ? 'avax' : 'fuji';
            let pchainTxAddress = derivePChainAddressFromPrivateKey(options.pchainTxPrivateKey, networkPrefix);

            await middlewareCompleteStakeUpdate(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                nodeId as `0x${string}`,
                validatorStakeUpdateTxHash as `0x${string}`,
                options.pchainTxPrivateKey as string,
                pchainTxAddress as string
            );
        });

    // Operator cache / calcAndCacheStakes
    program
        .command("middleware-operator-cache")
        .description("Calculate and cache stakes for operators")
        .argument("<middlewareAddress>")
        .argument("<epoch>")
        .argument("<assetClass>")
        .action(async (middlewareAddress, epoch, assetClass) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            console.log("Calculating and caching stakes...");

            try {
                if (!client.account) {
                    throw new Error('Client account is required');
                }

                const hash = await client.writeContract({
                    address: middlewareAddress as `0x${string}`,
                    abi: config.abis.MiddlewareService,
                    functionName: 'calcAndCacheStakes',
                    args: [BigInt(epoch), BigInt(assetClass)],
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
        });

    // calcAndCacheNodeStakeForAllOperators
    program
        .command("middleware-calc-node-stakes")
        .description("Calculate and cache node stakes for all operators")
        .argument("<middlewareAddress>")
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareCalcNodeStakes(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService
            );
        });

    // forceUpdateNodes
    program
        .command("middleware-force-update-nodes")
        .description("Force update operator nodes with stake limit")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .option("--limit-stake <stake>", "Stake limit (default: 0)", "0")
        .action(async (middlewareAddress, operator, options) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareForceUpdateNodes(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`,
                BigInt(options.limitStake)
            );
        });

    // getOperatorStake (read)
    program
        .command("middleware-get-operator-stake")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .argument("<epoch>")
        .argument("<assetClass>")
        .action(async (middlewareAddress, operator, epoch, assetClass) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorStake(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`,
                BigInt(epoch),
                BigInt(assetClass)
            );
        });

    // getCurrentEpoch (read)
    program
        .command("middleware-get-current-epoch")
        .argument("<middlewareAddress>")
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetCurrentEpoch(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService
            );
        });

    // getEpochStartTs (read)
    program
        .command("middleware-get-epoch-start-ts")
        .argument("<middlewareAddress>")
        .argument("<epoch>")
        .action(async (middlewareAddress, epoch) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetEpochStartTs(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                BigInt(epoch)
            );
        });

    // getActiveNodesForEpoch (read)
    program
        .command("middleware-get-active-nodes-for-epoch")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .argument("<epoch>")
        .action(async (middlewareAddress, operator, epoch) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetActiveNodesForEpoch(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`,
                BigInt(epoch)
            );
        });

    // getOperatorNodesLength (read)
    program
        .command("middleware-get-operator-nodes-length")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorNodesLength(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // getNodeStakeCache (read)
    program
        .command("middleware-get-node-stake-cache")
        .description("Get node stake cache for a specific epoch and validator")
        .argument("<middlewareAddress>")
        .argument("<epoch>")
        .argument("<validatorId>")
        .action(async (middlewareAddress, epoch, validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetNodeStakeCache(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                BigInt(epoch),
                validatorId as `0x${string}`
            );
        });

    // getOperatorLockedStake (read)
    program
        .command("middleware-get-operator-locked-stake")
        .description("Get operator locked stake")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorLockedStake(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // nodePendingRemoval (read)
    program
        .command("middleware-node-pending-removal")
        .description("Check if node is pending removal")
        .argument("<middlewareAddress>")
        .argument("<validatorId>")
        .action(async (middlewareAddress, validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareNodePendingRemoval(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                validatorId as `0x${string}`
            );
        });

    // nodePendingUpdate (read)
    program
        .command("middleware-node-pending-update")
        .description("Check if node is pending stake update")
        .argument("<middlewareAddress>")
        .argument("<validatorId>")
        .action(async (middlewareAddress, validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareNodePendingUpdate(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                validatorId as `0x${string}`
            );
        });

    // getOperatorUsedStakeCached (read)
    program
        .command("middleware-get-operator-used-stake")
        .description("Get operator used stake from cache")
        .argument("<middlewareAddress>")
        .argument("<operator>")
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorUsedStake(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // getAllOperators (read)
    program
        .command("middleware-get-all-operators")
        .description("Get all operators registered in the middleware")
        .argument("<middlewareAddress>")
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetAllOperators(
                client,
                middlewareAddress as `0x${string}`,
                config.abis.MiddlewareService
            );
        });


    /**
     * --------------------------------------------------
     * OPERATOR → L1: optIn / optOut / check
     * --------------------------------------------------
     */
    program
        .command("opt-in-l1")
        .description("Operator opts in to a given L1")
        .argument("<l1Address>")
        .action(async (l1Address) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            // We'll assume in config you have something like: config.opL1OptIn = "0x..."
            // and config.abis.OpL1OptIn = the ABI.
            const client = generateClient(opts.privateKey, opts.network);
            await optInL1(
                client,
                config.opL1OptIn as `0x${string}`,
                config.abis.OperatorL1OptInService, // or whatever your key is
                l1Address as `0x${string}`,
            );
        });

    program
        .command("opt-out-l1")
        .description("Operator opts out from a given L1")
        .argument("<l1Address>")
        .action(async (l1Address) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await optOutL1(
                client,
                config.opL1OptIn as `0x${string}`,
                config.abis.OperatorL1OptInService,
                l1Address as `0x${string}`,
            );
        });

    program
        .command("check-opt-in-l1")
        .description("Check if an operator is opted in to a given L1")
        .argument("<operator>")
        .argument("<l1Address>")
        .action(async (operator, l1Address) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await checkOptInL1(
                client,
                config.opL1OptIn as `0x${string}`,
                config.abis.OperatorL1OptInService,
                operator as `0x${string}`,
                l1Address as `0x${string}`,
            );
        });


    /**
     * --------------------------------------------------
     * OPERATOR → Vault: optIn / optOut / check
     * --------------------------------------------------
     */
    program
        .command("opt-in-vault")
        .description("Operator opts in to a given Vault")
        .argument("<vaultAddress>")
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await optInVault(
                client,
                config.opVaultOptIn as `0x${string}`,
                config.abis.OperatorVaultOptInService,
                vaultAddress as `0x${string}`,
            );
        });

    program
        .command("opt-out-vault")
        .description("Operator opts out from a given Vault")
        .argument("<vaultAddress>")
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await optOutVault(
                client,
                config.opVaultOptIn as `0x${string}`,
                config.abis.OperatorVaultOptInService,
                vaultAddress as `0x${string}`,
            );
        });

    program
        .command("check-opt-in-vault")
        .description("Check if an operator is opted in to a given Vault")
        .argument("<operator>")
        .argument("<vaultAddress>")
        .action(async (operator, vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await checkOptInVault(
                client,
                config.opVaultOptIn as `0x${string}`,
                config.abis.OperatorVaultOptInService,
                operator as `0x${string}`,
                vaultAddress as `0x${string}`,
            );
        });

    /**
     * --------------------------------------------------
     * BALANCER
     * --------------------------------------------------
     */
    program
        .command("balancer-set-up-security-module")
        .argument("<balancerValidatorManagerAddress>")
        .argument("<middlewareAddress>")
        .argument("<maxWeight>")
        .action(async (balancerValidatorManagerAddress, middlewareAddress, maxWeight) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await setUpSecurityModule(
                client,
                balancerValidatorManagerAddress,
                config.abis.BalancerValidatorManager,
                middlewareAddress as `0x${string}`,
                BigInt(maxWeight)
            );
        });

    program
        .command("balancer-get-security-modules")
        .argument("<balancerValidatorManagerAddress")
        .action(async (balancerValidatorManagerAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getSecurityModules(
                client,
                balancerValidatorManagerAddress,
                config.abis.BalancerValidatorManager
            );
        });

    program
        .command("balancer-get-security-module-weights")
        .argument("<balancerValidatorManagerAddress>")
        .argument("<securityModule>")
        .action(async (balancerValidatorManagerAddress, securityModule) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getSecurityModuleWeights(
                client,
                balancerValidatorManagerAddress,
                config.abis.BalancerValidatorManager,
                securityModule as `0x${string}`
            );
        });

    /**
         * --------------------------------------------------
         * OP-STAKES: enumerates the vaults and attempts to read stake for <operator>
         * --------------------------------------------------
         */
    program
        .command("opstakes")
        .argument("<middlewareVaultManager>")
        .argument("<operatorAddress>")
        .description("Show operator stakes across L1s, enumerating each L1 the operator is opted into.")
        .action(async (middlewareVaultManager, operatorAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);

            const operator = operatorAddress as `0x${string}`;
            console.log(`Operator: ${operator}`);

            // 1) Read total vaults from VaultManager
            const vaultCount = (await client.readContract({
                address: middlewareVaultManager as `0x${string}`,
                abi: config.abis.VaultManager,
                functionName: 'getVaultCount',
                args: [],
            })) as bigint;

            console.log(`Found ${vaultCount} vault(s).`);

            // This map accumulates the total stake for each collateral
            const totalStakesByCollateral: Record<string, bigint> = {};

            // 2) Let's get all L1 addresses from the L1Registry (similar to your Python code)
            const totalL1s = (await client.readContract({
                address: config.l1Registry as `0x${string}`,
                abi: config.abis.L1Registry,
                functionName: 'totalL1s',
                args: [],
            })) as bigint;

            // We'll store them in an array
            const l1Array: `0x${string}`[] = [];
            for (let i = 0n; i < totalL1s; i++) {
                // e.g. getL1At(i) might return [address, metadataUrl], adjust as needed
                const [l1Address, metadataUrl] = (await client.readContract({
                    address: config.l1Registry as `0x${string}`,
                    abi: config.abis.L1Registry,
                    functionName: 'getL1At',
                    args: [i],
                })) as [`0x${string}`, string];

                l1Array.push(l1Address);
            }

            // 3) For each vault in [0..vaultCount-1], read assetClass, delegator, collateral
            for (let i = 0n; i < vaultCount; i++) {
                const [vaultAddress] = (await client.readContract({
                    address: middlewareVaultManager as `0x${string}`,
                    abi: config.abis.VaultManager,
                    functionName: 'getVaultAtWithTimes',
                    args: [i],
                })) as [`0x${string}`, bigint, bigint];

                console.log(`\nVault #${i}: ${vaultAddress}`);

                // read the assetClass
                const assetClass = (await client.readContract({
                    address: middlewareVaultManager as `0x${string}`,
                    abi: config.abis.VaultManager,
                    functionName: 'getVaultAssetClass',
                    args: [vaultAddress],
                })) as bigint;

                // read delegator
                const delegator = await client.readContract({
                    address: vaultAddress,
                    abi: config.abis.VaultTokenized,
                    functionName: 'delegator',
                    args: [],
                }) as `0x${string}`;

                if (delegator === '0x0000000000000000000000000000000000000000') {
                    console.log("    (No delegator set, skipping)");
                    continue;
                }
                // read collateral
                const collateral = await client.readContract({
                    address: vaultAddress,
                    abi: config.abis.VaultTokenized,
                    functionName: 'collateral',
                    args: [],
                }) as `0x${string}`;

                // 4) For each L1 in l1Array, check if operator is opted in
                for (const l1Address of l1Array) {
                    const isOptedIn = await client.readContract({
                        address: config.opL1OptIn as `0x${string}`,
                        abi: config.abis.OperatorL1OptInService,
                        functionName: 'isOptedIn',
                        args: [operator, l1Address],
                    }) as boolean;

                    if (isOptedIn) {
                        // read stake
                        const stakeValue = await client.readContract({
                            address: delegator,
                            abi: config.abis.L1RestakeDelegator,
                            functionName: 'stake',
                            args: [l1Address, assetClass, operator],
                        }) as bigint;

                        if (stakeValue > 0n) {
                            console.log(
                                `    L1: ${l1Address} => stake = ${stakeValue.toString()} (vault=${vaultAddress})`
                            );

                            // sum into totalStakesByCollateral
                            const oldVal = totalStakesByCollateral[collateral] || 0n;
                            totalStakesByCollateral[collateral] = oldVal + stakeValue;
                        }
                    }
                }
            }

            // 5) Finally, print aggregated totals
            console.log("\nAggregated stakes by collateral:");
            if (Object.keys(totalStakesByCollateral).length === 0) {
                console.log("   No stakes found or operator not opted into any L1s this way.");
            } else {
                for (const [collateralAddr, totalWei] of Object.entries(totalStakesByCollateral)) {
                    // optional: look up decimals for that collateral if you want a float
                    const decimals = 18; // or read from chain
                    const floatAmount = Number(totalWei) / 10 ** decimals;
                    console.log(`   Collateral=${collateralAddr} totalStakeWei=${totalWei} => ${floatAmount}`);
                }
            }
        });

    program
        .command("l1stakes")
        .argument("<validatorManagerAddress>")
        .description("Show L1 stakes for a given validator manager")
        .action(async (validatorManagerAddress) => {
            // TODO: Implement
        });

    // --------------------------------------------------
    // "help" for help function
    // --------------------------------------------------
    program
        .command("help [command]")
        .description("Display help for a specific command or the entire CLI")
        .action((cmd) => {
            if (cmd) {
                const sub = program.commands.find(c => c.name() === cmd);
                if (!sub) {
                    console.error(`Unknown command: ${cmd}`);
                    program.outputHelp();
                    process.exit(1);
                }
                sub.help();
            } else {
                program.help();
            }
        });

    program
        .command("get-validation-uptime-message")
        .description("Get the validation uptime message for a given validator in the given L1 RPC")
        .argument("<rpcUrl>")
        .argument("<chainId>")
        .argument("<nodeId>")
        .action(async (rpcUrl, chainId, nodeId) => {
            const opts = program.opts();
            if (opts.network === "fuji") {
                await getValidationUptimeMessage(rpcUrl, nodeId, 5, chainId);
            } else {
                await getValidationUptimeMessage(rpcUrl, nodeId, 1, chainId);
            }
        });

    program
        .command('compute-validator-uptime')
        .argument('<uptimeTrackerAddress>')
        .argument('<signedUptimeHex>')
        .option('--messageIndex <int>', 'Warp message index', '0')
        .action(async (uptimeTrackerAddress, signedUptimeHex, options) => {
          const { privateKey, network } = program.opts();
          const messageIndex = parseInt(options.messageIndex, 10);
          await computeValidatorUptime(
            uptimeTrackerAddress as `0x${string}`,
            signedUptimeHex as `0x${string}`,
            messageIndex,
            privateKey,
            network
          );
        });     

            // ---- Combined Uptime Reporting Command ----
    program
    .command("report-uptime-validator")
    .description("Gets a validator's signed uptime message and submits it to the UptimeTracker contract.")
    .argument("<rpcUrl>", "RPC URL of the L1/Subnet (e.g., http://localhost:9650/ext/bc/CHAIN_ID)")
    .argument("<sourceChainId>", "The Chain ID for which the uptime is being reported (used in the Warp message)")
    .argument("<nodeId>", "The NodeID of the validator (e.g., NodeID-xxxxxxxxxxx)")
    .argument("<uptimeTrackerAddress>", "Address of the UptimeTracker contract on the C-Chain")
    .option("--messageIndex <number>", "Warp message index for the UptimeTracker contract call", "0")
    // Optional: Add an explicit option if deriving warpNetworkID is complex
    // .option("--warp-network-id <number>", "Avalanche Network ID for the Warp message (e.g., 1 for Mainnet, 5 for Fuji)")
    .action(async (rpcUrl, sourceChainId, nodeId, uptimeTrackerAddress, options) => {
        const opts = program.opts();
        if (!opts.privateKey) {
            console.error("Error: Private key is required. Use -k or set PK environment variable.");
            process.exit(1);
        }

        // Determine the Avalanche Network ID for the Warp message based on the --network option
        let warpNetworkID: number;
        if (opts.network === "fuji") {
            warpNetworkID = 5;
        } else if (opts.network === "mainnet") {
            warpNetworkID = 1;
        } else if (opts.network === "anvil") {
            // For Anvil, decide if it's simulating Fuji (5) or Mainnet (1)
            // Or if it needs a different ID. Defaulting to Fuji's ID for local testing.
            console.warn("Using Warp Network ID 5 (Fuji) for Anvil. Adjust if Anvil simulates Mainnet or another network context for Warp.");
            warpNetworkID = 5;
        } else {
            // Fallback or error for unsupported networks for warpNetworkID derivation
            // You might want to make this an explicit option if network names get more complex
            throw new Error(
                `Network '${opts.network}' is not configured for determining Warp Network ID. ` +
                `Use 'fuji', 'mainnet', or 'anvil', or extend this logic.`
            );
        }

        const messageIndex = parseInt(options.messageIndex, 10);
        if (isNaN(messageIndex)) {
            console.error("Error: Invalid message index. Must be a number.");
            process.exit(1);
        }

        await reportAndSubmitValidatorUptime(
            rpcUrl,
            nodeId,
            warpNetworkID,
            sourceChainId,
            uptimeTrackerAddress as `0x${string}`,
            messageIndex,
            opts.privateKey,
            opts.network
        );
    });

    // ---- Adding new commands for operator uptime ----
    program
    .command("compute-operator-uptime")
    .description("Compute uptime for an operator at a specific epoch")
    .argument("<uptimeTrackerAddress>", "Address of the UptimeTracker contract")
    .argument("<operator>", "Address of the operator")
    .argument("<epoch>", "Epoch number")
    .action(async (uptimeTrackerAddress, operator, epoch) => {
        const opts = program.opts();
        if (!opts.privateKey) {
            console.error("Error: Private key is required. Use -k or set PK environment variable.");
            process.exit(1);
        }

        await computeOperatorUptimeAtEpoch(
            uptimeTrackerAddress as `0x${string}`,
            operator as `0x${string}`,
            parseInt(epoch, 10),
            opts.privateKey,
            opts.network
        );
    });

    program
    .command("compute-operator-uptime-range")
    .description("Compute uptime for an operator over a range of epochs (client-side looping)")
    .argument("<uptimeTrackerAddress>", "Address of the UptimeTracker contract")
    .argument("<operator>", "Address of the operator")
    .argument("<startEpoch>", "Starting epoch number")
    .argument("<endEpoch>", "Ending epoch number")
    .action(async (uptimeTrackerAddress, operator, startEpoch, endEpoch) => {
        const opts = program.opts();
        if (!opts.privateKey) {
            console.error("Error: Private key is required. Use -k or set PK environment variable.");
            process.exit(1);
        }

        await computeOperatorUptimeForEpochs(
            uptimeTrackerAddress as `0x${string}`,
            operator as `0x${string}`,
            parseInt(startEpoch, 10),
            parseInt(endEpoch, 10),
            opts.privateKey,
            opts.network
        );
    });

    // ---- Read-only commands for uptime data ----
    program
    .command("get-validator-uptime")
    .description("Get the recorded uptime for a validator at a specific epoch")
    .argument("<uptimeTrackerAddress>", "Address of the UptimeTracker contract")
    .argument("<validationID>", "Validation ID of the validator")
    .argument("<epoch>", "Epoch number")
    .action(async (uptimeTrackerAddress, validationID, epoch) => {
        const opts = program.opts();
        const uptime = await getValidatorUptimeForEpoch(
            uptimeTrackerAddress as `0x${string}`,
            validationID as `0x${string}`,
            parseInt(epoch, 10),
            opts.network
        ) as bigint;
        console.log(`Validator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
    });

    program
    .command("check-validator-uptime-set")
    .description("Check if uptime data is set for a validator at a specific epoch")
    .argument("<uptimeTrackerAddress>", "Address of the UptimeTracker contract")
    .argument("<validationID>", "Validation ID of the validator")
    .argument("<epoch>", "Epoch number")
    .action(async (uptimeTrackerAddress, validationID, epoch) => {
        const opts = program.opts();
        const isSet = await isValidatorUptimeSetForEpoch(
            uptimeTrackerAddress as `0x${string}`,
            validationID as `0x${string}`,
            parseInt(epoch, 10),
            opts.network
        );
        console.log(`Validator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
    });

    program
    .command("get-operator-uptime")
    .description("Get the recorded uptime for an operator at a specific epoch")
    .argument("<uptimeTrackerAddress>", "Address of the UptimeTracker contract")
    .argument("<operator>", "Address of the operator")
    .argument("<epoch>", "Epoch number")
    .action(async (uptimeTrackerAddress, operator, epoch) => {
        const opts = program.opts();
        const uptime = await getOperatorUptimeForEpoch(
            uptimeTrackerAddress as `0x${string}`,
            operator as `0x${string}`,
            parseInt(epoch, 10),
            opts.network
        ) as bigint;
        console.log(`Operator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
    });

    program
    .command("check-operator-uptime-set")
    .description("Check if uptime data is set for an operator at a specific epoch")
    .argument("<uptimeTrackerAddress>", "Address of the UptimeTracker contract")
    .argument("<operator>", "Address of the operator")
    .argument("<epoch>", "Epoch number")
    .action(async (uptimeTrackerAddress, operator, epoch) => {
        const opts = program.opts();
        const isSet = await isOperatorUptimeSetForEpoch(
            uptimeTrackerAddress as `0x${string}`,
            operator as `0x${string}`,
            parseInt(epoch, 10),
            opts.network
        );
        console.log(`Operator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
    });

    program
    .command("get-last-uptime-checkpoint")
    .description("Get the last uptime checkpoint for a validator")
    .argument("<uptimeTrackerAddress>", "Address of the UptimeTracker contract")
    .argument("<validationID>", "Validation ID of the validator")
    .action(async (uptimeTrackerAddress, validationID) => {
        const opts = program.opts();
        const checkpoint = await getLastUptimeCheckpoint(
            uptimeTrackerAddress as `0x${string}`,
            validationID as `0x${string}`,
            opts.network
        ) as { remainingUptime: bigint; attributedUptime: bigint; timestamp: bigint };
        console.log(`Last uptime checkpoint for validator ${validationID}:`);
        console.log(`  Remaining uptime: ${checkpoint.remainingUptime.toString()} seconds`);
        console.log(`  Attributed uptime: ${checkpoint.attributedUptime.toString()} seconds`);
        console.log(`  Timestamp: ${checkpoint.timestamp.toString()} (${new Date(Number(checkpoint.timestamp) * 1000).toISOString()})`);
    });

    /* --------------------------------------------------
    * REWARDS COMMANDS
    * -------------------------------------------------- */
    program
        .command("rewards-distribute")
        .description("Distribute rewards for a specific epoch")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<epoch>", "Epoch to distribute rewards for")
        .argument("<batchSize>", "Number of operators to process in this batch")
        .action(async (rewardsAddress, epoch, batchSize) => {
            const opts = program.opts();
            await distributeRewards(
                rewardsAddress as `0x${string}`,
                parseInt(epoch),
                parseInt(batchSize),
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-claim")
        .description("Claim rewards for a staker")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<rewardsToken>", "Address of the rewards token")
        .option("--recipient <recipient>", "Optional recipient address")
        .action(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            await claimRewards(
                rewardsAddress as `0x${string}`,
                rewardsToken as `0x${string}`,
                recipient as `0x${string}`,
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-claim-operator-fee")
        .description("Claim operator fees")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<rewardsToken>", "Address of the rewards token")
        .option("--recipient <recipient>", "Optional recipient address")
        .action(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            await claimOperatorFee(
                rewardsAddress as `0x${string}`,
                rewardsToken as `0x${string}`,
                recipient as `0x${string}`,
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-claim-curator-fee")
        .description("Claim curator fees")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<rewardsToken>", "Address of the rewards token")
        .option("--recipient <recipient>", "Optional recipient address")
        .action(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            await claimCuratorFee(
                rewardsAddress as `0x${string}`,
                rewardsToken as `0x${string}`,
                recipient as `0x${string}`,
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-claim-protocol-fee")
        .description("Claim protocol fees (only for protocol owner)")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<rewardsToken>", "Address of the rewards token")
        .option("--recipient <recipient>", "Optional recipient address")
        .action(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            await claimProtocolFee(
                rewardsAddress as `0x${string}`,
                rewardsToken as `0x${string}`,
                recipient as `0x${string}`,
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-claim-undistributed")
        .description("Claim undistributed rewards (admin only)")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<epoch>", "Epoch to claim undistributed rewards for")
        .argument("<rewardsToken>", "Address of the rewards token")
        .option("--recipient <recipient>", "Optional recipient address")
        .action(async (rewardsAddress, epoch, rewardsToken, options) => {
            const opts = program.opts();
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            await claimUndistributedRewards(
                rewardsAddress as `0x${string}`,
                parseInt(epoch),
                rewardsToken as `0x${string}`,
                recipient as `0x${string}`,
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-set-amount")
        .description("Set rewards amount for epochs")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<startEpoch>", "Starting epoch")
        .argument("<numberOfEpochs>", "Number of epochs")
        .argument("<rewardsToken>", "Address of the rewards token")
        .argument("<rewardsAmount>", "Amount of rewards in wei")
        .action(async (rewardsAddress, startEpoch, numberOfEpochs, rewardsToken, rewardsAmount) => {
            const opts = program.opts();
            await setRewardsAmountForEpochs(
                rewardsAddress as `0x${string}`,
                parseInt(startEpoch),
                parseInt(numberOfEpochs),
                rewardsToken as `0x${string}`,
                BigInt(rewardsAmount),
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-set-share-asset-class")
        .description("Set rewards share for asset class")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<assetClass>", "Asset class ID")
        .argument("<share>", "Share in basis points (100 = 1%)")
        .action(async (rewardsAddress, assetClass, share) => {
            const opts = program.opts();
            await setRewardsShareForAssetClass(
                rewardsAddress as `0x${string}`,
                BigInt(assetClass),
                parseInt(share),
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-set-min-uptime")
        .description("Set minimum required uptime for rewards eligibility")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<minUptime>", "Minimum uptime in seconds")
        .action(async (rewardsAddress, minUptime) => {
            const opts = program.opts();
            await setMinRequiredUptime(
                rewardsAddress as `0x${string}`,
                BigInt(minUptime),
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-set-admin")
        .description("Set admin role (DEFAULT_ADMIN_ROLE only)")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<newAdmin>", "New admin address")
        .action(async (rewardsAddress, newAdmin) => {
            const opts = program.opts();
            await setAdminRole(
                rewardsAddress as `0x${string}`,
                newAdmin as `0x${string}`,
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-set-protocol-owner")
        .description("Set protocol owner (DEFAULT_ADMIN_ROLE only)")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<newOwner>", "New protocol owner address")
        .action(async (rewardsAddress, newOwner) => {
            const opts = program.opts();
            await setProtocolOwner(
                rewardsAddress as `0x${string}`,
                newOwner as `0x${string}`,
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-update-protocol-fee")
        .description("Update protocol fee")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<newFee>", "New fee in basis points (100 = 1%)")
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            await updateProtocolFee(
                rewardsAddress as `0x${string}`,
                parseInt(newFee),
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-update-operator-fee")
        .description("Update operator fee")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<newFee>", "New fee in basis points (100 = 1%)")
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            await updateOperatorFee(
                rewardsAddress as `0x${string}`,
                parseInt(newFee),
                opts.privateKey,
                opts.network
            );
        });

    program
        .command("rewards-update-curator-fee")
        .description("Update curator fee")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<newFee>", "New fee in basis points (100 = 1%)")
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            await updateCuratorFee(
                rewardsAddress as `0x${string}`,
                parseInt(newFee),
                opts.privateKey,
                opts.network
            );
        });

    // Read-only getter functions
    program
        .command("rewards-get-amounts")
        .description("Get rewards amounts per token for epoch")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<epoch>", "Epoch to query")
        .action(async (rewardsAddress, epoch) => {
            const opts = program.opts();
            await getRewardsAmountPerTokenFromEpoch(
                rewardsAddress as `0x${string}`,
                parseInt(epoch),
                opts.network
            );
        });

    program
        .command("rewards-get-amount-for-token")
        .description("Get rewards amount for a specific token from epoch")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<epoch>", "Epoch to query")
        .argument("<token>", "Token address")
        .action(async (rewardsAddress, epoch, token) => {
            const opts = program.opts();
            await getRewardsAmountForTokenFromEpoch(
                rewardsAddress as `0x${string}`,
                parseInt(epoch),
                token as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-operator-shares")
        .description("Get operator shares for a specific epoch")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<epoch>", "Epoch to query") 
        .argument("<operator>", "Operator address")
        .action(async (rewardsAddress, epoch, operator) => {
            const opts = program.opts();
            await getOperatorShares(
                rewardsAddress as `0x${string}`,
                parseInt(epoch),
                operator as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-vault-shares")
        .description("Get vault shares for a specific epoch")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<epoch>", "Epoch to query")
        .argument("<vault>", "Vault address")
        .action(async (rewardsAddress, epoch, vault) => {
            const opts = program.opts();
            await getVaultShares(
                rewardsAddress as `0x${string}`,
                parseInt(epoch),
                vault as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-curator-shares")
        .description("Get curator shares for a specific epoch")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<epoch>", "Epoch to query")
        .argument("<curator>", "Curator address")
        .action(async (rewardsAddress, epoch, curator) => {
            const opts = program.opts();
            await getCuratorShares(
                rewardsAddress as `0x${string}`,
                parseInt(epoch),
                curator as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-protocol-rewards")
        .description("Get protocol rewards for a token")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<token>", "Token address")
        .action(async (rewardsAddress, token) => {
            const opts = program.opts();
            await getProtocolRewards(
                rewardsAddress as `0x${string}`,
                token as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-distribution-batch")
        .description("Get distribution batch status for an epoch")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<epoch>", "Epoch to query")
        .action(async (rewardsAddress, epoch) => {
            const opts = program.opts();
            await getDistributionBatch(
                rewardsAddress as `0x${string}`,
                parseInt(epoch),
                opts.network
            );
        });

    program
        .command("rewards-get-fees-config")
        .description("Get current fees configuration")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .action(async (rewardsAddress) => {
            const opts = program.opts();
            await getFeesConfiguration(
                rewardsAddress as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-share-asset-class")
        .description("Get rewards share for asset class")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<assetClass>", "Asset class ID")
        .action(async (rewardsAddress, assetClass) => {
            const opts = program.opts();
            await getRewardsShareForAssetClass(
                rewardsAddress as `0x${string}`,
                BigInt(assetClass),
                opts.network
            );
        });

    program
        .command("rewards-get-min-uptime")
        .description("Get minimum required uptime for rewards eligibility")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .action(async (rewardsAddress) => {
            const opts = program.opts();
            await getMinRequiredUptime(
                rewardsAddress as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-last-claimed-staker")
        .description("Get last claimed epoch for a staker")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<staker>", "Staker address")
        .action(async (rewardsAddress, staker) => {
            const opts = program.opts();
            await getLastEpochClaimedStaker(
                rewardsAddress as `0x${string}`,
                staker as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-last-claimed-operator")
        .description("Get last claimed epoch for an operator")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<operator>", "Operator address")
        .action(async (rewardsAddress, operator) => {
            const opts = program.opts();
            await getLastEpochClaimedOperator(
                rewardsAddress as `0x${string}`,
                operator as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-last-claimed-curator")
        .description("Get last claimed epoch for a curator")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<curator>", "Curator address")
        .action(async (rewardsAddress, curator) => {
            const opts = program.opts();
            await getLastEpochClaimedCurator(
                rewardsAddress as `0x${string}`,
                curator as `0x${string}`,
                opts.network
            );
        });

    program
        .command("rewards-get-last-claimed-protocol")
        .description("Get last claimed epoch for protocol owner")
        .argument("<rewardsAddress>", "Address of the rewards contract")
        .argument("<protocolOwner>", "Protocol owner address")
        .action(async (rewardsAddress, protocolOwner) => {
            const opts = program.opts();
            await getLastEpochClaimedProtocol(
                rewardsAddress as `0x${string}`,
                protocolOwner as `0x${string}`,
                opts.network
            );
        });

    program.parse(process.argv);
}

main().catch((err) => console.error(err));
