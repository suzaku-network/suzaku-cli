import { Command } from "commander";
import { parseUnits } from "viem";
import { registerL1, getL1s } from "./l1";
import { registerOperator } from "./operator";
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
        .argument("[fee]", "Obligatory fee in wei", "10000000000000000")
        .action(async (validatorManager, l1Middleware, metadataUrl, feeStr) => {
            console.log("DEBUG: We are inside the .action callback for register-l1");
            const fee = BigInt(feeStr);
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);

            await registerL1(config, client, validatorManager, l1Middleware, metadataUrl, fee);
        });

    program
        .command("get-l1s")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getL1s(client, config.l1Registry as `0x${string}`, config.abis.L1Registry);
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

    /* --------------------------------------------------
    * VAULT MANAGER
    * -------------------------------------------------- */
    program
        .command("vault-manager-register-vault-l1")
        .argument("<vaultAddress>")
        .argument("<assetClass>")
        .argument("<maxLimit>")
        .action(async (vaultAddress, assetClass, maxLimit) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await registerVaultL1(
                client,
                config.vaultManager as `0x${string}`,
                config.abis.VaultManager,
                vaultAddress as `0x${string}`,
                BigInt(assetClass),
                BigInt(maxLimit)
            );
        });

    program
        .command("vault-manager-update-vault-max-l1-limit")
        .argument("<vaultAddress>")
        .argument("<assetClass>")
        .argument("<maxLimit>")
        .action(async (vaultAddress, assetClass, maxLimit) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await updateVaultMaxL1Limit(
                client,
                config.vaultManager as `0x${string}`,
                config.abis.VaultManager,
                vaultAddress as `0x${string}`,
                BigInt(assetClass),
                BigInt(maxLimit)
            );
        });

    program
        .command("vault-manager-remove-vault")
        .argument("<vaultAddress>")
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await removeVault(
                client,
                config.vaultManager as `0x${string}`,
                config.abis.VaultManager,
                vaultAddress as `0x${string}`
            );
        });

    program
        .command("get-vault-count")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getVaultCount(
                client,
                config.vaultManager as `0x${string}`,
                config.abis.VaultManager
            );
        });

    program
        .command("get-vault-at-with-times")
        .argument("<index>")
        .action(async (index) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getVaultAtWithTimes(
                client,
                config.vaultManager as `0x${string}`,
                config.abis.VaultManager,
                BigInt(index)
            );
        });

    program
        .command("get-vault-asset-class")
        .argument("<vaultAddress>")
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getVaultAssetClass(
                client,
                config.vaultManager as `0x${string}`,
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
        .argument("<collateralAddress>")
        .argument("<amount>")
        .option("--onBehalfOf <behalfOf>", "Optional onBehalfOf address")
        .action(async (vaultAddress, collateralAddress, amount, options) => {
            const onBehalfOf = options.onBehalfOf ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            const amountWei = parseUnits(amount, 18);

            await depositVault(
                client,
                vaultAddress as `0x${string}`,
                collateralAddress as `0x${string}`,
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
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRegisterOperator(
                client,
                config.middlewareService as `0x${string}`,       // or "0xYOUR_MIDDLEWARE"
                config.abis.MiddlewareService,                  // your actual ABI
                operator as `0x${string}`
            );
        });

    // Disable operator
    program
        .command("middleware-disable-operator")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareDisableOperator(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // Remove operator
    program
        .command("middleware-remove-operator")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRemoveOperator(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // Add node
    program
        .command("middleware-add-node")
        .argument("<nodeId>")
        .argument("<blsKey>")
        .option("--initial-stake <initialStake>", "Initial stake amount (default: 0)", "0")
        .option("--registration-expiry <expiry>", "Expiry timestamp (default: now + 12 hours)")
        .option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold (default: 1)", "1")
        .option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold (default: 1)", "1")
        .option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address", collectMultiple, [])
        .option("--pchain-disable-owner-address <address>", "P-Chain disable owner address", collectMultiple, [])
        .action(async (nodeId, blsKey, options) => {
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
                config.middlewareService as `0x${string}`,
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
        .argument("<operator>")
        .argument("<nodeId>")
        .argument("<addNodeTxHash>")
        .argument("<blsProofOfPossession>")
        .option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.")
        .option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee (default: 0.1 AVAX)", "0.1")
        .action(async (operator, nodeId, addNodeTxHash, blsProofOfPossession, options) => {
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
                config.middlewareService as `0x${string}`,
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
        .argument("<nodeId>")
        .action(async (nodeId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareRemoveNode(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                nodeId as string
            );
        });

    // Complete validator removal
    program
        .command("middleware-complete-validator-removal")
        .argument("<nodeId>")
        .argument("<removeNodeTxHash>")
        .option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.")
        .action(async (nodeId, removeNodeTxHash, options) => {
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
                config.middlewareService as `0x${string}`,
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
        .argument("<nodeId>")
        .argument("<newStake>")
        .action(async (nodeId, newStake) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareInitStakeUpdate(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                nodeId as `0x${string}`,
                BigInt(newStake)
            );
        });

    // Complete stake update
    program
        .command("middleware-complete-stake-update")
        .description("Complete validator stake update")
        .argument("<nodeId>")
        .argument("<validatorStakeUpdateTxHash>")
        .option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.")
        .action(async (nodeId, validatorStakeUpdateTxHash, options) => {
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
                config.middlewareService as `0x${string}`,
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
        .argument("<epoch>")
        .argument("<assetClass>")
        .action(async (epoch, assetClass) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            console.log("Calculating and caching stakes...");
            
            try {
                if (!client.account) {
                    throw new Error('Client account is required');
                }
            
                const hash = await client.writeContract({
                    address: config.middlewareService as `0x${string}`,
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
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareCalcNodeStakes(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService
            );
        });

    // forceUpdateNodes
    program
        .command("middleware-force-update-nodes")
        .description("Force update operator nodes with stake limit")
        .argument("<operator>")
        .option("--limit-stake <stake>", "Stake limit (default: 0)", "0")
        .action(async (operator, options) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await middlewareForceUpdateNodes(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`,
                BigInt(options.limitStake)
            );
        });

    // getOperatorStake (read)
    program
        .command("middleware-get-operator-stake")
        .argument("<operator>")
        .argument("<epoch>")
        .argument("<assetClass>")
        .action(async (operator, epoch, assetClass) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorStake(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`,
                BigInt(epoch),
                BigInt(assetClass)
            );
        });

    // getCurrentEpoch (read)
    program
        .command("middleware-get-current-epoch")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetCurrentEpoch(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService
            );
        });

    // getEpochStartTs (read)
    program
        .command("middleware-get-epoch-start-ts")
        .argument("<epoch>")
        .action(async (epoch) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetEpochStartTs(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                BigInt(epoch)
            );
        });

    // getActiveNodesForEpoch (read)
    program
        .command("middleware-get-active-nodes-for-epoch")
        .argument("<operator>")
        .argument("<epoch>")
        .action(async (operator, epoch) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetActiveNodesForEpoch(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`,
                BigInt(epoch)
            );
        });

    // getOperatorNodesLength (read)
    program
        .command("middleware-get-operator-nodes-length")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorNodesLength(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // getNodeStakeCache (read)
    program
        .command("middleware-get-node-stake-cache")
        .description("Get node stake cache for a specific epoch and validator")
        .argument("<epoch>")
        .argument("<validatorId>")
        .action(async (epoch, validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetNodeStakeCache(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                BigInt(epoch),
                validatorId as `0x${string}`
            );
        });

    // getOperatorLockedStake (read)
    program
        .command("middleware-get-operator-locked-stake")
        .description("Get operator locked stake")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorLockedStake(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // nodePendingRemoval (read)
    program
        .command("middleware-node-pending-removal")
        .description("Check if node is pending removal")
        .argument("<validatorId>")
        .action(async (validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareNodePendingRemoval(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                validatorId as `0x${string}`
            );
        });

    // nodePendingUpdate (read)
    program
        .command("middleware-node-pending-update")
        .description("Check if node is pending stake update")
        .argument("<validatorId>")
        .action(async (validatorId) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareNodePendingUpdate(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                validatorId as `0x${string}`
            );
        });

    // getOperatorUsedStakeCached (read)
    program
        .command("middleware-get-operator-used-stake")
        .description("Get operator used stake from cache")
        .argument("<operator>")
        .action(async (operator) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetOperatorUsedStake(
                client,
                config.middlewareService as `0x${string}`,
                config.abis.MiddlewareService,
                operator as `0x${string}`
            );
        });

    // getAllOperators (read)
    program
        .command("middleware-get-all-operators")
        .description("Get all operators registered in the middleware")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await middlewareGetAllOperators(
                client,
                config.middlewareService as `0x${string}`,
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
        .argument("<middlewareAddress>")
        .argument("<maxWeight>")
        .action(async (middlewareAddress, maxWeight) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generateClient(opts.privateKey, opts.network);
            await setUpSecurityModule(
                client,
                config.balancerValidatorManager as `0x${string}`,
                config.abis.BalancerValidatorManager,
                middlewareAddress as `0x${string}`,
                BigInt(maxWeight)
            );
        });

    program
        .command("balancer-get-security-modules")
        .action(async () => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getSecurityModules(
                client,
                config.balancerValidatorManager as `0x${string}`,
                config.abis.BalancerValidatorManager
            );
        });

    program
        .command("balancer-get-security-module-weights")
        .argument("<securityModule>")
        .action(async (securityModule) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);
            await getSecurityModuleWeights(
                client,
                config.balancerValidatorManager as `0x${string}`,
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
        .argument("<operatorAddress>")
        .description("Show operator stakes across L1s, enumerating each L1 the operator is opted into.")
        .action(async (operatorAddress) => {
            const opts = program.opts();
            const config = getConfig(opts.network);
            const client = generatePublicClient(opts.network);

            const operator = operatorAddress as `0x${string}`;
            console.log(`Operator: ${operator}`);

            // 1) Read total vaults from VaultManager
            const vaultCount = (await client.readContract({
                address: config.vaultManager as `0x${string}`,
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
                    address: config.vaultManager as `0x${string}`,
                    abi: config.abis.VaultManager,
                    functionName: 'getVaultAtWithTimes',
                    args: [i],
                })) as [`0x${string}`, bigint, bigint];

                console.log(`\nVault #${i}: ${vaultAddress}`);

                // read the assetClass
                const assetClass = (await client.readContract({
                    address: config.vaultManager as `0x${string}`,
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


    program.parse(process.argv);


}

main().catch((err) => console.error(err));
