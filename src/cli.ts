import { Command, Option } from '@commander-js/extra-typings';
import { Hex, parseUnits } from "viem";
import { registerL1, getL1s, setL1MetadataUrl, setL1Middleware } from "./l1";
import { listOperators, registerOperator } from "./operator";
import { getConfig } from "./config";
import { generateClient } from "./client";
import {
    registerVaultL1,
    updateVaultMaxL1Limit,
    removeVault,
    getVaultCount,
    getVaultAtWithTimes,
    getVaultCollateralClass
} from "./vaultManager";
import {
    depositVault,
    withdrawVault,
    claimVault,
    getVaultDelegator,
    getStake,
    getVaultCollateral,
    getVaultBalanceOf,
    getVaultActiveBalanceOf,
    getVaultTotalSupply,
    getVaultWithdrawalSharesOf,
    getVaultWithdrawalsOf
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
    middlewareGetAllOperators,
    getCollateralClassIds,
    getActiveCollateralClasses,
    middlewareGetNodeLogs,
    middlewareManualProcessNodeStakeCache
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
    setRewardsShareForCollateralClass,
    setMinRequiredUptime,
    setAdminRole,
    setProtocolOwner,
    updateProtocolFee,
    updateOperatorFee,
    updateCuratorFee,
    updateAllFees,
    getRewardsAmountPerTokenFromEpoch,
    getRewardsAmountForTokenFromEpoch,
    getOperatorShares,
    getVaultShares,
    getCuratorShares,
    getProtocolRewards,
    getDistributionBatch,
    getFeesConfiguration,
    getRewardsShareForCollateralClass,
    getMinRequiredUptime,
    getLastEpochClaimedStaker,
    getLastEpochClaimedOperator,
    getLastEpochClaimedCurator,
    getLastEpochClaimedProtocol
} from "./rewards";
import { requirePChainBallance } from "./lib/transferUtils";
import { getAddresses, parseNodeID } from "./lib/utils";

import { buildCommands as buildKeyStoreCmds } from "./keyStore";
import { ArgAddress, ArgNodeID, ArgHex, ArgURI, ArgNumber, ArgBigInt, ArgAVAX, ArgBLSPOP, ArgCB58, ParserPrivateKey, ParserAddress, ParserAVAX, ParserNumber, ParserNodeID, parseSecretName, collectMultiple } from "./lib/cliParser";
import { increasePChainValidatorBalance } from './lib/pChainUtils';
import { completValidatorRemoval } from './poa';

async function getDefaultAccount(opts: any): Promise<Hex> {
    const client = generateClient(opts.network, opts.privateKey!);
    return client.account?.address as Hex;
}

// Main function to set up the CLI commands
async function main() {
    const program = new Command()
        .name('suzaku-cli')
        .addOption(new Option('-n, --network <network>')
            .choices(['fuji', 'mainnet', 'anvil'])
            .default('fuji'))
        .addOption(new Option('-k, --private-key <privateKey>')
            .env('PK').argParser(ParserPrivateKey))
        .addOption(new Option('-s, --secret-name <secretName>', 'The keystore secret name containing the private key')
            .conflicts('privateKey')
            .argParser(parseSecretName))
        .version('0.1.0');
    
    /* --------------------------------------------------
    * Generic L1 Commands
    * -------------------------------------------------- */
    program
        .command("l1-validator-balance-top-up")
        .description("Top up L1 validator balance on the P-Chain")
        .addArgument(ArgCB58("validationId", "Validation ID for the node on its subnet"))
        .addArgument(ArgNumber("amount", "Amount to top up in AVAX"))
        .action(async (validatorId, amount) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);

            const txHash = await increasePChainValidatorBalance(
                client,
                opts.privateKey!,
                amount,
                validatorId
            );
            console.log(`Top-up transaction hash: ${txHash}`);
        });
    // convertSubnetToL1
    program
        .command("create-l1")

    /* --------------------------------------------------
   * L1 REGISTRY COMMANDS
   * -------------------------------------------------- */
    program
        .command("register-l1")
        .addArgument(ArgAddress("validatorManager", "Validator manager contract address"))
        .addArgument(ArgAddress("l1Middleware", "L1 middleware contract address"))
        .addArgument(ArgURI("metadataUrl", "Metadata URL for the L1"))
        .action(async (validatorManager, l1Middleware, metadataUrl) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);

            // instantiate L1Registry and call
            const l1Registry = config.contracts.L1Registry(config.l1Registry);
            await registerL1(
                l1Registry,
                validatorManager,
                l1Middleware,
                metadataUrl,
                client.account
            );
        });

    program
        .command("get-l1s")
        .action(async () => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            await getL1s(
                config.contracts.L1Registry(config.l1Registry)
            );
        });

    program
        .command("set-l1-metadata-url")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgURI("metadataUrl", "New metadata URL"))
        .action(async (l1Address, metadataUrl) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const l1Reg = config.contracts.L1Registry(config.l1Registry);
            await setL1MetadataUrl(
                l1Reg,
                l1Address,
                metadataUrl,
                client.account!
            );
        });

    program
        .command("set-l1-middleware")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgAddress("l1Middleware", "New L1 middleware address"))
        .action(async (l1Address, l1Middleware) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const l1Reg2 = config.contracts.L1Registry(config.l1Registry);
            await setL1Middleware(
                l1Reg2,
                l1Address,
                l1Middleware,
                client.account!
            );
        });
    /* --------------------------------------------------
    * OPERATOR REGISTRY COMMANDS
    * -------------------------------------------------- */
    program
        .command("register-operator")
        .addArgument(ArgURI("metadataUrl", "Operator metadata URL"))
        .action(async (metadataUrl) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const opReg = config.contracts.OperatorRegistry(config.operatorRegistry);
            await registerOperator(
                opReg,
                metadataUrl,
                client.account!
            );
        });

    program
        .command("get-operators")
        .description("List all operators registered in the operator registry")
        .action(async () => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const opReg2 = config.contracts.OperatorRegistry(config.operatorRegistry);
            await listOperators(opReg2);
        });

    /* --------------------------------------------------
    * VAULT MANAGER
    * -------------------------------------------------- */
    program
        .command("vault-manager-register-vault-l1")
        .addArgument(ArgAddress("middlewareVaultManagerAddress", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .addArgument(ArgBigInt("maxLimit", "Maximum limit"))
        .action(async (middlewareVaultManagerAddress, vaultAddress, collateralClass, maxLimit) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            // instantiate VaultManager contract
            const vaultManager = config.contracts.VaultManager(middlewareVaultManagerAddress);
            await registerVaultL1(
                vaultManager,
                vaultAddress,
                collateralClass,
                maxLimit,
                client.account!
            );
        });

    program
        .command("vault-manager-update-vault-max-l1-limit")
        .addArgument(ArgAddress("middlewareVaultManagerAddress", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .addArgument(ArgBigInt("maxLimit", "Maximum limit"))
        .action(async (middlewareVaultManagerAddress, vaultAddress, collateralClass, maxLimit) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManagerAddress);
            await updateVaultMaxL1Limit(
                vaultManager,
                vaultAddress,
                collateralClass,
                maxLimit,
                client.account!
            );
        });

    program
        .command("vault-manager-remove-vault")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (middlewareVaultManager, vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            await removeVault(
                vaultManager,
                vaultAddress,
                client.account!
            );
        });

    program
        .command("get-vault-count")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .action(async (middlewareVaultManager) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            await getVaultCount(vaultManager);
        });

    program
        .command("get-vault-at-with-times")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgBigInt("index", "Vault index"))
        .action(async (middlewareVaultManager, index) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            await getVaultAtWithTimes(
                vaultManager,
                index
            );
        });

    program
        .command("get-vault-collateral-class")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (middlewareVaultManager, vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            await getVaultCollateralClass(
                vaultManager,
                vaultAddress
            );
        });

    /* --------------------------------------------------
    * VAULT DEPOSIT/WITHDRAW/CLAIM
    * -------------------------------------------------- */
    program
        .command("deposit")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .argument("amount", "Amount of token to deposit in the vault")
        .addOption(new Option("--onBehalfOf <behalfOf>", "Optional onBehalfOf address").argParser(ParserAddress))
        .action(async (vaultAddress, amount, options) => {
            const onBehalfOf = options.onBehalfOf ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            // instantiate VaultTokenized contract
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const amountWei = parseUnits(amount, await vault.read.decimals())
            await depositVault(
                client,
                vault,
                onBehalfOf,
                amountWei,
                client.account!
            );
        });

    program
        .command("withdraw")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .argument("amount", "Amount of token to withdraw in the vault")
        .addOption(new Option("--claimer <claimer>", "Optional claimer").argParser(ParserAddress))
        .action(async (vaultAddress, amount, options) => {
            const claimer = options.claimer ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const amountWei = parseUnits(amount, await vault.read.decimals())
            await withdrawVault(
                vault,
                claimer,
                amountWei,
                client.account!
            );
        });

    program
        .command("claim")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient").argParser(ParserAddress))
        .action(async (vaultAddress, epoch, options) => {
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await claimVault(
                vault,
                recipient,
                epoch,
                client.account!
            );
        });

    /* --------------------------------------------------
    * VAULT READ COMMANDS
    * -------------------------------------------------- */
    program
        .command("get-vault-collateral")
        .description("Get the collateral token address of a vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultCollateral(vault);
        });

    program
        .command("get-vault-delegator")
        .description("Get the delegator address of a vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const delegator = await getVaultDelegator(vault);
            console.log("Vault delegator:", delegator);
        });

    program
        .command("get-vault-balance")
        .description("Get vault token balance for an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addOption(new Option("--account <account>", "Account to check balance for").argParser(ParserAddress))
        .action(async (vaultAddress, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultBalanceOf(vault, account);
        });

    program
        .command("get-vault-active-balance")
        .description("Get active vault balance for an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addOption(new Option("--account <account>", "Account to check balance for").argParser(ParserAddress))
        .action(async (vaultAddress, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultActiveBalanceOf(vault, account);
        });

    program
        .command("get-vault-total-supply")
        .description("Get total supply of vault tokens")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultTotalSupply(vault);
        });

    program
        .command("get-vault-withdrawal-shares")
        .description("Get withdrawal shares for an account at a specific epoch")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--account <account>", "Account to check").argParser(ParserAddress))
        .action(async (vaultAddress, epoch, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultWithdrawalSharesOf(vault, epoch, account);
        });

    program
        .command("get-vault-withdrawals")
        .description("Get withdrawal amount for an account at a specific epoch")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--account <account>", "Account to check").argParser(ParserAddress))
        .action(async (vaultAddress, epoch, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultWithdrawalsOf(vault, epoch, account);
        });

    /* --------------------------------------------------
    * L1RestakeDelegator (set-l1-limit / set-operator-l1-shares)
    * -------------------------------------------------- */
    program
        .command("set-l1-limit")
        .addArgument(ArgAddress("delegatorAddress", "Delegator contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgBigInt("limit", "Limit amount"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (delegatorAddress, l1Address, limit, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            // instantiate L1RestakeDelegator contract
            const delegator = config.contracts.L1RestakeDelegator(delegatorAddress);
            await setL1Limit(
                delegator,
                l1Address,
                collateralClass,
                limit,
                client.account!
            );
        });

    program
        .command("set-operator-l1-shares")
        .addArgument(ArgAddress("delegatorAddress", "Delegator contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgAddress("operatorAddress", "Operator address"))
        .addArgument(ArgBigInt("shares", "Shares amount"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (delegatorAddress, l1Address, operatorAddress, shares, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            // instantiate L1RestakeDelegator contract
            const delegator = config.contracts.L1RestakeDelegator(delegatorAddress);
            await setOperatorL1Shares(
                delegator,
                l1Address,
                collateralClass,
                operatorAddress,
                shares,
                client.account!
            );
        });

    /* --------------------------------------------------
    * MIDDLEWARE
    * -------------------------------------------------- */

    // Register operator
    program
        .command("middleware-register-operator")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareRegisterOperator(
                middlewareSvc,
                operator,
                client.account!
            );
        });

    // Disable operator
    program
        .command("middleware-disable-operator")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareDisableOperator(
                middlewareSvc,
                operator,
                client.account!
            );
        });

    // Remove operator
    program
        .command("middleware-remove-operator")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareRemoveOperator(
                middlewareSvc,
                operator,
                client.account!
            );
        });

    // Process node stake cache
    program
        .command("middleware-process-node-stake-cache")
        .description("Manually process node stake cache for one or more epochs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addOption(new Option("--epochs <epochs>", "Number of epochs to process (default: 1)").default(1).argParser(ParserNumber))
        .addOption(new Option("--loop-epochs <count>", "Loop through multiple epochs, processing --epochs at a time").argParser(ParserNumber))
        .addOption(new Option("--delay <milliseconds>", "Delay between loop iterations in milliseconds (default: 1000)").default(1000).argParser(ParserNumber))
        .action(async (middlewareAddress, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            
            const epochsPerCall = options.epochs;
            const loopCount = options.loopEpochs || 1;
            
            console.log(`Processing node stake cache: ${loopCount} iterations of ${epochsPerCall} epoch(s) each`);
            
            for (let i = 0; i < loopCount; i++) {
                console.log(`\nIteration ${i + 1}/${loopCount}`);
                await middlewareManualProcessNodeStakeCache(
                    middlewareSvc,
                    epochsPerCall,
                    client.account!
                );
                
                if (i < loopCount - 1 && options.delay > 0) {
                    console.log(`Waiting ${options.delay}ms before next iteration...`);
                    await new Promise(resolve => setTimeout(resolve, options.delay));
                }
            }
            
            console.log(`\nCompleted processing ${loopCount * epochsPerCall} total epochs`);
        });

    // Add node
    program
        .command("middleware-add-node")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("blsKey", "BLS public key"))
        .addOption(new Option("--initial-stake <initialStake>", "Initial stake amount (default: 0)").default(0n).argParser(ParserAVAX))
        .addOption(new Option("--registration-expiry <expiry>", "Expiry timestamp (default: now + 12 hours)"))
        .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple))
        .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple))
        .action(async (middlewareAddress, nodeId, blsKey, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);

            // Default registration expiry to now + 12 hours if not provided
            const registrationExpiry = options.registrationExpiry
                ? BigInt(options.registrationExpiry)
                : BigInt(Math.floor(Date.now() / 1000) + 12 * 60 * 60); // current time + 12 hours in seconds

            // Build remainingBalanceOwner and disableOwner PChainOwner structs
            // If pchainRemainingBalanceOwnerAddress or pchainDisableOwnerAddress are empty (not provided), use the client account
            const remainingBalanceOwnerAddress = options.pchainRemainingBalanceOwnerAddress.length > 0 ? options.pchainRemainingBalanceOwnerAddress : [(await getDefaultAccount(opts))];
            const disableOwnerAddress = options.pchainDisableOwnerAddress.length > 0 ? options.pchainDisableOwnerAddress : [(await getDefaultAccount(program.opts()))];
            const remainingBalanceOwner: [number, Hex[]] = [
                Number(options.pchainRemainingBalanceOwnerThreshold),
                remainingBalanceOwnerAddress
            ];
            const disableOwner: [number, Hex[]] = [
                Number(options.pchainDisableOwnerThreshold),
                disableOwnerAddress
            ];

            // Call middlewareAddNode
            await middlewareAddNode(
                middlewareSvc,
                nodeId,
                blsKey,
                registrationExpiry,
                remainingBalanceOwner,
                disableOwner,
                options.initialStake,
                client.account!
            );
        });

    // Complete validator registration
    program
        .command("middleware-complete-validator-registration")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("addNodeTxHash", "Add node transaction hash"))
        .addArgument(ArgBLSPOP())
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserAddress))
        .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default(0n).argParser(ParserAVAX))
        .action(async (middlewareAddress, operator, nodeId, addNodeTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }

            const client = generateClient(opts.network, options.pchainTxPrivateKey);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const balancerSvc = config.contracts.BalancerValidatorManager(await middlewareSvc.read.balancerValidatorManager());

            // Check if P-Chain address have 0.1 AVAX for tx fees but some times it can be less than 0.00005 AVAX (perhaps when the validator was removed recently)
            await requirePChainBallance(options.pchainTxPrivateKey, client, BigInt((0.1 + Number(options.initialBalance))));

            // Call middlewareCompleteValidatorRegistration
            await middlewareCompleteValidatorRegistration(
                client,
                middlewareSvc,
                balancerSvc,
                operator,
                nodeId,
                options.pchainTxPrivateKey,
                blsProofOfPossession,
                addNodeTxHash,
                Number(options.initialBalance)
            );
        });

    // Remove node
    program
        .command("middleware-remove-node")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .action(async (middlewareAddress, nodeId) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareRemoveNode(
                middlewareSvc,
                nodeId,
                client.account!
            );
        });

    // Complete validator removal
    program
        .command("middleware-complete-validator-removal")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("removeNodeTxHash", "Remove node transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserPrivateKey))
        .action(async (middlewareAddress, nodeId, removeNodeTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = generateClient(opts.network, opts.privateKey!);

            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const balancerSvc = config.contracts.BalancerValidatorManager(await middlewareSvc.read.balancerValidatorManager());
            // Check if P-Chain address have 0.01 AVAX for tx fees but some times it can be less than 0.00005 AVAX (perhaps when the validator was added recently)
            await requirePChainBallance(options.pchainTxPrivateKey, client, BigInt(0.01 * 1e9));

            // Derive pchainTxAddress from the private key
            const { P: pchainTxAddress } = getAddresses(options.pchainTxPrivateKey, opts.network);

            await middlewareCompleteValidatorRemoval(
                client,
                middlewareSvc,
                balancerSvc,
                nodeId,
                removeNodeTxHash,
                options.pchainTxPrivateKey,
                pchainTxAddress
            );
        });

    // Init stake update
    program
        .command("middleware-init-stake-update")
        .description("Initialize validator stake update and lock")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgBigInt("newStake", "New stake amount"))
        .action(async (middlewareAddress, nodeId, newStake) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareInitStakeUpdate(
                middlewareSvc,
                nodeId,
                newStake,
                client.account!
            );
        });

    // Complete stake update
    program
        .command("middleware-complete-stake-update")
        .description("Complete validator stake update")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("validatorStakeUpdateTxHash", "Validator stake update transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserPrivateKey))
        .action(async (middlewareAddress, nodeId, validatorStakeUpdateTxHash, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }

            const client = generateClient(opts.network, options.pchainTxPrivateKey);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);


            // Check if P-Chain address have 0.01 AVAX for tx fees
            await requirePChainBallance(opts.privateKey!, client, BigInt(0.01 * 1e9));

            // Derive pchainTxAddress from the private key
            const { P: pchainTxAddress } = getAddresses(options.pchainTxPrivateKey, opts.network);

            await middlewareCompleteStakeUpdate(
                client,
                middlewareSvc,
                nodeId,
                validatorStakeUpdateTxHash,
                options.pchainTxPrivateKey,
                pchainTxAddress,
                client.account!
            );
        });

    // Operator cache / calcAndCacheStakes
    program
        .command("middleware-operator-cache")
        .description("Calculate and cache stakes for operators")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (middlewareAddress, epoch, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            console.log("Calculating and caching stakes...");

            try {
                if (!client.account) {
                    throw new Error('Client account is required');
                }
                const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
                const hash = await middlewareSvc.safeWrite.calcAndCacheStakes([epoch, collateralClass],
                    {
                        chain: null,
                        account: client.account,
                    });
                console.log("calcAndCacheStakes done, tx hash:", hash);
            } catch (error) {
                if (error instanceof Error) {
                    console.error(error.message);
                }
            }
        });

    // calcAndCacheNodeStakeForAllOperators
    program
        .command("middleware-calc-node-stakes")
        .description("Calculate and cache node stakes for all operators")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareCalcNodeStakes(
                middlewareSvc,
                client.account!
            );
        });

    // forceUpdateNodes
    program
        .command("middleware-force-update-nodes")
        .description("Force update operator nodes with stake limit")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addOption(new Option("--limit-stake <stake>", "Stake limit").default(0n).argParser(ParserAVAX))
        .action(async (middlewareAddress, operator, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareForceUpdateNodes(
                middlewareSvc,
                operator,
                options.limitStake,
                client.account!
            );
        });

    // getOperatorStake (read)
    program
        .command("middleware-get-operator-stake")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (middlewareAddress, operator, epoch, collateralClass) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorStake(
                middlewareSvc,
                operator,
                epoch,
                collateralClass
            );
        });

    // getCurrentEpoch (read)
    program
        .command("middleware-get-current-epoch")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetCurrentEpoch(
                middlewareSvc
            );
        });

    // getEpochStartTs (read)
    program
        .command("middleware-get-epoch-start-ts")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (middlewareAddress, epoch) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetEpochStartTs(
                middlewareSvc,
                epoch
            );
        });

    // getActiveNodesForEpoch (read)
    program
        .command("middleware-get-active-nodes-for-epoch")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (middlewareAddress, operator, epoch) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetActiveNodesForEpoch(
                middlewareSvc,
                operator,
                epoch
            );
        });

    // getOperatorNodesLength (read)
    program
        .command("middleware-get-operator-nodes-length")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorNodesLength(
                middlewareSvc,
                operator
            );
        });

    // getNodeStakeCache (read)
    program
        .command("middleware-get-node-stake-cache")
        .description("Get node stake cache for a specific epoch and validator")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgHex("validatorId", "Validator ID"))
        .action(async (middlewareAddress, epoch, validatorId) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetNodeStakeCache(
                middlewareSvc,
                epoch,
                validatorId
            );
        });

    // getOperatorLockedStake (read)
    program
        .command("middleware-get-operator-locked-stake")
        .description("Get operator locked stake")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorLockedStake(
                middlewareSvc,
                operator
            );
        });

    // nodePendingRemoval (read)
    program
        .command("middleware-node-pending-removal")
        .description("Check if node is pending removal")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validatorId", "Validator ID"))
        .action(async (middlewareAddress, validatorId) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareNodePendingRemoval(
                middlewareSvc,
                validatorId
            );
        });

    // nodePendingUpdate (read)
    program
        .command("middleware-node-pending-update")
        .description("Check if node is pending stake update")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validatorId", "Validator ID"))
        .action(async (middlewareAddress, validatorId) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareNodePendingUpdate(
                middlewareSvc,
                validatorId
            );
        });

    // getOperatorUsedStakeCached (read)
    program
        .command("middleware-get-operator-used-stake")
        .description("Get operator used stake from cache")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorUsedStake(
                middlewareSvc,
                operator
            );
        });

    // getAllOperators (read)
    program
        .command("middleware-get-all-operators")
        .description("Get all operators registered in the middleware")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetAllOperators(
                middlewareSvc
            );
        });

    // getCollateralClassIds (read)
    program
        .command("middleware-get-collateral-class-ids")
        .description("Get all collateral class IDs from the middleware")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await getCollateralClassIds(
                middlewareSvc
            );
        });

    // getActiveCollateralClasses (read)
    program
        .command("middleware-get-active-collateral-classes")
        .description("Get active collateral classes (primary and secondary)")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const client = generateClient(program.opts().network);
            const config = getConfig(program.opts().network, client);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await getActiveCollateralClasses(
                middlewareSvc
            );
        });

    program
        .command("middleware-node-logs")
        .description("Get middleware node logs")
        .addArgument(ArgHex("middlewareTxHash", "Middleware transaction hash"))
        .addOption(new Option("--node-id <nodeId>", "Node ID to filter logs").default(undefined).argParser(ParserNodeID))
        .addOption(new Option('--snowscan-api-key <string>', "Snowscan API key").default(""))
        .action(async (middlewareTxHash, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            console.log(`nodeId: ${options.nodeId}`);
            await middlewareGetNodeLogs(
                client,
                middlewareTxHash,
                config,
                options.nodeId,
                options.snowscanApiKey
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
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .action(async (l1Address) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const service = config.contracts.OperatorL1OptInService(config.opL1OptIn);
            await optInL1(
                service,
                l1Address,
                client.account!
            );
        });

    program
        .command("opt-out-l1")
        .description("Operator opts out from a given L1")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .action(async (l1Address) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const service = config.contracts.OperatorL1OptInService(config.opL1OptIn);
            await optOutL1(
                service,
                l1Address,
                client.account!
            );
        });

    program
        .command("check-opt-in-l1")
        .description("Check if an operator is opted in to a given L1")
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .action(async (operator, l1Address) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const service = config.contracts.OperatorL1OptInService(config.opL1OptIn);
            await checkOptInL1(
                service,
                operator,
                l1Address
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
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const service = config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await optInVault(
                service,
                vaultAddress,
                client.account!
            );
        });

    program
        .command("opt-out-vault")
        .description("Operator opts out from a given Vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const service = config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await optOutVault(
                service,
                vaultAddress,
                client.account!
            );
        });

    program
        .command("check-opt-in-vault")
        .description("Check if an operator is opted in to a given Vault")
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (operator, vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const service = config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await checkOptInVault(
                service,
                operator,
                vaultAddress
            );
        });

    /**
     * --------------------------------------------------
     * BALANCER
     * --------------------------------------------------
     */
    program
        .command("balancer-set-up-security-module")
        .addArgument(ArgAddress("balancerValidatorManagerAddress", "Balancer validator manager address"))
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("maxWeight", "Maximum weight"))
        .action(async (balancerValidatorManagerAddress, middlewareAddress, maxWeight) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            // instantiate BalancerValidatorManager contract
            const balancer = config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await setUpSecurityModule(
                balancer,
                middlewareAddress,
                maxWeight,
                client.account!
            );
        });

    program
        .command("balancer-get-security-modules")
        .addArgument(ArgAddress("balancerValidatorManagerAddress", "Balancer validator manager address"))
        .action(async (balancerValidatorManagerAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const balancer = config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await getSecurityModules(
                balancer
            );
        });

    program
        .command("balancer-get-security-module-weights")
        .addArgument(ArgAddress("balancerValidatorManagerAddress", "Balancer validator manager address"))
        .addArgument(ArgAddress("securityModule", "Security module address"))
        .action(async (balancerValidatorManagerAddress, securityModule) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const balancer = config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await getSecurityModuleWeights(
                balancer,
                securityModule
            );
        });

    /**
     * --------------------------------------------------
     * POA-Security-Module
     * --------------------------------------------------
     * This section is for the POA Security Module commands.
     * It includes commands to add or remove validators
     */

    program
        .command("poa-remove-node")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgNodeID())
        .action(async (poaSecurityModuleAddress, nodeID) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const poaSecurityModule = config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            const balancerValidatorManagerAddress = await poaSecurityModule.read.balancerValidatorManager();
            const balancer = config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            // Convert nodeID to Hex if necessary
            const nodeIdHex = parseNodeID(nodeID, false);
            console.log(nodeIdHex)
            const validationId = await balancer.read.registeredValidators([nodeIdHex]);
            const txHash = await poaSecurityModule.safeWrite.initializeEndValidation([validationId], {
                chain: null,
                account: client.account!,
            })
            console.log(`End validation initialized for node ${nodeID}. Transaction hash: ${txHash}`);
            
        });

    program
        .command("poa-complete-validator-removal")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("removeNodeTxHash", "Remove node transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserPrivateKey))
        .action(async (poaSecurityModuleAddress, nodeId, removeNodeTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const poaSecurityModule = config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            const balancerSvc = config.contracts.BalancerValidatorManager(await poaSecurityModule.read.balancerValidatorManager());
            // Check if P-Chain address have 0.01 AVAX for tx fees but some times it can be less than 0.00005 AVAX (perhaps when the validator was added recently)
            await requirePChainBallance(options.pchainTxPrivateKey, client, BigInt(0.01 * 1e9));

            const txHash = await completValidatorRemoval({
                client,
                poaSecurityModule,
                balancerSvc,
                removeNodeTxHash,
                nodeId,
                pchainTxPrivateKey: options.pchainTxPrivateKey
            });
            
            console.log(`End validation initialized for node . Transaction hash: ${txHash}`);
        });

    /**
         * --------------------------------------------------
         * OP-STAKES: enumerates the vaults and attempts to read stake for <operator>
         * --------------------------------------------------
         */
    program
        .command("opstakes")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgAddress("operatorAddress", "Operator address"))
        .description("Show operator stakes across L1s, enumerating each L1 the operator is opted into.")
        .action(async (middlewareVaultManager, operatorAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);

            const operator = operatorAddress;
            console.log(`Operator: ${operator}`);

            // 1) Read total vaults from VaultManager
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            const vaultCount = await vaultManager.read.getVaultCount()

            console.log(`Found ${vaultCount} vault(s).`);

            // This map accumulates the total stake for each collateral
            const totalStakesByCollateral: Record<string, bigint> = {};

            // 2) Let's get all L1 addresses from the L1Registry (similar to your Python code)
            const l1Registry = config.contracts.L1Registry(config.l1Registry)
            const totalL1s = await l1Registry.read.totalL1s();

            // We'll store them in an array
            const l1Array: Hex[] = [];
            for (let i = 0n; i < totalL1s; i++) {
                // e.g. getL1At(i) might return [address, metadataUrl], adjust as needed
                const [l1Address, metadataUrl] = await l1Registry.read.getL1At([i]);

                l1Array.push(l1Address);
            }

            // 3) For each vault in [0..vaultCount-1], read collateralClass, delegator, collateral
            for (let i = 0n; i < vaultCount; i++) {
                const [vaultAddress] = await vaultManager.read.getVaultAtWithTimes([i]);

                console.log(`\nVault #${i}: ${vaultAddress}`);

                // read the collateralClass
                const collateralClass = await vaultManager.read.getVaultCollateralClass([vaultAddress]);

                // read delegator
                const vaultTokenized = config.contracts.VaultTokenized(vaultAddress);
                const delegator = await vaultTokenized.read.delegator();

                if (delegator === '0x0000000000000000000000000000000000000000') {
                    console.log("    (No delegator set, skipping)");
                    continue;
                }
                const l1RestakeDelegator = config.contracts.L1RestakeDelegator(delegator);
                // read collateral
                const collateral = await vaultTokenized.read.collateral();

                // 4) For each L1 in l1Array, check if operator is opted in
                for (const l1Address of l1Array) {
                    const operatorL1OptInService = config.contracts.OperatorL1OptInService(config.opL1OptIn);
                    const isOptedIn = await operatorL1OptInService.read.isOptedIn([operator, l1Address])

                    if (isOptedIn) {
                        // read stake
                        const stakeValue = await l1RestakeDelegator.read.stake([l1Address, collateralClass, operator])

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
        .addArgument(ArgAddress("validatorManagerAddress", "Validator manager address"))
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
        .addArgument(ArgURI("rpcUrl", "RPC URL"))
        .addArgument(ArgCB58("chainId", "Chain ID"))
        .addArgument(ArgNodeID())
        .action(async (rpcUrl, chainId, nodeId) => {
            const opts = program.opts();
            if (opts.network === "fuji") {
                await getValidationUptimeMessage(opts.network, rpcUrl, nodeId, 5, chainId);
            } else {
                await getValidationUptimeMessage(opts.network, rpcUrl, nodeId, 1, chainId);
            }
        });

    program
        .command('compute-validator-uptime')
        .addArgument(ArgAddress("uptimeTrackerAddress", "Uptime tracker contract address"))
        .addArgument(ArgHex("signedUptimeHex", "Signed uptime hex"))
        .action(async (uptimeTrackerAddress, signedUptimeHex) => {
            const { privateKey, network } = program.opts();
            const client = generateClient(network, privateKey!);
            const config = getConfig(network, client);
            await computeValidatorUptime(
                config.contracts.UptimeTracker(uptimeTrackerAddress as Hex),
                client.account,
                signedUptimeHex as Hex,
            );
        });

    // ---- Combined Uptime Reporting Command ----
    program
        .command("report-uptime-validator")
        .description("Gets a validator's signed uptime message and submits it to the UptimeTracker contract.")
        .addArgument(ArgURI("rpcUrl", "RPC URL of the L1/Subnet"))
        .addArgument(ArgCB58("sourceChainId", "The Chain ID for which the uptime is being reported"))
        .addArgument(ArgNodeID("nodeId", "The NodeID of the validator"))
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract on the C-Chain"))
        .action(async (rpcUrl, sourceChainId, nodeId, uptimeTrackerAddress) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                console.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }

            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);

            await reportAndSubmitValidatorUptime(
                opts.network,
                rpcUrl,
                nodeId,
                sourceChainId,
                config.contracts.UptimeTracker(uptimeTrackerAddress),
                client.account
            );
        });

    // ---- Adding new commands for operator uptime ----
    program
        .command("compute-operator-uptime")
        .description("Compute uptime for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                console.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            await computeOperatorUptimeAtEpoch(
                uptimeTracker,
                operator,
                epoch,
                client.account
            );
        });

    program
        .command("compute-operator-uptime-range")
        .description("Compute uptime for an operator over a range of epochs (client-side looping)")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("startEpoch", "Starting epoch number"))
        .addArgument(ArgNumber("endEpoch", "Ending epoch number"))
        .action(async (uptimeTrackerAddress, operator, startEpoch, endEpoch) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                console.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            await computeOperatorUptimeForEpochs(
                uptimeTracker,
                operator,
                startEpoch,
                endEpoch,
                client.account
            );
        });

    // ---- Read-only commands for uptime data ----
    program
        .command("get-validator-uptime")
        .description("Get the recorded uptime for a validator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgHex("validationID", "Validation ID of the validator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, validationID, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            const uptime = await getValidatorUptimeForEpoch(
                uptimeTracker,
                validationID,
                epoch
            );
            console.log(`Validator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
        });

    program
        .command("check-validator-uptime-set")
        .description("Check if uptime data is set for a validator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgHex("validationID", "Validation ID of the validator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, validationID, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            const isSet = await isValidatorUptimeSetForEpoch(
                uptimeTracker,
                validationID,
                epoch
            );
            console.log(`Validator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
        });

    program
        .command("get-operator-uptime")
        .description("Get the recorded uptime for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            const uptime = await getOperatorUptimeForEpoch(
                uptimeTracker,
                operator,
                epoch
            );
            console.log(`Operator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
        });

    program
        .command("check-operator-uptime-set")
        .description("Check if uptime data is set for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            const isSet = await isOperatorUptimeSetForEpoch(
                uptimeTracker,
                operator,
                epoch
            );
            console.log(`Operator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
        });

    /* --------------------------------------------------
    * REWARDS COMMANDS
    * -------------------------------------------------- */
    program
        .command("rewards-distribute")
        .description("Distribute rewards for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to distribute rewards for"))
        .addArgument(ArgNumber("batchSize", "Number of operators to process in this batch"))
        .action(async (rewardsAddress, epoch, batchSize) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await distributeRewards(
                rewardsContract,
                epoch,
                batchSize,
                client.account
            );
        });

    program
        .command("rewards-claim")
        .description("Claim rewards for a staker")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimRewards(
                rewardsContract,
                rewardsToken,
                recipient,
                client.account
            );
        });

    program
        .command("rewards-claim-operator-fee")
        .description("Claim operator fees")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimOperatorFee(
                rewardsContract,
                rewardsToken,
                recipient,
                client.account
            );
        });

    program
        .command("rewards-claim-curator-fee")
        .description("Claim curator fees")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimCuratorFee(
                rewardsContract,
                rewardsToken,
                recipient,
                client.account
            );
        });

    program
        .command("rewards-claim-protocol-fee")
        .description("Claim protocol fees (only for protocol owner)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimProtocolFee(
                rewardsContract,
                rewardsToken,
                recipient,
                client.account
            );
        });

    program
        .command("rewards-claim-undistributed")
        .description("Claim undistributed rewards (admin only)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to claim undistributed rewards for"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, epoch, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimUndistributedRewards(
                rewardsContract,
                epoch,
                rewardsToken,
                recipient,
                client.account
            );
        });

    program
        .command("rewards-set-amount")
        .description("Set rewards amount for epochs")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("startEpoch", "Starting epoch"))
        .addArgument(ArgNumber("numberOfEpochs", "Number of epochs"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addArgument(ArgBigInt("rewardsAmount", "Amount of rewards in wei"))
        .action(async (rewardsAddress, startEpoch, numberOfEpochs, rewardsToken, rewardsAmount) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setRewardsAmountForEpochs(
                rewardsContract,
                startEpoch,
                numberOfEpochs,
                rewardsToken,
                rewardsAmount,
                client.account
            );
        });

    program
        .command("rewards-set-share-collateral-class")
        .description("Set rewards share for collateral class")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .addArgument(ArgNumber("share", "Share in basis points (100 = 1%)"))
        .action(async (rewardsAddress, collateralClass, share) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setRewardsShareForCollateralClass(
                rewardsContract,
                collateralClass,
                share,
                client.account
            );
        });

    program
        .command("rewards-set-min-uptime")
        .description("Set minimum required uptime for rewards eligibility")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("minUptime", "Minimum uptime in seconds"))
        .action(async (rewardsAddress, minUptime) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setMinRequiredUptime(
                rewardsContract,
                minUptime,
                client.account
            );
        });

    program
        .command("rewards-set-admin")
        .description("Set admin role (DEFAULT_ADMIN_ROLE only)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("newAdmin", "New admin address"))
        .action(async (rewardsAddress, newAdmin) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setAdminRole(
                rewardsContract,
                newAdmin,
                client.account
            );
        });

    program
        .command("rewards-set-protocol-owner")
        .description("Set protocol owner (DEFAULT_ADMIN_ROLE only)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("newOwner", "New protocol owner address"))
        .action(async (rewardsAddress, newOwner) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setProtocolOwner(
                rewardsContract,
                newOwner,
                client.account
            );
        });

    program
        .command("rewards-update-protocol-fee")
        .description("Update protocol fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await updateProtocolFee(
                rewardsContract,
                newFee,
                client.account
            );
        });

    program
        .command("rewards-update-operator-fee")
        .description("Update operator fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await updateOperatorFee(
                rewardsContract,
                newFee,
                client.account
            );
        });

    program
        .command("rewards-update-curator-fee")
        .description("Update curator fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await updateCuratorFee(
                rewardsContract,
                newFee,
                client.account
            );
        });

    program
        .command("rewards-update-all-fees")
        .description("Update all fees at once (protocol, operator, curator)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("protocolFee", "New protocol fee in basis points (100 = 1%)"))
        .addArgument(ArgNumber("operatorFee", "New operator fee in basis points (100 = 1%)"))
        .addArgument(ArgNumber("curatorFee", "New curator fee in basis points (100 = 1%)"))
        .action(async (rewardsAddress, protocolFee, operatorFee, curatorFee) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await updateAllFees(
                rewardsContract,
                protocolFee,
                operatorFee,
                curatorFee,
                client.account
            );
        });

    program
        .command("rewards-get-amounts")
        .description("Get rewards amounts per token for epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .action(async (rewardsAddress, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getRewardsAmountPerTokenFromEpoch(
                rewardsContract,
                epoch
            );
        });

    program
        .command("rewards-get-amount-for-token")
        .description("Get rewards amount for a specific token from epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("token", "Token address"))
        .action(async (rewardsAddress, epoch, token) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getRewardsAmountForTokenFromEpoch(
                rewardsContract,
                epoch,
                token
            );
        });

    program
        .command("rewards-get-operator-shares")
        .description("Get operator shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (rewardsAddress, epoch, operator) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getOperatorShares(
                rewardsContract,
                epoch,
                operator
            );
        });

    program
        .command("rewards-get-vault-shares")
        .description("Get vault shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("vault", "Vault address"))
        .action(async (rewardsAddress, epoch, vault) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getVaultShares(
                rewardsContract,
                epoch,
                vault
            );
        });

    program
        .command("rewards-get-curator-shares")
        .description("Get curator shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("curator", "Curator address"))
        .action(async (rewardsAddress, epoch, curator) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getCuratorShares(
                rewardsContract,
                epoch,
                curator
            );
        });

    program
        .command("rewards-get-protocol-rewards")
        .description("Get protocol rewards for a token")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("token", "Token address"))
        .action(async (rewardsAddress, token) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getProtocolRewards(
                rewardsContract,
                token
            );
        });

    program
        .command("rewards-get-distribution-batch")
        .description("Get distribution batch status for an epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .action(async (rewardsAddress, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getDistributionBatch(
                rewardsContract,
                epoch
            );
        });

    program
        .command("rewards-get-fees-config")
        .description("Get current fees configuration")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .action(async (rewardsAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getFeesConfiguration(
                rewardsContract
            );
        });

    program
        .command("rewards-get-share-collateral-class")
        .description("Get rewards share for collateral class")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (rewardsAddress, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getRewardsShareForCollateralClass(
                rewardsContract,
                collateralClass
            );
        });

    program
        .command("rewards-get-min-uptime")
        .description("Get minimum required uptime for rewards eligibility")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .action(async (rewardsAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getMinRequiredUptime(
                rewardsContract
            );
        });

    program
        .command("rewards-get-last-claimed-staker")
        .description("Get last claimed epoch for a staker")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("staker", "Staker address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(async (rewardsAddress, staker, rewardToken) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getLastEpochClaimedStaker(
                rewardsContract,
                staker,
                rewardToken
            );
        });

    program
        .command("rewards-get-last-claimed-operator")
        .description("Get last claimed epoch for an operator")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(async (rewardsAddress, operator, rewardToken) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getLastEpochClaimedOperator(
                rewardsContract,
                operator,
                rewardToken
            );
        });

    program
        .command("rewards-get-last-claimed-curator")
        .description("Get last claimed epoch for a curator")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("curator", "Curator address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(async (rewardsAddress, curator, rewardToken) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getLastEpochClaimedCurator(
                rewardsContract,
                curator,
                rewardToken
            );
        });

    program
        .command("rewards-get-last-claimed-protocol")
        .description("Get last claimed epoch for protocol owner")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("protocolOwner", "Protocol owner address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(async (rewardsAddress, protocolOwner, rewardToken) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig(opts.network, client);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getLastEpochClaimedProtocol(
                rewardsContract,
                protocolOwner,
                rewardToken
            );
        });

    buildKeyStoreCmds(
        program
            .command("secret")
            .description("Manage the cli keystore (advanced users can use pass directly)")
    )

    program.hook("preAction", (thisCommand, actionCommand) => {
        
        // console.log(`Executing command: ${actionCommand.optsWithGlobals() }`);
        // console.log(`Executing action: ${actionCommand}`);
        // console.log(`With options: ${JSON.stringify(thisCommand.opts())}`);
        const opts = program.opts();
        // Block manually private key on mainnet
        if (opts.privateKey! && opts.network === "mainnet") {
            console.error("Using private key on mainnet is not allowed. Use the secret keystore instead.");
            process.exit(1);
        }
        // Ensure privateKey is set if opts.secret is provided
        opts.privateKey! = opts.privateKey! || opts.secretName;
    });

    program.parse(process.argv);
}

main().catch((err) => console.error(err));
