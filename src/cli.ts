#!/usr/bin/env node
import { Command, CommandUnknownOpts, Option } from '@commander-js/extra-typings';
import { formatUnits, Hex, parseEventLogs, parseUnits } from "viem";
import { registerL1, getL1s, setL1MetadataUrl, setL1Middleware } from "./l1";
import { listOperators, registerOperator } from "./operator";
import { getConfig } from "./config";
import { generateClient } from "./client";
import { logger, wrapAsyncAction } from './lib/logger';
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
    getVaultWithdrawalsOf,
    approveAndDepositCollateral
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
    middlewareRemoveNode,
    middlewareInitStakeUpdate,
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
    middlewareManualProcessNodeStakeCache,
    middlewareLastValidationId
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
    getSecurityModuleWeights,
    ValidatorStatusNames,
    ValidatorStatus
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
import { bigintReplacer, encodeNodeID, getAddresses, NodeId, parseNodeID } from "./lib/utils";

import { buildCommands as buildKeyStoreCmds } from "./keyStore";
import { ArgAddress, ArgNodeID, ArgHex, ArgURI, ArgNumber, ArgBigInt, ArgAVAX, ArgBLSPOP, ArgCB58, ParserPrivateKey, ParserAddress, ParserAVAX, ParserNumber, ParserNodeID, parseSecretName, collectMultiple, ParseUnits, ParserHex } from "./lib/cliParser";
import { getCurrentValidators, increasePChainValidatorBalance } from './lib/pChainUtils';
import { color } from 'console-log-colors';
import { A, pipe, R } from '@mobily/ts-belt';
import { completeValidatorRegistration, completeValidatorRemoval, completeWeightUpdate } from './securityModule';
import { utils } from '@avalabs/avalanchejs';
import { hexToUint8Array } from './lib/justification';

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
        .addOption(new Option('-w, --wait <confirmations>', 'Number of confirmations to wait after a write transaction')
            .default(0)
            .argParser(ParserNumber))
        .addOption(new Option("--json", "Output logs in JSON format"))
        .version('0.1.0');

    /* --------------------------------------------------
    * Generic L1 Commands
    * -------------------------------------------------- */
    // topUpAllOperatorNodes
    program
        .command("top-up-l1-validators")
        .description("Top up all/selected l1 validators to meet a target continuous fee balance")
        .addArgument(ArgCB58("subnetID", "Subnet ID of the L1"))
        .argument("targetBalance", "Target continuous fee balance per validator (in AVAX)")
        .addOption(new Option("--node-id <nodeId>", "Add a validator to be topped up").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .action(wrapAsyncAction(async (subnetID, targetBalance, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const targetBalanceWei = parseUnits(targetBalance, 9); // AVAX has 9 decimals
            if (targetBalanceWei <= BigInt(1e7)) { // 0.01 AVAX min
                throw new Error("Target balance must be greater than 0.01 AVAX");
            }
            const validators = await getCurrentValidators(client, subnetID)

            const validatorsToTopUp = validators.reduce((acc, validator) => {
                if (options.nodeId && options.nodeId.length > 0 && !options.nodeId.includes(validator.nodeID)) {
                    return acc;
                }
                if (validator.balance! < Number(targetBalanceWei) - 1e7) {// 0.01 AVAX min diff
                    acc.push({
                        validationId: validator.validationID! as Hex,
                        topup: targetBalanceWei - BigInt(validator.balance!),
                    });
                }
                return acc
            }, [] as { validationId: Hex; topup: bigint }[])

            const totalTopUp = validatorsToTopUp.reduce((acc, v) => acc + v.topup, 0n);

            if (validatorsToTopUp.length === 0) {
                logger.log("All l1 validators have sufficient balance. No top-up needed.");
                logger.addData('total_amount', 0)
                logger.addData('validators', [])
                return;
            }

            logger.log(`${validatorsToTopUp.length} validators to top-up:`);
            await requirePChainBallance(opts.privateKey!, client, totalTopUp + BigInt(2e4) * BigInt(validatorsToTopUp.length)); // extra 20000 for fees
            const response = await logger.prompt(`Proceed with topping up validators? (y/n): `);
            if (response.toLowerCase() !== 'y') {
                logger.log("Operation cancelled by user.");
                process.exit(0);
            }

            for (const { validationId, topup } of validatorsToTopUp) {
                logger.log(`\nTopping up validator ${validationId}`);
                const amount = Number(topup) / 1e9
                pipe(await increasePChainValidatorBalance(
                    client,
                    opts.privateKey!,
                    amount,
                    validationId,
                    false
                ),
                    R.tapError(err => { logger.error(err); process.exit(1) }),)
            }
            logger.log("\nCompleted top-up of validators.");
            logger.addData('total_amount', totalTopUp)
            logger.addData('validators', validatorsToTopUp)
        }));

    /* --------------------------------------------------
   * L1 REGISTRY COMMANDS
   * -------------------------------------------------- */
    const l1RegistryCmd = program
        .command("l1-registry")
        .description("Commands to interact with the Suzaku L1 Registry contract");
    
    l1RegistryCmd
        .command("register")
        .description("Register a new L1 in the L1 registry")
        .addArgument(ArgAddress("balancerAddress", "Balancer address"))
        .addArgument(ArgAddress("l1Middleware", "L1 middleware contract address"))
        .addArgument(ArgURI("metadataUrl", "Metadata URL for the L1"))
        .action(wrapAsyncAction(async (balancerAddress, l1Middleware, metadataUrl) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);

            // instantiate L1Registry and call
            const l1Registry = config.contracts.L1Registry(config.l1Registry);
            await registerL1(
                l1Registry,
                balancerAddress,
                l1Middleware,
                metadataUrl,
                client.account!
            );
        }));

    l1RegistryCmd
        .command("get-all")
        .description("List all L1s registered in the L1 registry")
        .action(wrapAsyncAction(async () => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            await getL1s(
                config.contracts.L1Registry(config.l1Registry)
            );
        }));

    l1RegistryCmd
        .command("set-metadata-url")
        .description("Set metadata URL for an L1 in the L1 registry")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgURI("metadataUrl", "New metadata URL"))
        .action(wrapAsyncAction(async (l1Address, metadataUrl) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const l1Reg = config.contracts.L1Registry(config.l1Registry);
            await setL1MetadataUrl(
                l1Reg,
                l1Address,
                metadataUrl,
                client.account!
            );
        }));

    l1RegistryCmd
        .command("set-middleware")
        .description("Set middleware address for an L1 in the L1 registry")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgAddress("l1Middleware", "New L1 middleware address"))
        .action(wrapAsyncAction(async (l1Address, l1Middleware) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const l1Reg2 = config.contracts.L1Registry(config.l1Registry);
            await setL1Middleware(
                l1Reg2,
                l1Address,
                l1Middleware,
                client.account!
            );
        }));
    /* --------------------------------------------------
    * OPERATOR REGISTRY COMMANDS
    * -------------------------------------------------- */
    const operatorRegistryCmd = program
        .command("operator-registry")
        .description("Commands to interact with the Suzaku Operator Registry contract");
    
    operatorRegistryCmd
        .command("register")
        .description("Register a new operator in the operator registry")
        .addArgument(ArgURI("metadataUrl", "Operator metadata URL"))
        .action(wrapAsyncAction(async (metadataUrl) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const opReg = config.contracts.OperatorRegistry(config.operatorRegistry);
            await registerOperator(
                opReg,
                metadataUrl,
                client.account!
            );
        }));

    operatorRegistryCmd
        .command("get-all")
        .description("List all operators registered in the operator registry")
        .action(wrapAsyncAction(async () => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const opReg2 = config.contracts.OperatorRegistry(config.operatorRegistry);
            await listOperators(opReg2);
        }));

    /* --------------------------------------------------
    * VAULT MANAGER
    * -------------------------------------------------- */
    const vaultManagerCmd = program
        .command("vault-manager")
        .description("Commands to interact with the Vault Manager contract of an L1");
    
    vaultManagerCmd
        .command("register-vault-l1")
        .description("Register a vault for L1 staking")
        .addArgument(ArgAddress("middlewareVaultManagerAddress", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .argument("maxLimit", "Maximum limit (in decimal format)")
        .action(wrapAsyncAction(async (middlewareVaultManagerAddress, vaultAddress, collateralClass, maxLimit) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            // instantiate VaultManager contract
            const vaultManager = config.contracts.VaultManager(middlewareVaultManagerAddress);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const maxLimitWei = parseUnits(maxLimit, await vault.read.decimals())
            await registerVaultL1(
                vaultManager,
                vaultAddress,
                collateralClass,
                maxLimitWei,
                client.account!
            );
        }));

    vaultManagerCmd
        .command("update-vault-max-l1-limit")
        .description("Update the maximum L1 limit for a vault")
        .addArgument(ArgAddress("middlewareVaultManagerAddress", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .argument("maxLimit", "Maximum limit")
        .action(wrapAsyncAction(async (middlewareVaultManagerAddress, vaultAddress, collateralClass, maxLimit) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManagerAddress);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const maxLimitWei = parseUnits(maxLimit, await vault.read.decimals())
            await updateVaultMaxL1Limit(
                vaultManager,
                vaultAddress,
                collateralClass,
                maxLimitWei,
                client.account!
            );
        }));

    vaultManagerCmd
        .command("remove-vault")
        .description("Remove a vault from L1 staking")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(wrapAsyncAction(async (middlewareVaultManager, vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            await removeVault(
                vaultManager,
                vaultAddress,
                client.account!
            );
        }));

    vaultManagerCmd
        .command("get-vault-count")
        .description("Get the number of vaults registered for L1 staking")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .action(wrapAsyncAction(async (middlewareVaultManager) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            await getVaultCount(vaultManager);
        }));

    vaultManagerCmd
        .command("get-vault-at-with-times")
        .description("Get the vault address at a specific index along with its registration and removal times")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgBigInt("index", "Vault index"))
        .action(wrapAsyncAction(async (middlewareVaultManager, index) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            await getVaultAtWithTimes(
                vaultManager,
                index
            );
        }));

    vaultManagerCmd
        .command("get-vault-collateral-class")
        .description("Get the collateral class ID associated with a vault")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(wrapAsyncAction(async (middlewareVaultManager, vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            await getVaultCollateralClass(
                vaultManager,
                vaultAddress
            );
        }));

    /* --------------------------------------------------
    * VAULT DEPOSIT/WITHDRAW/CLAIM/GRANT
    * -------------------------------------------------- */
    const vaultCmd = program
        .command("vault")
        .description("Commands to interact with a Vault and L1 Re-stake Delegator contracts");
    
    vaultCmd
        .command("deposit")
        .description("Deposit tokens into the vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .argument("amount", "Amount of token to deposit in the vault")
        .addOption(new Option("--onBehalfOf <behalfOf>", "Optional onBehalfOf address").argParser(ParserAddress))
        .action(wrapAsyncAction(async (vaultAddress, amount, options) => {
            const onBehalfOf = options.onBehalfOf ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            await depositVault(
                client,
                config,
                vaultAddress,
                onBehalfOf,
                amount,
                client.account!
            );
        }));

    vaultCmd
        .command("withdraw")
        .description("Withdraw tokens from the vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .argument("amount", "Amount of token to withdraw in the vault")
        .addOption(new Option("--claimer <claimer>", "Optional claimer").argParser(ParserAddress))
        .action(wrapAsyncAction(async (vaultAddress, amount, options) => {
            const claimer = options.claimer ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const amountWei = parseUnits(amount, await vault.read.decimals())
            await withdrawVault(
                vault,
                claimer,
                amountWei,
                client.account!
            );
        }));

    vaultCmd
        .command("claim")
        .description("Claim withdrawn tokens from the vault for a specific epoch")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient").argParser(ParserAddress))
        .action(wrapAsyncAction(async (vaultAddress, epoch, options) => {
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await claimVault(
                vault,
                recipient,
                epoch,
                client.account!
            );
        }));

    vaultCmd
        .command("grant-staker-role")
        .description("Grant staker role on a vault to an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("account", "Account to grant the role to"))
        .action(wrapAsyncAction(async (vaultAddress, account) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await vault.safeWrite.grantRole([await vault.read.DEPOSITOR_WHITELIST_ROLE(), account],
                {
                    chain: null,
                    account: client.account!,
                })
            logger.log(`Granted staker role to ${account} on vault (${await vault.read.name()}) ${vaultAddress}`);
        }));

    vaultCmd
        .command("revoke-staker-role")
        .description("Revoke staker role on a vault from an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("account", "Account to revoke the role from"))
        .action(wrapAsyncAction(async (vaultAddress, account) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await vault.safeWrite.revokeRole([await vault.read.DEPOSITOR_WHITELIST_ROLE(), account],
                {
                    chain: null,
                    account: client.account!,
                })
            logger.log(`Revoked staker role from ${account} on vault (${await vault.read.name()}) ${vaultAddress}`);
        }));

    vaultCmd
        .command("collateral-deposit")
        .description("Approve and deposit tokens into the collateral contract associated with a vault")
        .addArgument(ArgAddress("collateralAddress", "Collateral contract address"))
        .argument("amount", "Amount of token to deposit in the collateral")
        .action(wrapAsyncAction(async (collateralAddress, amount) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            await approveAndDepositCollateral(
                client,
                config,
                collateralAddress,
                amount,
            );

        }))

    /* --------------------------------------------------
    * VAULT READ COMMANDS
    * -------------------------------------------------- */
    vaultCmd
        .command("get-collateral")
        .description("Get the collateral token address of a vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(wrapAsyncAction(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultCollateral(vault);
        }));

    vaultCmd
        .command("get-delegator")
        .description("Get the delegator address of a vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(wrapAsyncAction(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const delegator = await getVaultDelegator(vault);
            logger.log("Vault delegator:", delegator);
        }));

    vaultCmd
        .command("get-balance")
        .description("Get vault token balance for an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addOption(new Option("--account <account>", "Account to check balance for").argParser(ParserAddress))
        .action(wrapAsyncAction(async (vaultAddress, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultBalanceOf(vault, account);
        }));

    vaultCmd
        .command("get-active-balance")
        .description("Get active vault balance for an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addOption(new Option("--account <account>", "Account to check balance for").argParser(ParserAddress))
        .action(wrapAsyncAction(async (vaultAddress, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultActiveBalanceOf(vault, account);
        }));

    vaultCmd
        .command("get-total-supply")
        .description("Get total supply of vault tokens")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(wrapAsyncAction(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultTotalSupply(vault);
        }));

    vaultCmd
        .command("get-withdrawal-shares")
        .description("Get withdrawal shares for an account at a specific epoch")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--account <account>", "Account to check").argParser(ParserAddress))
        .action(wrapAsyncAction(async (vaultAddress, epoch, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultWithdrawalSharesOf(vault, epoch, account);
        }));

    vaultCmd
        .command("get-withdrawals")
        .description("Get withdrawal amount for an account at a specific epoch")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--account <account>", "Account to check").argParser(ParserAddress))
        .action(wrapAsyncAction(async (vaultAddress, epoch, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            await getVaultWithdrawalsOf(vault, epoch, account);
        }));

    /* --------------------------------------------------
    * L1RestakeDelegator (set-l1-limit / set-operator-l1-shares)
    * -------------------------------------------------- */
    vaultCmd
        .command("set-l1-limit")
        .description("Set the L1 limit for a vault's delegator")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .argument("limit", "Limit amount")
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(wrapAsyncAction(async (vaultAddress, l1Address, limit, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const delegatorAddress = await vault.read.delegator();

            // instantiate L1RestakeDelegator contract
            const delegator = config.contracts.L1RestakeDelegator(delegatorAddress);
            const limitWei = parseUnits(limit, await vault.read.decimals())
            await setL1Limit(
                delegator,
                l1Address,
                collateralClass,
                limitWei,
                client.account!
            );
        }));

    vaultCmd
        .command("set-operator-l1-shares")
        .description("Set the L1 shares for an operator in a delegator")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgAddress("operatorAddress", "Operator address"))
        .argument("shares", "Shares amount")
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(wrapAsyncAction(async (vaultAddress, l1Address, operatorAddress, shares, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            // instantiate L1RestakeDelegator contract

            const vault = config.contracts.VaultTokenized(vaultAddress);
            const delegatorAddress = await vault.read.delegator();
            const delegator = config.contracts.L1RestakeDelegator(delegatorAddress);
            const sharesWei = parseUnits(shares, await vault.read.decimals())
            await setOperatorL1Shares(
                delegator,
                l1Address,
                collateralClass,
                operatorAddress,
                sharesWei,
                client.account!
            );
        }));

    vaultCmd
        .command("get-l1-limit")
        .description("Get L1 limit for a vault's delegator")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(wrapAsyncAction(async (vaultAddress, l1Address, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const delegatorAddress = await vault.read.delegator();

            // instantiate L1RestakeDelegator contract
            const delegator = config.contracts.L1RestakeDelegator(delegatorAddress);
            const limit = await delegator.read.l1Limit([l1Address, collateralClass]);
            logger.log(`L1 limit for vault ${vaultAddress} on L1 ${l1Address} (collateral class ${collateralClass}): ${formatUnits(limit, await vault.read.decimals())}`);
        }));

    vaultCmd
        .command("get-operator-l1-shares")
        .description("Get L1 shares for an operator in a vault's delegator")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .addArgument(ArgAddress("operatorAddress", "Operator address"))
        .action(wrapAsyncAction(async (vaultAddress, l1Address, collateralClass, operatorAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const vault = config.contracts.VaultTokenized(vaultAddress);
            const delegatorAddress = await vault.read.delegator();

            // instantiate L1RestakeDelegator contract
            const delegator = config.contracts.L1RestakeDelegator(delegatorAddress);
            const shares = await delegator.read.operatorL1Shares([l1Address, collateralClass, operatorAddress]);
            logger.log(`L1 shares for operator ${operatorAddress} in vault ${vaultAddress} on L1 ${l1Address} (collateral class ${collateralClass}): ${formatUnits(shares, await vault.read.decimals())}`);
        }));
    /* --------------------------------------------------
    * MIDDLEWARE
    * -------------------------------------------------- */

    const middlewareCmd = program
        .command("middleware")
        .description("Commands to interact with the L1 Middleware contract");
    // Add secondary collateral class
    middlewareCmd
        .command("add-collateral-class")
        .description("Add a new collateral class to the middleware")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .argument("minValidatorStake", "Minimum validator stake amount")
        .argument("maxValidatorStake", "Maximum validator stake amount")
        .addArgument(ArgAddress("initialCollateral", "Initial collateral address"))
        .action(wrapAsyncAction(async (middlewareAddress, collateralClassId, minValidatorStake, maxValidatorStake, initialCollateral) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const collateral = config.contracts.DefaultCollateral(initialCollateral);
            const decimals = await collateral.read.decimals();
            const minStakeWei = parseUnits(minValidatorStake, decimals);
            const maxStakeWei = parseUnits(maxValidatorStake, decimals);
            await middlewareSvc.safeWrite.addCollateralClass([collateralClassId, minStakeWei, maxStakeWei, initialCollateral],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Added collateral class ${collateralClassId} with min stake ${minValidatorStake} and max stake ${maxValidatorStake} using collateral at ${initialCollateral}`);
        }));

    // Add collateral to class
    middlewareCmd
        .command("add-collateral-to-class")
        .description("Add a new collateral address to an existing collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .addArgument(ArgAddress("collateralAddress", "Collateral address to add"))
        .action(wrapAsyncAction(async (middlewareAddress, collateralClassId, collateralAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareSvc.safeWrite.addAssetToClass([collateralClassId, collateralAddress],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Added collateral ${collateralAddress} to class ${collateralClassId}`);
        }));

    // activateSecondaryCollateralClass
    middlewareCmd
        .command("activate-collateral-class")
        .description("Activate a secondary collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .action(wrapAsyncAction(async (middlewareAddress, collateralClassId) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareSvc.safeWrite.activateSecondaryCollateralClass([collateralClassId],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Activated collateral class ${collateralClassId}`);
        }));

    // deactivateSecondaryCollateralClass
    middlewareCmd
        .command("deactivate-collateral-class")
        .description("Deactivate a secondary collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .action(wrapAsyncAction(async (middlewareAddress, collateralClassId) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareSvc.safeWrite.deactivateSecondaryCollateralClass([collateralClassId],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Deactivated collateral class ${collateralClassId}`);
        }));

    // Register operator
    middlewareCmd
        .command("register-operator")
        .description("Register an operator to operate on this L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(wrapAsyncAction(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareRegisterOperator(
                middlewareSvc,
                operator,
                client.account!
            );
        }));

    // Disable operator
    middlewareCmd
        .command("disable-operator")
        .description("Disable an operator to prevent it from operating on this L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(wrapAsyncAction(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareDisableOperator(
                middlewareSvc,
                operator,
                client.account!
            );
        }));

    // Remove operator
    middlewareCmd
        .command("remove-operator")
        .description("Remove an operator from this L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(wrapAsyncAction(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareRemoveOperator(
                middlewareSvc,
                operator,
                client.account!
            );
        }));

    // Process node stake cache
    middlewareCmd
        .command("process-node-stake-cache")
        .description("Manually process node stake cache for one or more epochs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addOption(new Option("--epochs <epochs>", "Number of epochs to process (default: all)").default(0).argParser(ParserNumber))
        .addOption(new Option("--loop-epochs <count>", "Loop through multiple epochs, processing --epochs at a time").argParser(ParserNumber))
        .addOption(new Option("--delay <milliseconds>", "Delay between loop iterations in milliseconds (default: 1000)").default(1000).argParser(ParserNumber))
        .action(wrapAsyncAction(async (middlewareAddress, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);

            let epochsPerCall;
            let loopCount;
            if (options.epochs || options.loopEpochs) {
                epochsPerCall = options.epochs || 1;
                loopCount = options.loopEpochs || 1;
            } else {
                epochsPerCall = await middlewareSvc.read.getCurrentEpoch() - await middlewareSvc.read.lastGlobalNodeStakeUpdateEpoch();
                loopCount = epochsPerCall > 50 ? Math.ceil(epochsPerCall / 50) : 1; // Limit number of epochs processed in a single call to avoid gas issues
            }

            logger.log(`Processing node stake cache: ${loopCount} iterations of ${epochsPerCall} epoch(s) each`);

            for (let i = 0; i < loopCount; i++) {
                logger.log(`\nIteration ${i + 1}/${loopCount}`);
                await middlewareManualProcessNodeStakeCache(
                    middlewareSvc,
                    epochsPerCall,
                    client.account!
                );

                if (i < loopCount - 1 && options.delay > 0) {
                    logger.log(`Waiting ${options.delay}ms before next iteration...`);
                    await new Promise(resolve => setTimeout(resolve, options.delay));
                }
            }

            logger.log(`\nCompleted processing ${loopCount * epochsPerCall} total epochs`);
        }));

    // Add node
    middlewareCmd
        .command("add-node")
        .description("Add a new node to an L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("blsKey", "BLS public key"))
        .addOption(new Option("--initial-stake <initialStake>", "Initial stake amount (default: 0)").default('0'))
        .addOption(new Option("--registration-expiry <expiry>", "Expiry timestamp (default: now + 12 hours)"))
        .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .action(wrapAsyncAction(async (middlewareAddress, nodeId, blsKey, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
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

            const primaryCollateralAddress = await middlewareSvc.read.PRIMARY_ASSET();
            const primaryCollateral = config.contracts.DefaultCollateral(primaryCollateralAddress);
            const initialStakeWei = parseUnits(options.initialStake.toString(), await primaryCollateral.read.decimals());


            // Call middlewareAddNode
            await middlewareAddNode(
                middlewareSvc,
                nodeId,
                blsKey,
                remainingBalanceOwner,
                disableOwner,
                initialStakeWei,
                client.account!
            );
        }));

    // Complete validator registration
    middlewareCmd
        .command("complete-validator-registration")
        .description("Complete validator registration on the P-Chain and on the middleware after adding a node")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("addNodeTxHash", "Add node transaction hash"))
        .addArgument(ArgBLSPOP())
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserAddress))
        .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01').argParser((value) => ParseUnits(value, 9, 'Invalid initial balance')))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .action(wrapAsyncAction(async (middlewareAddress, addNodeTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }

            const client = generateClient(opts.network, options.pchainTxPrivateKey);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const balancerSvc = config.contracts.BalancerValidatorManager(await middlewareSvc.read.balancerValidatorManager());

            // Check if P-Chain address have 0.1 AVAX for tx fees but some times it can be less than 0.00005 AVAX (perhaps when the validator was removed recently)
            await requirePChainBallance(options.pchainTxPrivateKey, client, BigInt(Math.round((0.1 + Number(options.initialBalance)) * 1e9)));

            // Call middlewareCompleteValidatorRegistration
            await completeValidatorRegistration(
                client,
                middlewareSvc,
                balancerSvc,
                config,
                options.pchainTxPrivateKey,
                blsProofOfPossession,
                addNodeTxHash,
                Number(options.initialBalance),
                !options.skipWaitApi
            );
        }));

    // Remove node
    middlewareCmd
        .command("remove-node")
        .description("Remove a node from an L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .action(wrapAsyncAction(async (middlewareAddress, nodeId) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareRemoveNode(
                middlewareSvc,
                nodeId,
                client.account!
            );
        }));

    // Complete validator removal
    middlewareCmd
        .command("complete-validator-removal")
        .description("Complete validator removal on the P-Chain and on the middleware after removing a node")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("removeNodeTxHash", "Remove node transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .action(wrapAsyncAction(async (middlewareAddress, removeNodeTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = generateClient(opts.network, opts.privateKey!);

            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const balancerSvc = config.contracts.BalancerValidatorManager(await middlewareSvc.read.balancerValidatorManager());
            // Check if P-Chain address have 0.01 AVAX for tx fees but some times it can be less than 0.00005 AVAX (perhaps when the validator was added recently)
            await requirePChainBallance(options.pchainTxPrivateKey, client, BigInt(0.01 * 1e9));

            // Derive pchainTxAddress from the private key
            const { P: pchainTxAddress } = getAddresses(options.pchainTxPrivateKey, opts.network);

            await completeValidatorRemoval(
                client,
                middlewareSvc,
                balancerSvc,
                config,
                removeNodeTxHash,
                options.pchainTxPrivateKey,
                pchainTxAddress,
                !options.skipWaitApi,
                options.nodeId.length > 0 ? options.nodeId : undefined,
            );
        }));

    // Init stake update
    middlewareCmd
        .command("init-stake-update")
        .description("Initialize validator stake update and lock")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .argument("newStake", "New stake amount")
        .action(wrapAsyncAction(async (middlewareAddress, nodeId, newStake) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const primaryCollateral = await middlewareSvc.read.PRIMARY_ASSET();
            const collateral = config.contracts.DefaultCollateral(primaryCollateral);
            const decimals = await collateral.read.decimals();
            const newStakeWei = parseUnits(newStake, decimals);
            await middlewareInitStakeUpdate(
                middlewareSvc,
                nodeId,
                newStakeWei,
                client.account!
            );
        }));

    // Complete stake update
    middlewareCmd
        .command("complete-stake-update")
        .description("Complete validator stake update of all or specified node IDs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validatorStakeUpdateTxHash", "Validator stake update transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .action(wrapAsyncAction(async (middlewareAddress, validatorStakeUpdateTxHash, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }

            const client = generateClient(opts.network, options.pchainTxPrivateKey);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);

            // Check if P-Chain address have 0.01 AVAX for tx fees
            await requirePChainBallance(opts.privateKey!, client, BigInt(0.01 * 1e9));

            await completeWeightUpdate(
                client,
                middlewareSvc,
                config,
                validatorStakeUpdateTxHash,
                options.pchainTxPrivateKey,
                client.account!,
                options.nodeId.length > 0 ? options.nodeId : undefined,
            );
        }));

    // Operator cache / calcAndCacheStakes
    middlewareCmd
        .command("calc-operator-cache")
        .description("Calculate and cache stakes for operators")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(wrapAsyncAction(async (middlewareAddress, epoch, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            logger.log("Calculating and caching stakes...");

            if (!client.account) {
                throw new Error('Client account is required');
            }
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const hash = await middlewareSvc.safeWrite.calcAndCacheStakes([epoch, collateralClass],
                {
                    chain: null,
                    account: client.account,
                });
            logger.log("calcAndCacheStakes done, tx hash:", hash);

        }));

    // calcAndCacheNodeStakeForAllOperators
    middlewareCmd
        .command("calc-node-stakes")
        .description("Calculate and cache node stakes for all operators")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(wrapAsyncAction(async (middlewareAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareCalcNodeStakes(
                middlewareSvc,
                client.account!
            );
        }));

    // forceUpdateNodes
    middlewareCmd
        .command("force-update-nodes")
        .description("Force update operator nodes with stake limit")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addOption(new Option("--limit-stake <stake>", "Stake limit").default(0n).argParser(ParserAVAX))
        .action(wrapAsyncAction(async (middlewareAddress, operator, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareForceUpdateNodes(
                middlewareSvc,
                operator,
                options.limitStake,
                client
            );
        }));

    // topUpAllOperatorNodes
    middlewareCmd
        .command("top-up-operator-validators")
        .description("Top up all operator validators to meet a target continuous fee balance")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .argument("targetBalance", "Target continuous fee balance per validator (in AVAX)")
        .action(wrapAsyncAction(async (middlewareAddress, operator, targetBalance) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const targetBalanceWei = parseUnits(targetBalance, 9); // AVAX has 9 decimals
            if (targetBalanceWei <= BigInt(1e7)) { // 0.01 AVAX min
                throw new Error("Target balance must be greater than 0.01 AVAX");
            }
            const balancerAddress = await middlewareSvc.read.BALANCER()
            const balancer = config.contracts.BalancerValidatorManager(balancerAddress);
            const [nodeCount, subnetID] = await Promise.all([middlewareSvc.read.getOperatorNodesLength([operator]), balancer.read.subnetID()]);
            const validators = await getCurrentValidators(client, utils.base58check.encode(hexToUint8Array(subnetID)))

            const validatorsToCheck = await Promise.all(
                A.range(0, Number(nodeCount)-1)
                    .map(async (index) => {
                        const nodeIdHex = await middlewareSvc.read.operatorNodesArray([operator, BigInt(index)]);
                        return validators.find(v => v.nodeID === encodeNodeID(nodeIdHex));
            }))

            const validatorsToTopUp = validatorsToCheck.reduce((acc, validator) => {
                if (validator && validator.balance! < targetBalanceWei - BigInt(1e7)) {// 0.01 AVAX min diff
                    acc.push({
                        validationId: validator.validationID! as Hex,
                        topup: targetBalanceWei - BigInt(validator.balance!),
                    });
                }
                return acc
            }, [] as { validationId: Hex; topup: bigint }[])

            const totalTopUp = validatorsToTopUp.reduce((acc, v) => acc + v.topup, 0n);

            if (validatorsToTopUp.length === 0) {
                logger.log("All operator validators have sufficient balance. No top-up needed.");
                return;
            }

            logger.log(`${validatorsToTopUp.length} validators to top-up for a total of ${formatUnits(totalTopUp, 9)} AVAX.`);
            await requirePChainBallance(opts.privateKey!, client, totalTopUp + BigInt(2e4) * nodeCount); // extra 20000 for fees
            const response = await logger.prompt(`Proceed with topping up validators? (y/n): `);
            if (response.toLowerCase() !== 'y') {
                logger.log("Operation cancelled by user.");
                process.exit(0);
            }

            for (const { validationId, topup } of validatorsToTopUp) {
                logger.log(`\nTopping up validator ${validationId}`);
                const amount = Number(topup)/1e9
                pipe(await increasePChainValidatorBalance(
                    client,
                    opts.privateKey!,
                    amount,
                    validationId,
                    false
                ),
                    R.tapError(err => { logger.error(err); process.exit(1) }),)
            }
            logger.log("\nCompleted top-up of operator validators.");
            logger.addData('total_amount', totalTopUp)
            logger.addData('validators', validatorsToTopUp)
        }));

    // getOperatorStake (read)
    middlewareCmd
        .command("get-operator-stake")
        .description("Get operator stake for a specific epoch and collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(wrapAsyncAction(async (middlewareAddress, operator, epoch, collateralClass) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorStake(
                middlewareSvc,
                operator,
                epoch,
                collateralClass
            );
        }));
    
    middlewareCmd
        .command("get-operator-used-stake-cached-per-epoch")
        .description("Get operator stake cached per epoch for a specific collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(wrapAsyncAction(async (middlewareAddress, epoch, operator, collateralClass) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const usedStake = await middlewareSvc.read.getOperatorUsedStakeCachedPerEpoch(
                [epoch, operator, collateralClass]
            );
            logger.log(`Used stake for operator ${operator} in epoch ${epoch} for collateral class ${collateralClass}: ${usedStake}`);
            logger.addData('used_stake', Number(usedStake));
        }));

    // getCurrentEpoch (read)
    middlewareCmd
        .command("get-current-epoch")
        .description("Get current epoch number")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(wrapAsyncAction(async (middlewareAddress) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetCurrentEpoch(
                middlewareSvc
            );
        }));

    // getEpochStartTs (read)
    middlewareCmd
        .command("get-epoch-start-ts")
        .description("Get epoch start timestamp")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(wrapAsyncAction(async (middlewareAddress, epoch) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetEpochStartTs(
                middlewareSvc,
                epoch
            );
        }));

    // getActiveNodesForEpoch (read)
    middlewareCmd
        .command("get-active-nodes-for-epoch")
        .description("Get active nodes for an operator in a specific epoch")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(wrapAsyncAction(async (middlewareAddress, operator, epoch) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetActiveNodesForEpoch(
                middlewareSvc,
                operator,
                epoch
            );
        }));

    // getOperatorNodesLength (read)
    middlewareCmd
        .command("get-operator-nodes-length")
        .description("Get current number of nodes for an operator")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(wrapAsyncAction(async (middlewareAddress, operator) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorNodesLength(
                middlewareSvc,
                operator
            );
        }));

    // getNodeStakeCache (read)
    middlewareCmd
        .command("get-node-stake-cache")
        .description("Get node stake cache for a specific epoch and validator")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgHex("validationId", "Validation ID"))
        .action(wrapAsyncAction(async (middlewareAddress, epoch, validationId) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetNodeStakeCache(
                middlewareSvc,
                epoch,
                validationId
            );
        }));

    // getOperatorLockedStake (read)
    middlewareCmd
        .command("get-operator-locked-stake")
        .description("Get operator locked stake")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(wrapAsyncAction(async (middlewareAddress, operator) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorLockedStake(
                middlewareSvc,
                operator
            );
        }));

    // nodePendingRemoval (read)
    middlewareCmd
        .command("node-pending-removal")
        .description("Check if node is pending removal")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validationId", "Validation ID"))
        .action(wrapAsyncAction(async (middlewareAddress, validationId) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareNodePendingRemoval(
                middlewareSvc,
                validationId
            );
        }));

    // nodePendingUpdate (read)
    middlewareCmd
        .command("node-pending-update")
        .description("Check if node is pending stake update")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validationId", "Validation ID"))
        .action(wrapAsyncAction(async (middlewareAddress, validationId) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            // const isPending = await middlewareSvc.read.pe
        }));

    // getOperatorUsedStakeCached (read)
    middlewareCmd
        .command("get-operator-used-stake")
        .description("Get operator used stake from cache")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(wrapAsyncAction(async (middlewareAddress, operator) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorUsedStake(
                middlewareSvc,
                operator
            );
        }));

    // getOperatorAvailableStake (read)
    middlewareCmd
        .command("get-operator-available-stake")
        .description("Get operator available stake")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(wrapAsyncAction(async (middlewareAddress, operator) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const availableStake = await middlewareSvc.read.getOperatorAvailableStake([operator]);
            logger.log(`Operator ${operator} available stake:\n${availableStake}`);
        }));

    // getAllOperators (read)
    middlewareCmd
        .command("get-all-operators")
        .description("Get all operators registered")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(wrapAsyncAction(async (middlewareAddress) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetAllOperators(
                middlewareSvc
            );
        }));

    // getCollateralClassIds (read)
    middlewareCmd
        .command("get-collateral-class-ids")
        .description("Get all collateral class IDs from the middleware")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(wrapAsyncAction(async (middlewareAddress) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await getCollateralClassIds(
                middlewareSvc
            );
        }));

    // getActiveCollateralClasses (read)
    middlewareCmd
        .command("get-active-collateral-classes")
        .description("Get active collateral classes (primary and secondary)")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(wrapAsyncAction(async (middlewareAddress) => {
            const client = generateClient(program.opts().network);
            const config = getConfig( client, program.opts().wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            await getActiveCollateralClasses(
                middlewareSvc
            );
        }));

    middlewareCmd
        .command("node-logs")
        .description("Get middleware node logs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addOption(new Option("--node-id <nodeId>", "Node ID to filter logs").default(undefined).argParser(ParserNodeID))
        .addOption(new Option('--snowscan-api-key <string>', "Snowscan API key").default(""))
        .action(wrapAsyncAction(async (middlewareAddress, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            logger.log(`nodeId: ${options.nodeId}`);
            const middleware = config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetNodeLogs(
                client,
                middleware,
                config,
                options.nodeId,
                options.snowscanApiKey
            );
        }));

    middlewareCmd
        .command("get-last-node-validation-id")
        .description("Set middleware log level")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgNodeID())
        .action(wrapAsyncAction(async (middlewareAddress, nodeId) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const balancerAddress = await middlewareSvc.read.balancerValidatorManager();
            const balancerSvc = config.contracts.BalancerValidatorManager(balancerAddress);
            logger.log(`Fetching last validation ID`);
            const validationId = await middlewareLastValidationId(
                client,
                middlewareSvc,
                balancerSvc,
                nodeId
            )
            logger.log(`Last validationID: ${validationId}`);
        }))

    middlewareCmd
        .command("to-vault-epoch")
        .description("convert middleware epoch to a vault epoch")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgAddress("vaultAddress", "Vault address"))
        .addArgument(ArgNumber("middlewareEpoch", "Middleware epoch number"))
        .action(wrapAsyncAction(async (middlewareAddress, vaultAddress, middlewareEpoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const vaultSvc = config.contracts.VaultTokenized(vaultAddress);
            const middlewareEpochTs = await middlewareSvc.read.getEpochStartTs([middlewareEpoch]);
            const vaultEpoch = await vaultSvc.read.epochAt([middlewareEpochTs]);
            logger.log(`Vault epoch at middleware epoch ${middlewareEpoch} (timestamp: ${middlewareEpochTs}) is ${vaultEpoch}`);
        }))
    
    middlewareCmd
        .command("update-window-ends-ts")
        .description("Get the end timestamp of the last completed middleware epoch window")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .action(wrapAsyncAction(async (middlewareAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const [currentEpoch, updateWindow] = await Promise.all([middlewareSvc.read.getCurrentEpoch(), middlewareSvc.read.UPDATE_WINDOW()]);
            const lastEpochStartTs = await middlewareSvc.read.getEpochStartTs([currentEpoch])
            logger.log(`Window ends at: ${lastEpochStartTs + updateWindow}`);
        }))

    middlewareCmd
        .command("vault-to-middleware-epoch")
        .description("convert vault epoch to a middleware epoch")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgAddress("vaultAddress", "Vault address"))
        .addArgument(ArgNumber("vaultEpoch", "Vault epoch number"))
        .action(wrapAsyncAction(async (middlewareAddress, vaultAddress, vaultEpoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const middlewareSvc = config.contracts.L1Middleware(middlewareAddress);
            const vaultSvc = config.contracts.VaultTokenized(vaultAddress);
            const vaultEpochStartTs = await vaultSvc.read.epochDuration() * vaultEpoch + await vaultSvc.read.epochDurationInit();
            const middlewareEpoch = await middlewareSvc.read.getEpochAtTs([vaultEpochStartTs]);
            logger.log(`Middleware epoch at vault epoch ${vaultEpoch} (timestamp: ${vaultEpochStartTs}) is ${middlewareEpoch}`);
        }))

    /**
     * --------------------------------------------------
     * OPERATOR → L1: optIn / optOut / check
     * --------------------------------------------------
     */

    const operatorOptInCmd = program
        .command("opt-in")
        .description("Commands for operator opt-in services");
    
    operatorOptInCmd
        .command("l1-in")
        .description("Operator opts in to a given L1")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .action(wrapAsyncAction(async (l1Address) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const service = config.contracts.OperatorL1OptInService(config.opL1OptIn);
            await optInL1(
                service,
                l1Address,
                client.account!
            );
        }));

    operatorOptInCmd
        .command("l1-out")
        .description("Operator opts out from a given L1")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .action(wrapAsyncAction(async (l1Address) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const service = config.contracts.OperatorL1OptInService(config.opL1OptIn);
            await optOutL1(
                service,
                l1Address,
                client.account!
            );
        }));

    operatorOptInCmd
        .command("check-l1")
        .description("Check if an operator is opted in to a given L1")
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .action(wrapAsyncAction(async (operator, l1Address) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const service = config.contracts.OperatorL1OptInService(config.opL1OptIn);
            await checkOptInL1(
                service,
                operator,
                l1Address
            );
        }));


    /**
     * --------------------------------------------------
     * OPERATOR → Vault: optIn / optOut / check
     * --------------------------------------------------
     */
    operatorOptInCmd
        .command("vault-in")
        .description("Operator opts in to a given Vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(wrapAsyncAction(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const service = config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await optInVault(
                service,
                vaultAddress,
                client.account!
            );
        }));

    operatorOptInCmd
        .command("vault-out")
        .description("Operator opts out from a given Vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(wrapAsyncAction(async (vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const service = config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await optOutVault(
                service,
                vaultAddress,
                client.account!
            );
        }));

    operatorOptInCmd
        .command("check-vault")
        .description("Check if an operator is opted in to a given Vault")
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(wrapAsyncAction(async (operator, vaultAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const service = config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await checkOptInVault(
                service,
                operator,
                vaultAddress
            );
        }));

    /**
     * --------------------------------------------------
     * BALANCER
     * --------------------------------------------------
     */
    const balancerCmd = program
        .command("balancer")
        .description("Commands to interact with BalancerValidatorManager contracts");
    
    balancerCmd
        .command("set-up-security-module")
        .description("Set up a security module")
        .addArgument(ArgAddress("balancerValidatorManagerAddress", "Balancer validator manager address"))
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("maxWeight", "Maximum weight"))
        .action(wrapAsyncAction(async (balancerValidatorManagerAddress, middlewareAddress, maxWeight) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            // instantiate BalancerValidatorManager contract
            const balancer = config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await setUpSecurityModule(
                balancer,
                middlewareAddress,
                maxWeight,
                client.account!
            );
        }));

    balancerCmd
        .command("get-security-modules")
        .description("Get all security modules")
        .addArgument(ArgAddress("balancerValidatorManagerAddress", "Balancer validator manager address"))
        .action(wrapAsyncAction(async (balancerValidatorManagerAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const balancer = config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await getSecurityModules(
                balancer
            );
        }));

    balancerCmd
        .command("get-security-module-weights")
        .description("Get security module weights")
        .addArgument(ArgAddress("balancerValidatorManagerAddress", "Balancer validator manager address"))
        .addArgument(ArgAddress("securityModule", "Security module address"))
        .action(wrapAsyncAction(async (balancerValidatorManagerAddress, securityModule) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const balancer = config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await getSecurityModuleWeights(
                balancer,
                securityModule
            );
        }));
    
    balancerCmd
        .command("get-validator-status")
        .description("Get validator status by node ID")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgNodeID("nodeId", "Node ID"))
        .action(wrapAsyncAction(async (balancerAddress, nodeId) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const balancer = config.contracts.BalancerValidatorManager(balancerAddress);
            const validationId = await balancer.read.getNodeValidationID([parseNodeID(nodeId, false)]);
            if (Number(validationId) === 0) {
                logger.log("Validator status: NotRegistered");
                return;
            }
            const [validator, PendingWeightUpdate] = await Promise.all([balancer.read.getValidator([validationId]), balancer.read.isValidatorPendingWeightUpdate([validationId])]);

            const status = validator.status == ValidatorStatus.Active && PendingWeightUpdate ? ValidatorStatus.PendingStakeUpdated : validator.status;
            logger.log("Validator status:", ValidatorStatusNames[status]);
            logger.addData("status", ValidatorStatusNames[status]);
            logger.addData("statusId", status);
            logger.addData("validationId", validationId);
            logger.addData("nodeId", nodeId);
        }));

    balancerCmd
        .command("resend-validator-registration")
        .description("Resend validator registration transaction")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgNodeID("nodeId", "Node ID"))
        .action(wrapAsyncAction(async (balancerAddress, nodeId) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const balancer = config.contracts.BalancerValidatorManager(balancerAddress);
            const nodeIdHex32 = parseNodeID(nodeId, false)
            const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
            const hash = await balancer.safeWrite.resendRegisterValidatorMessage(
                [validationId],
                { chain: null, account: client.account! },
            );
            logger.log("resendValidatorRegistration executed successfully, tx hash:", hash);
        }
        ));

    balancerCmd
        .command("resend-weight-update")
        .description("Resend validator weight update transaction")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgNodeID("nodeId", "Node ID"))
        .action(wrapAsyncAction(async (balancerAddress, nodeId) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const balancer = config.contracts.BalancerValidatorManager(balancerAddress);
            const nodeIdHex32 = parseNodeID(nodeId, false)
            const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
            const hash = await balancer.safeWrite.resendValidatorWeightUpdate(
                [validationId],
                { chain: null, account: client.account! },
            );
            logger.log("resendWeightUpdate executed successfully, tx hash:", hash);
        }
        ));

    balancerCmd
        .command("resend-validator-removal")
        .description("Resend validator removal transaction")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgNodeID("nodeId", "Node ID"))
        .action(wrapAsyncAction(async (balancerAddress, nodeId) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const balancer = config.contracts.BalancerValidatorManager(balancerAddress);
            const nodeIdHex32 = parseNodeID(nodeId, false)
            const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
            const hash = await balancer.safeWrite.resendValidatorRemovalMessage(
                [validationId],
                { chain: null, account: client.account! },
            );
            logger.log("resendValidatorRemoval executed successfully, tx hash:", hash);
        }
        ));
    /**
     * --------------------------------------------------
     * POA-Security-Module
     * --------------------------------------------------
     * This section is for the POA Security Module commands.
     * It includes commands to add or remove validators
     */

    const poaCmd = program
        .command("poa")
        .description("Commands to interact with POA Security Module contracts");
    
    poaCmd
        .command("add-node")
        .description("Add a new node to an L1")
        .addArgument(ArgAddress("poaSecurityModule", "PoA Security Module contract address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("blsKey", "BLS public key"))
        .addArgument(ArgNumber("initialWeight", "Initial weight of the validator"))
        .addOption(new Option("--registration-expiry <expiry>", "Expiry timestamp (default: now + 12 hours)"))
        .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .action(wrapAsyncAction(async (poaSecurityModule, nodeId, blsKey, initialWeight, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const poaSM = config.contracts.PoASecurityModule(poaSecurityModule);

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

            const nodeIdHex32 = parseNodeID(nodeId, false)
            const hash = await poaSM.safeWrite.initiateValidatorRegistration(
                [nodeIdHex32, blsKey, { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] }, { threshold: disableOwner[0], addresses: disableOwner[1] }, initialWeight],
                { chain: null, account: client.account! },
            );
            logger.log("addNode executed successfully, tx hash:", hash);
        }));
    
    poaCmd
        .command("complete-validator-registration")
        .description("Complete validator registration on the P-Chain and on the middleware after adding a node")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgHex("addNodeTxHash", "Add node transaction hash"))
        .addArgument(ArgBLSPOP())
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserAddress))
        .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.0001').argParser((value) => ParseUnits(value, 9, 'Invalid initial balance')))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .action(wrapAsyncAction(async (poaSecurityModuleAddress, addNodeTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }

            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const poaSecurityModule = config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            const balancerSvc = config.contracts.BalancerValidatorManager(await poaSecurityModule.read.balancerValidatorManager());

            // Check if P-Chain address have 0.1 AVAX for tx fees but some times it can be less than 0.00005 AVAX (perhaps when the validator was removed recently)
            await requirePChainBallance(options.pchainTxPrivateKey, client, BigInt(Math.round(0.1 + Number(options.initialBalance)) * 1e9));

            // Call middlewareCompleteValidatorRegistration
            await completeValidatorRegistration(
                client,
                poaSecurityModule,
                balancerSvc,
                config,
                options.pchainTxPrivateKey,
                blsProofOfPossession,
                addNodeTxHash,
                Number(options.initialBalance),
                !options.skipWaitApi
            );
        }));

    poaCmd
        .command("remove-node")
        .description("Initiate validator removal")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgNodeID())
        .action(wrapAsyncAction(async (poaSecurityModuleAddress, nodeID) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const poaSecurityModule = config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            const balancerValidatorManagerAddress = await poaSecurityModule.read.balancerValidatorManager();
            const balancer = config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            // Convert nodeID to Hex if necessary
            const nodeIdHex = parseNodeID(nodeID, false);
            logger.log(nodeIdHex)
            const validationId = await balancer.read.getNodeValidationID([nodeIdHex]);
            const txHash = await poaSecurityModule.safeWrite.initiateValidatorRemoval([validationId], {
                chain: null,
                account: client.account!,
            })
            logger.log(`End validation initialized for node ${nodeID}. Transaction hash: ${txHash}`);

        }));

    poaCmd
        .command("complete-validator-removal")
        .description("Complete validator removal in the P-Chain and in the POA Security Module")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("removeNodeTxHash", "Remove node transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserPrivateKey))
        .action(wrapAsyncAction(async (poaSecurityModuleAddress, nodeId, removeNodeTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const poaSecurityModule = config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            const balancerSvc = config.contracts.BalancerValidatorManager(await poaSecurityModule.read.balancerValidatorManager());
            // Check if P-Chain address have 0.01 AVAX for tx fees but some times it can be less than 0.00005 AVAX (perhaps when the validator was added recently)
            await requirePChainBallance(options.pchainTxPrivateKey, client, BigInt(0.01 * 1e9));

            // Derive pchainTxAddress from the private key
            const { P: pchainTxAddress } = getAddresses(options.pchainTxPrivateKey, opts.network);

            const txHash = await completeValidatorRemoval(
                client,
                poaSecurityModule,
                balancerSvc,
                config,
                removeNodeTxHash,
                options.pchainTxPrivateKey,
                pchainTxAddress,
                !options.skipWaitApi,
                options.nodeId.length > 0 ? options.nodeId : undefined,
            );

            logger.log(`End validation initialized for node . Transaction hash: ${txHash}`);
        }));

    poaCmd
        .command("init-weight-update")
        .description("Update validator weight")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgNumber("newWeight", "New weight"))
        .action(wrapAsyncAction(async (poaSecurityModuleAddress, nodeId, newWeight) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const poaSecurityModule = config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            logger.log("Calling function initializeValidatorStakeUpdate...");

            // Parse NodeID to bytes32 format
            const nodeIdHex32 = parseNodeID(nodeId)

            const hash = await poaSecurityModule.safeWrite.initiateValidatorWeightUpdate(
                [nodeIdHex32, newWeight],
                { chain: null, account: client.account! }
            );
            logger.log("initiateValidatorWeightUpdate executed successfully, tx hash:", hash);
        }));

    poaCmd
        .command("complete-weight-update")
        .description("Complete validator weight update of all or specified node IDs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validatorStakeUpdateTxHash", "Validator stake update transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .action(wrapAsyncAction(async (poaSecurityModuleAddress, nodeId, weightUpdateTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const poaSecurityModule = config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            // Check if P-Chain address have 0.01 AVAX for tx fees but some times it can be less than 0.00005 AVAX (perhaps when the validator was added recently)
            await requirePChainBallance(options.pchainTxPrivateKey, client, BigInt(0.01 * 1e9));

            const txHash = await completeWeightUpdate(
                client,
                poaSecurityModule,
                config,
                weightUpdateTxHash,
                options.pchainTxPrivateKey,
                client.account!,
                options.nodeId.length > 0 ? options.nodeId : undefined,
            );

            logger.log(`Weight update completed for node . Transaction hash: ${txHash}`);
        }));

    /**
         * --------------------------------------------------
         * OP-STAKES: enumerates the vaults and attempts to read stake for <operator>
         * --------------------------------------------------
         */
    vaultManagerCmd
        .command("opstakes")
        .description("Show operator stakes across L1s, enumerating each L1 the operator is opted into.")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgAddress("operatorAddress", "Operator address"))
        .description("Show operator stakes across L1s, enumerating each L1 the operator is opted into.")
        .action(wrapAsyncAction(async (middlewareVaultManager, operatorAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);

            const operator = operatorAddress;
            logger.log(`Operator: ${operator}`);

            // 1) Read total vaults from VaultManager
            const vaultManager = config.contracts.VaultManager(middlewareVaultManager);
            const vaultCount = await vaultManager.read.getVaultCount()

            logger.log(`Found ${vaultCount} vault(s).`);

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

                logger.log(`\nVault #${i}: ${vaultAddress}`);

                // read the collateralClass
                const collateralClass = await vaultManager.read.getVaultCollateralClass([vaultAddress]);

                // read delegator
                const vaultTokenized = config.contracts.VaultTokenized(vaultAddress);
                const delegator = await vaultTokenized.read.delegator();

                if (delegator === '0x0000000000000000000000000000000000000000') {
                    logger.log("    (No delegator set, skipping)");
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
                            logger.log(
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
            logger.log("\nAggregated stakes by collateral:");
            if (Object.keys(totalStakesByCollateral).length === 0) {
                logger.log("   No stakes found or operator not opted into any L1s this way.");
            } else {
                for (const [collateralAddr, totalWei] of Object.entries(totalStakesByCollateral)) {
                    // optional: look up decimals for that collateral if you want a float
                    const decimals = 18; // or read from chain
                    const floatAmount = Number(totalWei) / 10 ** decimals;
                    logger.log(`   Collateral=${collateralAddr} totalStakeWei=${totalWei} => ${floatAmount}`);
                }
            }
        }));

    vaultManagerCmd
        .command("l1stakes")
        .description("Show L1 stakes for a given validator manager")
        .addArgument(ArgAddress("validatorManagerAddress", "Validator manager address"))
        .description("Show L1 stakes for a given validator manager")
        .action(wrapAsyncAction(async (validatorManagerAddress) => {
            // TODO: Implement
        }));

    // --------------------------------------------------
    // "UpTime" Commands
    // These commands help with reporting validator uptime to the UptimeTracker contract
    // They include fetching the signed uptime message from a validator and submitting it to the contract
    // --------------------------------------------------

    const uptimeCmd = program
        .command("uptime")
        .description("Commands related to validator uptime reporting");

    uptimeCmd
        .command("get-validation-uptime-message")
        .description("Get the validation uptime message for a given validator in the given L1 RPC")
        .addArgument(ArgURI("rpcUrl", "RPC URL like 'http(s)://<domain or ip and port>'"))
        .addArgument(ArgCB58("chainId", "Chain ID"))
        .addArgument(ArgNodeID())
        .action(wrapAsyncAction(async (rpcUrl, chainId, nodeId) => {
            rpcUrl = rpcUrl + "/ext/bc/" + chainId;
            const opts = program.opts();
            await getValidationUptimeMessage(
                opts.network,
                rpcUrl,
                nodeId,
                opts.network === "fuji" ? 5 : 1,
                chainId);
        }));

    uptimeCmd
        .command('compute-validator-uptime')
        .addArgument(ArgAddress("uptimeTrackerAddress", "Uptime tracker contract address"))
        .addArgument(ArgHex("signedUptimeHex", "Signed uptime hex"))
        .action(wrapAsyncAction(async (uptimeTrackerAddress, signedUptimeHex) => {
            const { privateKey, network, wait } = program.opts();
            const client = generateClient(network, privateKey!);
            const config = getConfig( client, wait);
            await computeValidatorUptime(
                config.contracts.UptimeTracker(uptimeTrackerAddress as Hex),
                client.account!,
                signedUptimeHex as Hex,
            );
        }));

    // ---- Combined Uptime Reporting Command ----
    uptimeCmd
        .command("report-uptime-validator")
        .description("Gets a validator's signed uptime message and submits it to the UptimeTracker contract.")
        .addArgument(ArgURI("rpcUrl", "RPC URL like 'http(s)://<domain or ip and port>'"))
        .addArgument(ArgCB58("sourceChainId", "The Chain ID for which the uptime is being reported"))
        .addArgument(ArgNodeID("nodeId", "The NodeID of the validator"))
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract on the C-Chain"))
        .action(wrapAsyncAction(async (rpcUrl, sourceChainId, nodeId, uptimeTrackerAddress) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                logger.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }

            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            rpcUrl = rpcUrl + "/ext/bc/" + sourceChainId;

            await reportAndSubmitValidatorUptime(
                opts.network,
                rpcUrl,
                nodeId,
                sourceChainId,
                config.contracts.UptimeTracker(uptimeTrackerAddress),
                client.account!
            );
        }));

    // ---- Adding new commands for operator uptime ----
    uptimeCmd
        .command("compute-operator-uptime")
        .description("Compute uptime for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(wrapAsyncAction(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                logger.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            await computeOperatorUptimeAtEpoch(
                uptimeTracker,
                operator,
                epoch,
                client.account!
            );
        }));

    uptimeCmd
        .command("compute-operator-uptime-range")
        .description("Compute uptime for an operator over a range of epochs (client-side looping)")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("startEpoch", "Starting epoch number"))
        .addArgument(ArgNumber("endEpoch", "Ending epoch number"))
        .action(wrapAsyncAction(async (uptimeTrackerAddress, operator, startEpoch, endEpoch) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                logger.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            await computeOperatorUptimeForEpochs(
                uptimeTracker,
                operator,
                startEpoch,
                endEpoch,
                client.account!
            );
        }));

    // ---- Read-only commands for uptime data ----
    uptimeCmd
        .command("get-validator-uptime")
        .description("Get the recorded uptime for a validator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgHex("validationID", "Validation ID of the validator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(wrapAsyncAction(async (uptimeTrackerAddress, validationID, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            const uptime = await getValidatorUptimeForEpoch(
                uptimeTracker,
                validationID,
                epoch
            );
            logger.log(`Validator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
        }));

    uptimeCmd
        .command("check-validator-uptime-set")
        .description("Check if uptime data is set for a validator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgHex("validationID", "Validation ID of the validator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(wrapAsyncAction(async (uptimeTrackerAddress, validationID, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            const isSet = await isValidatorUptimeSetForEpoch(
                uptimeTracker,
                validationID,
                epoch
            );
            logger.log(`Validator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
        }));

    uptimeCmd
        .command("get-operator-uptime")
        .description("Get the recorded uptime for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(wrapAsyncAction(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            const uptime = await getOperatorUptimeForEpoch(
                uptimeTracker,
                operator,
                epoch
            );
            logger.log(`Operator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
        }));

    uptimeCmd
        .command("check-operator-uptime-set")
        .description("Check if uptime data is set for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(wrapAsyncAction(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const uptimeTracker = config.contracts.UptimeTracker(uptimeTrackerAddress);
            const isSet = await isOperatorUptimeSetForEpoch(
                uptimeTracker,
                operator,
                epoch
            );
            logger.log(`Operator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
        }));

    /* --------------------------------------------------
    * REWARDS COMMANDS
    * -------------------------------------------------- */
    const rewardsCmd = program
        .command("rewards")
        .description("Commands for managing rewards");

    rewardsCmd
        .command("distribute")
        .description("Distribute rewards for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to distribute rewards for"))
        .addArgument(ArgNumber("batchSize", "Number of operators to process in this batch"))
        .action(wrapAsyncAction(async (rewardsAddress, epoch, batchSize) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await distributeRewards(
                rewardsContract,
                epoch,
                batchSize,
                client.account!
            );
        }));

    rewardsCmd
        .command("claim")
        .description("Claim rewards for a staker")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(wrapAsyncAction(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimRewards(
                rewardsContract,
                rewardsToken,
                recipient,
                client.account!
            );
        }));

    rewardsCmd
        .command("claim-operator-fee")
        .description("Claim operator fees")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(wrapAsyncAction(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimOperatorFee(
                rewardsContract,
                rewardsToken,
                recipient,
                client.account!
            );
        }));

    rewardsCmd
        .command("claim-curator-fee")
        .description("Claim curator fees")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(wrapAsyncAction(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimCuratorFee(
                rewardsContract,
                rewardsToken,
                recipient,
                client.account!
            );
        }));

    rewardsCmd
        .command("claim-protocol-fee")
        .description("Claim protocol fees (only for protocol owner)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(wrapAsyncAction(async (rewardsAddress, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimProtocolFee(
                rewardsContract,
                rewardsToken,
                recipient,
                client.account!
            );
        }));

    rewardsCmd
        .command("claim-undistributed")
        .description("Claim undistributed rewards (admin only)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to claim undistributed rewards for"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(wrapAsyncAction(async (rewardsAddress, epoch, rewardsToken, options) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            await claimUndistributedRewards(
                rewardsContract,
                epoch,
                rewardsToken,
                recipient,
                client.account!
            );
        }));

    rewardsCmd
        .command("set-amount")
        .description("Set rewards amount for epochs")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("startEpoch", "Starting epoch"))
        .addArgument(ArgNumber("numberOfEpochs", "Number of epochs"))
        .addArgument(ArgAddress("rewardsToken", "Address of the rewards token"))
        .addArgument(ArgBigInt("rewardsAmount", "Amount of rewards in wei"))
        .action(wrapAsyncAction(async (rewardsAddress, startEpoch, numberOfEpochs, rewardsToken, rewardsAmount) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setRewardsAmountForEpochs(
                rewardsContract,
                startEpoch,
                numberOfEpochs,
                rewardsToken,
                rewardsAmount,
                client.account!
            );
        }));

    rewardsCmd
        .command("set-share-collateral-class")
        .description("Set rewards share for collateral class")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .addArgument(ArgNumber("share", "Share in basis points (100 = 1%)"))
        .action(wrapAsyncAction(async (rewardsAddress, collateralClass, share) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setRewardsShareForCollateralClass(
                rewardsContract,
                collateralClass,
                share,
                client.account!
            );
        }));

    rewardsCmd
        .command("set-min-uptime")
        .description("Set minimum required uptime for rewards eligibility")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("minUptime", "Minimum uptime in seconds"))
        .action(wrapAsyncAction(async (rewardsAddress, minUptime) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setMinRequiredUptime(
                rewardsContract,
                minUptime,
                client.account!
            );
        }));

    rewardsCmd
        .command("set-admin")
        .description("Set admin role (DEFAULT_ADMIN_ROLE only)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("newAdmin", "New admin address"))
        .action(wrapAsyncAction(async (rewardsAddress, newAdmin) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setAdminRole(
                rewardsContract,
                newAdmin,
                client.account!
            );
        }));

    rewardsCmd
        .command("set-protocol-owner")
        .description("Set protocol owner (DEFAULT_ADMIN_ROLE only)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("newOwner", "New protocol owner address"))
        .action(wrapAsyncAction(async (rewardsAddress, newOwner) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await setProtocolOwner(
                rewardsContract,
                newOwner,
                client.account!
            );
        }));

    rewardsCmd
        .command("update-protocol-fee")
        .description("Update protocol fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(wrapAsyncAction(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await updateProtocolFee(
                rewardsContract,
                newFee,
                client.account!
            );
        }));

    rewardsCmd
        .command("update-operator-fee")
        .description("Update operator fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(wrapAsyncAction(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await updateOperatorFee(
                rewardsContract,
                newFee,
                client.account!
            );
        }));

    rewardsCmd
        .command("update-curator-fee")
        .description("Update curator fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(wrapAsyncAction(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await updateCuratorFee(
                rewardsContract,
                newFee,
                client.account!
            );
        }));

    rewardsCmd
        .command("update-all-fees")
        .description("Update all fees at once (protocol, operator, curator)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("protocolFee", "New protocol fee in basis points (100 = 1%)"))
        .addArgument(ArgNumber("operatorFee", "New operator fee in basis points (100 = 1%)"))
        .addArgument(ArgNumber("curatorFee", "New curator fee in basis points (100 = 1%)"))
        .action(wrapAsyncAction(async (rewardsAddress, protocolFee, operatorFee, curatorFee) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await updateAllFees(
                rewardsContract,
                protocolFee,
                operatorFee,
                curatorFee,
                client.account!
            );
        }));

    rewardsCmd
        .command("get-amounts")
        .description("Get rewards amounts per token for epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .action(wrapAsyncAction(async (rewardsAddress, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getRewardsAmountPerTokenFromEpoch(
                rewardsContract,
                epoch
            );
        }));

    rewardsCmd
        .command("get-amount-for-token")
        .description("Get rewards amount for a specific token from epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("token", "Token address"))
        .action(wrapAsyncAction(async (rewardsAddress, epoch, token) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getRewardsAmountForTokenFromEpoch(
                rewardsContract,
                epoch,
                token
            );
        }));

    rewardsCmd
        .command("get-operator-shares")
        .description("Get operator shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(wrapAsyncAction(async (rewardsAddress, epoch, operator) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getOperatorShares(
                rewardsContract,
                epoch,
                operator
            );
        }));

    rewardsCmd
        .command("get-vault-shares")
        .description("Get vault shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("vault", "Vault address"))
        .action(wrapAsyncAction(async (rewardsAddress, epoch, vault) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getVaultShares(
                rewardsContract,
                epoch,
                vault
            );
        }));

    rewardsCmd
        .command("get-curator-shares")
        .description("Get curator shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("curator", "Curator address"))
        .action(wrapAsyncAction(async (rewardsAddress, epoch, curator) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getCuratorShares(
                rewardsContract,
                epoch,
                curator
            );
        }));

    rewardsCmd
        .command("get-protocol-rewards")
        .description("Get protocol rewards for a token")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("token", "Token address"))
        .action(wrapAsyncAction(async (rewardsAddress, token) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getProtocolRewards(
                rewardsContract,
                token
            );
        }));

    rewardsCmd
        .command("get-distribution-batch")
        .description("Get distribution batch status for an epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .action(wrapAsyncAction(async (rewardsAddress, epoch) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getDistributionBatch(
                rewardsContract,
                epoch
            );
        }));

    rewardsCmd
        .command("get-fees-config")
        .description("Get current fees configuration")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .action(wrapAsyncAction(async (rewardsAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getFeesConfiguration(
                rewardsContract
            );
        }));

    rewardsCmd
        .command("get-share-collateral-class")
        .description("Get rewards share for collateral class")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(wrapAsyncAction(async (rewardsAddress, collateralClass) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getRewardsShareForCollateralClass(
                rewardsContract,
                collateralClass
            );
        }));

    rewardsCmd
        .command("get-min-uptime")
        .description("Get minimum required uptime for rewards eligibility")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .action(wrapAsyncAction(async (rewardsAddress) => {
            const opts = program.opts();
            const client = generateClient(opts.network, opts.privateKey!);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getMinRequiredUptime(
                rewardsContract
            );
        }));

    rewardsCmd
        .command("get-last-claimed-staker")
        .description("Get last claimed epoch for a staker")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("staker", "Staker address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(wrapAsyncAction(async (rewardsAddress, staker, rewardToken) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getLastEpochClaimedStaker(
                rewardsContract,
                staker,
                rewardToken
            );
        }));

    rewardsCmd
        .command("get-last-claimed-operator")
        .description("Get last claimed epoch for an operator")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(wrapAsyncAction(async (rewardsAddress, operator, rewardToken) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getLastEpochClaimedOperator(
                rewardsContract,
                operator,
                rewardToken
            );
        }));

    rewardsCmd
        .command("get-last-claimed-curator")
        .description("Get last claimed epoch for a curator")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("curator", "Curator address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(wrapAsyncAction(async (rewardsAddress, curator, rewardToken) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getLastEpochClaimedCurator(
                rewardsContract,
                curator,
                rewardToken
            );
        }));

    rewardsCmd
        .command("get-last-claimed-protocol")
        .description("Get last claimed epoch for protocol owner")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("protocolOwner", "Protocol owner address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(wrapAsyncAction(async (rewardsAddress, protocolOwner, rewardToken) => {
            const opts = program.opts();
            const client = generateClient(opts.network);
            const config = getConfig( client, opts.wait);
            const rewardsContract = config.contracts.Rewards(rewardsAddress);
            await getLastEpochClaimedProtocol(
                rewardsContract,
                protocolOwner,
                rewardToken
            );
        }));

    buildKeyStoreCmds(
        program
            .command("key")
            .description("Manage the cli keystore (advanced users can use pass directly)")
    )

    function printIndentedHelp(cmd: CommandUnknownOpts | Command, indent = 0): boolean {
        const pad = " ".repeat(indent);
        let newLineToLog = false;
        let hasSubCmds = false;

        cmd.commands.forEach((sub, i) => {
            const args = sub.args?.map(a => `<${a}>`).join(" ");
            const desc = sub.description() ? sub.description() : "";
            console.log(`${newLineToLog ? "\n" : ""}${pad}${sub.name()} ${args.padEnd(31 - sub.name().length)} ${desc}`);

            if (sub.commands.length > 0) {
                newLineToLog = printIndentedHelp(sub, indent + 2);
                hasSubCmds = true;
            }
        })
        if (!hasSubCmds || hasSubCmds && !newLineToLog) newLineToLog = true;
        return newLineToLog
    }

    program
        .command("help-all")
        .description("Display help for all commands and sub-commands")
        .action(() => {
            console.log(`Suzaku CLI - version ${program.version()}`);
            console.log(program.description());
            console.log("Commands:\n");
            printIndentedHelp(program);
        });

    program.hook("preAction", (thisCommand, actionCommand) => {

        // logger.log(`Executing command: ${actionCommand.optsWithGlobals() }`);
        // logger.log(`Executing action: ${actionCommand}`);
        // logger.log(`With options: ${JSON.stringify(thisCommand.opts())}`);
        const opts = program.opts();
        // Block manually private key on mainnet
        if (opts.privateKey! && opts.network === "mainnet") {
            logger.error("Using private key on mainnet is not allowed. Use the secret keystore instead.");
            process.exit(1);
        }
        // Ensure privateKey is set if opts.secret is provided
        opts.privateKey! = opts.privateKey! || opts.secretName;

        // Activate json output if --json is provided
        logger.setJsonMode(opts.json);
    });

    program.parse(process.argv);
}

main()
