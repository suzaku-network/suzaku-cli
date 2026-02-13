#!/usr/bin/env node

import { Command, CommandUnknownOpts, Option } from '@commander-js/extra-typings';
import { Abi, formatUnits, fromBytes, getAbiItem, Hex, hexToBytes, parseUnits } from "viem";
import { registerL1, setL1MetadataUrl, setL1Middleware } from "./l1";
import { listOperators, registerOperator } from "./operator";
import { getConfig } from "./config";
import { Chains, generateClient } from "./client";
import { logger } from './lib/logger';
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
    middlewareGetOperatorUsedStake,
    middlewareGetAllOperators,
    getCollateralClassIds,
    getActiveCollateralClasses,
    middlewareGetNodeLogs,
    middlewareManualProcessNodeStakeCache,
    middlewareLastValidationId,
    weightWatcher
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
    ValidatorStatus,
    Validator
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
    isOperatorUptimeSetForEpoch
} from "./uptime";

import {
    distributeRewards,
    claimRewards,
    claimOperatorFee,
    claimCuratorFee,
    claimProtocolFee,
    claimUndistributedRewards,
    setRewardsAmountForEpochs,
    setRewardsBipsForCollateralClass,
    setMinRequiredUptime,
    setProtocolOwner,
    updateProtocolFee,
    updateOperatorFee,
    updateCuratorFee,
    updateAllFees,
    getEpochRewards,
    getOperatorShares,
    getVaultShares,
    getCuratorShares,
    getProtocolRewards,
    getDistributionBatch,
    getFeesConfiguration,
    getRewardsBipsForCollateralClass,
    getMinRequiredUptime,
    getLastEpochClaimedStaker,
    getLastEpochClaimedOperator,
    getLastEpochClaimedCurator,
    getRewardsClaimsCount,
} from "./rewards";
import { getERC20Events, requirePChainBallance } from "./lib/transferUtils";
import { encodeNodeID, getAddresses, NodeId, parseNodeID } from "./lib/utils";

import { buildCommands as buildKeyStoreCmds } from "./keyStore";
import { ArgAddress, ArgNodeID, ArgHex, ArgURI, ArgNumber, ArgBigInt, ArgBLSPOP, ArgCB58, ParserPrivateKey, ParserAddress, ParserAVAX, ParserNumber, ParserNodeID, parseSecretName, collectMultiple, ParseUnits, OptAddress, ParserHex } from "./lib/cliParser";
import { convertSubnetToL1, createChain, createSubnet, getCurrentValidators, increasePChainValidatorBalance } from './lib/pChainUtils';
import { A, pipe, R } from '@mobily/ts-belt';
import { completeValidatorRegistration, completeValidatorRemoval, completeWeightUpdate } from './securityModule';
import { updateStakingConfig, initiateValidatorRegistration, initiateDelegatorRegistration, initiateDelegatorRemoval, completeDelegatorRegistration as kiteCompleteDelegatorRegistration, completeDelegatorRemoval as kiteCompleteDelegatorRemoval, initiateValidatorRemoval, completeValidatorRegistration as kiteCompleteValidatorRegistration, completeValidatorRemoval as kiteCompleteValidatorRemoval } from './kiteStaking';
import { depositStakingVault, requestWithdrawalStakingVault, claimWithdrawalStakingVault, processEpochStakingVault, initiateValidatorRegistrationStakingVault, addOperatorStakingVault, completeValidatorRegistrationStakingVault, initiateValidatorRemovalStakingVault, completeValidatorRemovalStakingVault, initiateDelegatorRegistrationStakingVault, completeDelegatorRegistrationStakingVault, initiateDelegatorRemovalStakingVault, completeDelegatorRemovalStakingVault } from './stakingVault';
import { utils } from '@avalabs/avalanchejs';
import { hexToUint8Array } from './lib/justification';
import { installCompletion } from './lib/autoCompletion';
import { ensureRoleHex, getRoleAdmin, getRoles, grantRole, hasRole, isAccessControl, revokeRole } from './accessControl';
import { contractAbiValidation, SafeSuzakuContract, SuzakuABINames, setCastMode } from './lib/viemUtils';
import './lib/commandUtils';
import { execSync } from 'child_process';
import { chainList } from './lib/chainList';
import { readFileSync } from 'fs';
// import { Command } from '@commander-js/extra-typings';

async function getDefaultAccount(opts: any): Promise<Hex> {
    const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
    return client.account?.address as Hex;
}

// Main function to set up the CLI commands
async function main() {
    const program = new Command()
        .name('suzaku-cli')
        .addOption(new Option('-n, --network <network>')
            .choices(Object.keys(chainList) as Chains[])
            .default('mainnet'))
        .addOption(new Option('-k, --private-key <privateKey>', 'Private key in Hex format')
            .env('PK').argParser(ParserPrivateKey).conflicts(['secretName', 'ledger']))
        .addOption(new Option('-s, --secret-name <secretName>', 'The keystore secret name containing the private key')
            .conflicts(['privateKey', 'ledger'])
            .argParser(parseSecretName))
        .addOption(new Option('-l, --ledger', 'Use Ledger hardware wallet for signing').conflicts(['privateKey', 'secretName']))
        .addOption(new Option('-w, --wait <confirmations>', 'Number of confirmations to wait after a write transaction')
            .default(2)
            .argParser(ParserNumber))
        .addOption(new Option("--json", "Output logs in JSON format"))
        .addOption(new Option('-y, --yes', 'Automatic yes to prompts'))
        .addOption(OptAddress('--safe <address>', 'Use safe smart account for transactions'))
        .addOption(new Option('--skip-abi-validation', 'Skip the ABI validation for used contract'))
        .addOption(new Option('--cast', 'Output equivalent Foundry cast commands instead of executing write transactions').conflicts(['safe']))
        .version('0.1.0');

    // Set cast mode globally before any command runs
    program.hook('preAction', () => {
        const opts = program.opts();
        if (opts.cast) setCastMode(true);
    });

    program
        .command('verify-abi')
        .description('Verify that a contract at a given address matches the expected Suzaku ABI (5% tolerance)')
        .addArgument(ArgAddress("address", "Contract address to test"))
        .argument('abi', 'ABI name to test')
        .action(async (address, abi) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            await config.contracts[abi as SuzakuABINames](address)
            logger.log(`Verified ABI for contract ${abi} at address ${address} ✅`);
        });

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
        .action(async (subnetID, targetBalance, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const targetBalanceWei = parseUnits(targetBalance, 9); // AVAX has 9 decimals
            if (targetBalanceWei <= BigInt(1e7)) { // 0.01 AVAX min
                throw new Error("Target balance must be greater than 0.01 AVAX");
            }
            const validators = await getCurrentValidators(client, subnetID)

            const validatorsToTopUp = validators.reduce((acc, validator) => {
                if (options.nodeId && options.nodeId.length > 0 && !options.nodeId.includes(validator.nodeID as NodeId)) {
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
            await requirePChainBallance(client, totalTopUp + BigInt(2e4) * BigInt(validatorsToTopUp.length), opts.yes); // extra 20000 for fees
            if (!opts.yes) {
                const response = await logger.prompt(`Proceed with topping up validators? (y/n): `);
                if (response.toLowerCase() !== 'y') {
                    logger.log("Operation cancelled by user.");
                    process.exit(0);
                }
            }

            for (const { validationId, topup } of validatorsToTopUp) {
                logger.log(`\nTopping up validator ${validationId}`);
                const amount = Number(topup) / 1e9
                pipe(await increasePChainValidatorBalance(
                    client,
                    amount,
                    validationId,
                    false
                ),
                    R.tapError(err => { logger.error(err); process.exit(1) }),)
            }
            logger.log("\nCompleted top-up of validators.");
            logger.addData('total_amount', totalTopUp)
            logger.addData('validators', validatorsToTopUp)
        });

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
        .action(async (balancerAddress, l1Middleware, metadataUrl) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);

            // instantiate L1Registry and call
            const l1Registry = await config.contracts.L1Registry(config.l1Registry);
            await registerL1(
                l1Registry,
                balancerAddress,
                l1Middleware,
                metadataUrl,
                client.account!
            );
        });

    l1RegistryCmd
        .command("get-all")
        .description("List all L1s registered in the L1 registry")
        .action(async () => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const l1Registry = await config.contracts.L1Registry(config.l1Registry)
            const l1s = await l1Registry.read.getAllL1s()
            // l1s: [balancerAddress[], middleware[], metadataUrl[]]
            const data: { MetadataUrl: string; Balancer: string; Middleware: string }[] = [];
            for (let i = 0; i < l1s[0].length; i++) {
                data.push({
                    MetadataUrl: l1s[2][i],
                    Balancer: l1s[0][i],
                    Middleware: l1s[1][i],
                })
            }
            logger.logJsonTree(data)
        });

    l1RegistryCmd
        .command("set-metadata-url")
        .description("Set metadata URL for an L1 in the L1 registry")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgURI("metadataUrl", "New metadata URL"))
        .action(async (l1Address, metadataUrl) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const l1Reg = await config.contracts.L1Registry(config.l1Registry);
            await setL1MetadataUrl(
                l1Reg,
                l1Address,
                metadataUrl
            );
        });

    l1RegistryCmd
        .command("set-middleware")
        .description("Set middleware address for an L1 in the L1 registry")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgAddress("l1Middleware", "New L1 middleware address"))
        .action(async (l1Address, l1Middleware) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const l1Reg2 = await config.contracts.L1Registry(config.l1Registry);
            await setL1Middleware(
                l1Reg2,
                l1Address,
                l1Middleware
            );
        });
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
        .action(async (metadataUrl) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const opReg = await config.contracts.OperatorRegistry(config.operatorRegistry);
            await registerOperator(
                opReg,
                metadataUrl
            );
        });

    operatorRegistryCmd
        .command("get-all")
        .description("List all operators registered in the operator registry")
        .action(async () => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const opReg2 = await config.contracts.OperatorRegistry(config.operatorRegistry);
            await listOperators(opReg2);
        });

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
        .action(async (middlewareVaultManagerAddress, vaultAddress, collateralClass, maxLimit) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            // instantiate VaultManager contract
            const vaultManager = await config.contracts.VaultManager(middlewareVaultManagerAddress);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const maxLimitWei = parseUnits(maxLimit, await vault.read.decimals())
            await registerVaultL1(
                vaultManager,
                vaultAddress,
                collateralClass,
                maxLimitWei,
                client.account!
            );
        });

    vaultManagerCmd
        .command("update-vault-max-l1-limit")
        .description("Update the maximum L1 limit for a vault")
        .addArgument(ArgAddress("middlewareVaultManagerAddress", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .argument("maxLimit", "Maximum limit")
        .action(async (middlewareVaultManagerAddress, vaultAddress, collateralClass, maxLimit) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vaultManager = await config.contracts.VaultManager(middlewareVaultManagerAddress);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const maxLimitWei = parseUnits(maxLimit, await vault.read.decimals())
            await updateVaultMaxL1Limit(
                vaultManager,
                vaultAddress,
                collateralClass,
                maxLimitWei,
                client.account!
            );
        });

    vaultManagerCmd
        .command("remove-vault")
        .description("Remove a vault from L1 staking")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (middlewareVaultManager, vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vaultManager = await config.contracts.VaultManager(middlewareVaultManager);
            await removeVault(
                vaultManager,
                vaultAddress,
                client.account!
            );
        });

    vaultManagerCmd
        .command("get-vault-count")
        .description("Get the number of vaults registered for L1 staking")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .action(async (middlewareVaultManager) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vaultManager = await config.contracts.VaultManager(middlewareVaultManager);
            await getVaultCount(vaultManager);
        });

    vaultManagerCmd
        .command("get-vault-at-with-times")
        .description("Get the vault address at a specific index along with its registration and removal times")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgBigInt("index", "Vault index"))
        .action(async (middlewareVaultManager, index) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vaultManager = await config.contracts.VaultManager(middlewareVaultManager);
            await getVaultAtWithTimes(
                vaultManager,
                index
            );
        });

    vaultManagerCmd
        .command("get-vault-collateral-class")
        .description("Get the collateral class ID associated with a vault")
        .addArgument(ArgAddress("middlewareVaultManager", "Middleware vault manager address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (middlewareVaultManager, vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vaultManager = await config.contracts.VaultManager(middlewareVaultManager);
            await getVaultCollateralClass(
                vaultManager,
                vaultAddress
            );
        });

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
        .action(async (vaultAddress, amount, options) => {
            const onBehalfOf = options.onBehalfOf ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            await depositVault(
                client,
                config,
                vaultAddress,
                onBehalfOf,
                amount,
                client.account!
            );
        });

    vaultCmd
        .command("withdraw")
        .description("Withdraw tokens from the vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .argument("amount", "Amount of token to withdraw in the vault")
        .addOption(new Option("--claimer <claimer>", "Optional claimer").argParser(ParserAddress))
        .action(async (vaultAddress, amount, options) => {
            const claimer = options.claimer ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const amountWei = parseUnits(amount, await vault.read.decimals())
            await withdrawVault(
                vault,
                claimer,
                amountWei
            );
        });

    vaultCmd
        .command("claim")
        .description("Claim withdrawn tokens from the vault for a specific epoch")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient").argParser(ParserAddress))
        .action(async (vaultAddress, epoch, options) => {
            const recipient = options.recipient ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await claimVault(
                vault,
                recipient,
                epoch
            );
        });

    vaultCmd
        .command("grant-staker-role")
        .description("Grant staker role on a vault to an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("account", "Account to grant the role to"))
        .action(async (vaultAddress, account) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await vault.safeWrite.grantRole([await vault.read.DEPOSITOR_WHITELIST_ROLE(), account],
                {
                    chain: null,
                    account: client.account!,
                })
            logger.log(`Granted staker role to ${account} on vault (${await vault.read.name()}) ${vaultAddress}`);
        });

    vaultCmd
        .command("revoke-staker-role")
        .description("Revoke staker role on a vault from an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("account", "Account to revoke the role from"))
        .action(async (vaultAddress, account) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await vault.safeWrite.revokeRole([await vault.read.DEPOSITOR_WHITELIST_ROLE(), account],
                {
                    chain: null,
                    account: client.account!,
                })
            logger.log(`Revoked staker role from ${account} on vault (${await vault.read.name()}) ${vaultAddress}`);
        });

    vaultCmd
        .command("collateral-deposit")
        .description("Approve and deposit tokens into the collateral contract associated with a vault")
        .addArgument(ArgAddress("collateralAddress", "Collateral contract address"))
        .argument("amount", "Amount of token to deposit in the collateral")
        .action(async (collateralAddress, amount) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true); // skip abi validation as erc20 are commonly different
            await approveAndDepositCollateral(
                client,
                config,
                collateralAddress,
                amount,
            );

        });

    // setIsDepositLimit
    vaultCmd
        .command("set-deposit-limit")
        .description("Set deposit limit for a vault (0 will disable the limit)")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .argument("limit", "Deposit limit amount")
        .action(async (vaultAddress, limit) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const limitWei = parseUnits(limit, await vault.read.decimals())
            const isLimitShouldBeEnabled = limitWei > 0n;
            const isLimitEnabled = await vault.read.isDepositLimit();
            if (isLimitShouldBeEnabled !== isLimitEnabled) {
                await vault.safeWrite.setIsDepositLimit([isLimitShouldBeEnabled],
                    {
                        chain: null,
                        account: client.account!,
                    })
                logger.log(`Set deposit limit enabled to ${isLimitShouldBeEnabled} for vault (${await vault.read.name()}) ${vaultAddress}`);
            }
            await vault.safeWrite.setDepositLimit([limitWei],
                {
                    chain: null,
                    account: client.account!,
                })
            logger.log(`Set deposit limit to ${limit} for vault (${await vault.read.name()}) ${vaultAddress}`);
        });

    // increaseLimit of the collateral
    vaultCmd
        .command("collateral-increase-limit")
        .description("Set deposit limit for a collateral")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .argument("limit", "Deposit limit amount")
        .action(async (vaultAddress, limit) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);

            const collateralAddress = await vault.read.collateral();
            const collateral = await config.contracts.DefaultCollateral(collateralAddress);
            const limitWei = parseUnits(limit, await collateral.read.decimals())
            await collateral.safeWrite.increaseLimit([limitWei],
                {
                    chain: null,
                    account: client.account!,
                })
            logger.log(`Collateral (${collateralAddress}) limit increased to ${limit} (${await collateral.read.name()})`);
        });

    /* --------------------------------------------------
    * VAULT READ COMMANDS
    * -------------------------------------------------- */
    vaultCmd
        .command("get-collateral")
        .description("Get the collateral token address of a vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await getVaultCollateral(vault);
        });

    vaultCmd
        .command("get-delegator")
        .description("Get the delegator address of a vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const delegator = await getVaultDelegator(vault);
            logger.log("Vault delegator:", delegator);
        });

    vaultCmd
        .command("get-balance")
        .description("Get vault token balance for an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addOption(new Option("--account <account>", "Account to check balance for").argParser(ParserAddress))
        .action(async (vaultAddress, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await getVaultBalanceOf(vault, account);
        });

    vaultCmd
        .command("get-active-balance")
        .description("Get active vault balance for an account")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addOption(new Option("--account <account>", "Account to check balance for").argParser(ParserAddress))
        .action(async (vaultAddress, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await getVaultActiveBalanceOf(vault, account);
        });

    vaultCmd
        .command("get-total-supply")
        .description("Get total supply of vault tokens")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await getVaultTotalSupply(vault);
        });

    vaultCmd
        .command("get-withdrawal-shares")
        .description("Get withdrawal shares for an account at a specific epoch")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--account <account>", "Account to check").argParser(ParserAddress))
        .action(async (vaultAddress, epoch, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await getVaultWithdrawalSharesOf(vault, epoch, account);
        });

    vaultCmd
        .command("get-withdrawals")
        .description("Get withdrawal amount for an account at a specific epoch")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgBigInt("epoch", "Epoch number"))
        .addOption(new Option("--account <account>", "Account to check").argParser(ParserAddress))
        .action(async (vaultAddress, epoch, options) => {
            const account = options.account ?? (await getDefaultAccount(program.opts()));
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            await getVaultWithdrawalsOf(vault, epoch, account);
        });

    // Get deposit limit
    vaultCmd
        .command("get-deposit-limit")
        .description("Get deposit limit for a vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const limit = await vault.read.depositLimit();
            const isLimitEnabled = await vault.read.isDepositLimit();
            logger.log(`Deposit limit for vault ${vaultAddress}: ${formatUnits(limit, await vault.read.decimals())} (enabled: ${isLimitEnabled})`);
        });

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
        .action(async (vaultAddress, l1Address, limit, collateralClass) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const delegatorAddress = await vault.read.delegator();

            // instantiate L1RestakeDelegator contract
            const delegator = await config.contracts.L1RestakeDelegator(delegatorAddress);
            const limitWei = parseUnits(limit, await vault.read.decimals())
            await setL1Limit(
                delegator,
                l1Address,
                collateralClass,
                limitWei
            );
        });

    vaultCmd
        .command("set-operator-l1-shares")
        .description("Set the L1 shares for an operator in a delegator")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgAddress("operatorAddress", "Operator address"))
        .addArgument(ArgBigInt("shares", "Shares amount"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (vaultAddress, l1Address, operatorAddress, shares, collateralClass) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            // instantiate L1RestakeDelegator contract

            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const delegatorAddress = await vault.read.delegator();
            const delegator = await config.contracts.L1RestakeDelegator(delegatorAddress);
            await setOperatorL1Shares(
                delegator,
                l1Address,
                collateralClass,
                operatorAddress,
                shares
            );
        });

    vaultCmd
        .command("get-l1-limit")
        .description("Get L1 limit for a vault's delegator")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (vaultAddress, l1Address, collateralClass) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const delegatorAddress = await vault.read.delegator();

            // instantiate L1RestakeDelegator contract
            const delegator = await config.contracts.L1RestakeDelegator(delegatorAddress);
            const limit = await delegator.read.l1Limit([l1Address, collateralClass]);
            logger.log(`L1 limit for vault ${vaultAddress} on L1 ${l1Address} (collateral class ${collateralClass}): ${formatUnits(limit, await vault.read.decimals())}`);
        });

    vaultCmd
        .command("get-operator-l1-shares")
        .description("Get L1 shares for an operator in a vault's delegator")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .addArgument(ArgAddress("operatorAddress", "Operator address"))
        .action(async (vaultAddress, l1Address, collateralClass, operatorAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const vault = await config.contracts.VaultTokenized(vaultAddress);
            const delegatorAddress = await vault.read.delegator();

            // instantiate L1RestakeDelegator contract
            const delegator = await config.contracts.L1RestakeDelegator(delegatorAddress);
            const shares = await delegator.read.operatorL1Shares([l1Address, collateralClass, operatorAddress]);
            logger.log(`L1 shares for operator ${operatorAddress} in vault ${vaultAddress} on L1 ${l1Address} (collateral class ${collateralClass}): ${shares}`);
        });
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
        .action(async (middlewareAddress, collateralClassId, minValidatorStake, maxValidatorStake, initialCollateral) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const collateral = await config.contracts.DefaultCollateral(initialCollateral);
            const decimals = await collateral.read.decimals();
            const minStakeWei = parseUnits(minValidatorStake, decimals);
            const maxStakeWei = parseUnits(maxValidatorStake, decimals);
            await middlewareSvc.safeWrite.addCollateralClass([collateralClassId, minStakeWei, maxStakeWei, initialCollateral],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Added collateral class ${collateralClassId} with min stake ${minValidatorStake} and max stake ${maxValidatorStake} using collateral at ${initialCollateral}`);
        });

    // Add collateral to class
    middlewareCmd
        .command("add-collateral-to-class")
        .description("Add a new collateral address to an existing collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .addArgument(ArgAddress("collateralAddress", "Collateral address to add"))
        .action(async (middlewareAddress, collateralClassId, collateralAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareSvc.safeWrite.addAssetToClass([collateralClassId, collateralAddress],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Added collateral ${collateralAddress} to class ${collateralClassId}`);
        });

    // removeAssetFromClass
    middlewareCmd
        .command("remove-collateral-from-class")
        .description("Remove a collateral address from an existing collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .addArgument(ArgAddress("collateralAddress", "Collateral address to remove"))
        .action(async (middlewareAddress, collateralClassId, collateralAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const tx = await middlewareSvc.safeWrite.removeAssetFromClass([collateralClassId, collateralAddress],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Removed collateral ${collateralAddress} from class ${collateralClassId}`);
            logger.log("tx hash:", tx);
        });

    // removeCollateralClass
    middlewareCmd
        .command("remove-collateral-class")
        .description("Remove an existing secondary collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .action(async (middlewareAddress, collateralClassId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareSvc.safeWrite.removeCollateralClass([collateralClassId],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Removed collateral class ${collateralClassId}`);
        });

    // activateSecondaryCollateralClass
    middlewareCmd
        .command("activate-collateral-class")
        .description("Activate a secondary collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .action(async (middlewareAddress, collateralClassId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareSvc.safeWrite.activateSecondaryCollateralClass([collateralClassId],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Activated collateral class ${collateralClassId}`);
        });

    // deactivateSecondaryCollateralClass
    middlewareCmd
        .command("deactivate-collateral-class")
        .description("Deactivate a secondary collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgBigInt("collateralClassId", "Collateral class ID"))
        .action(async (middlewareAddress, collateralClassId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareSvc.safeWrite.deactivateSecondaryCollateralClass([collateralClassId],
                {
                    chain: null,
                    account: client.account!,
                });
            logger.log(`Deactivated collateral class ${collateralClassId}`);
        });

    // Register operator
    middlewareCmd
        .command("register-operator")
        .description("Register an operator to operate on this L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareRegisterOperator(
                middlewareSvc,
                operator
            );
        });

    // Disable operator
    middlewareCmd
        .command("disable-operator")
        .description("Disable an operator to prevent it from operating on this L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareDisableOperator(
                middlewareSvc,
                operator
            );
        });

    // Remove operator
    middlewareCmd
        .command("remove-operator")
        .description("Remove an operator from this L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareRemoveOperator(
                middlewareSvc,
                operator
            );
        });

    // Process node stake cache
    middlewareCmd
        .command("process-node-stake-cache")
        .description("Manually process node stake cache for one or more epochs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addOption(new Option("--epochs <epochs>", "Number of epochs to process (default: all)").default(0).argParser(ParserNumber))
        .addOption(new Option("--loop-epochs <count>", "Loop through multiple epochs, processing --epochs at a time").argParser(ParserNumber))
        .addOption(new Option("--delay <milliseconds>", "Delay between loop iterations in milliseconds (default: 1000)").default(1000).argParser(ParserNumber))
        .action(async (middlewareAddress, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);

            let epochsPerCall;
            let loopCount;
            if (options.epochs || options.loopEpochs) { // Fully specified by user
                epochsPerCall = options.epochs || 1;
                loopCount = options.loopEpochs || 1;
            } else { // Automatic calculation
                epochsPerCall = await middlewareSvc.read.getCurrentEpoch() - await middlewareSvc.read.lastGlobalNodeStakeUpdateEpoch();
                loopCount = epochsPerCall > 50 ? Math.ceil(epochsPerCall / 50) : 1; // Limit number of epochs processed in a single call to avoid gas issues
                epochsPerCall = Math.ceil(epochsPerCall / loopCount);
            }

            logger.log(`Processing node stake cache: ${loopCount} iterations of ${epochsPerCall} epoch(s) each`);

            for (let i = 0; i < loopCount; i++) {
                logger.log(`\nIteration ${i + 1}/${loopCount}`);
                await middlewareManualProcessNodeStakeCache(
                    middlewareSvc,
                    epochsPerCall
                );

                if (i < loopCount - 1 && options.delay > 0) {
                    logger.log(`Waiting ${options.delay}ms before next iteration...`);
                    await new Promise(resolve => setTimeout(resolve, options.delay));
                }
            }

            logger.log(`\nCompleted processing ${loopCount * epochsPerCall} total epochs`);
        });

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
        .action(async (middlewareAddress, nodeId, blsKey, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex');

            // Default registration expiry to now + 12 hours if not provided
            // const registrationExpiry = options.registrationExpiry
            //     ? BigInt(options.registrationExpiry)
            //     : BigInt(Math.floor(Date.now() / 1000) + 12 * 60 * 60); // current time + 12 hours in seconds

            // Build remainingBalanceOwner and disableOwner PChainOwner structs
            // If pchainRemainingBalanceOwnerAddress or pchainDisableOwnerAddress are empty (not provided), use the client account
            const remainingBalanceOwnerAddress = options.pchainRemainingBalanceOwnerAddress.length > 0 ? options.pchainRemainingBalanceOwnerAddress : [defaultOwnerAddress];
            const disableOwnerAddress = options.pchainDisableOwnerAddress.length > 0 ? options.pchainDisableOwnerAddress : [defaultOwnerAddress];
            const remainingBalanceOwner: [number, Hex[]] = [
                Number(options.pchainRemainingBalanceOwnerThreshold),
                remainingBalanceOwnerAddress
            ];
            const disableOwner: [number, Hex[]] = [
                Number(options.pchainDisableOwnerThreshold),
                disableOwnerAddress
            ];

            const primaryCollateralAddress = await middlewareSvc.read.PRIMARY_ASSET();
            const primaryCollateral = await config.contracts.DefaultCollateral(primaryCollateralAddress);
            const initialStakeWei = parseUnits(options.initialStake.toString(), await primaryCollateral.read.decimals());


            // Call middlewareAddNode
            await middlewareAddNode(
                middlewareSvc,
                nodeId,
                blsKey,
                remainingBalanceOwner,
                disableOwner,
                initialStakeWei
            );
        });

    // Complete validator registration
    middlewareCmd
        .command("complete-validator-registration")
        .description("Complete validator registration on the P-Chain and on the middleware after adding a node")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("addNodeTxHash", "Add node transaction hash"))
        .addArgument(ArgBLSPOP())
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01'))// In decimals
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .action(async (middlewareAddress, addNodeTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }
            const initialBalance = ParseUnits(options.initialBalance, 9, 'Invalid initial balance')
            const client = await generateClient(opts.network, options.pchainTxPrivateKey, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const balancerSvc = await config.contracts.BalancerValidatorManager(await middlewareSvc.read.balancerValidatorManager());

            // Check if P-Chain address have 0.1 AVAX for tx fees but some times it can be less than 0.000050000 AVAX (perhaps when the validator was removed recently)
            // await requirePChainBallance(client, BigInt(Math.round((50000 + Number(initialBalance)))), opts.yes);

            // Call middlewareCompleteValidatorRegistration (no safe for pChain txs)
            await completeValidatorRegistration(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                middlewareSvc,
                balancerSvc,
                config,
                blsProofOfPossession,
                addNodeTxHash,
                initialBalance,
                !options.skipWaitApi
            );
        });

    // Remove node
    middlewareCmd
        .command("remove-node")
        .description("Remove a node from an L1")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .action(async (middlewareAddress, nodeId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareRemoveNode(
                middlewareSvc,
                nodeId
            );
        });

    // Complete validator removal
    middlewareCmd
        .command("complete-validator-removal")
        .description("Complete validator removal on the P-Chain and on the middleware after removing a node")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("removeNodeTxHash", "Remove node transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .addOption(new Option("--add-node-tx <addNodeTx>", "Add node transaction hash").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
        .action(async (middlewareAddress, removeNodeTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);

            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const balancerSvc = await config.contracts.BalancerValidatorManager(await middlewareSvc.read.balancerValidatorManager());
            // Check if P-Chain address have 0.01 AVAX for tx fees but some times it can be less than 0.000050000 AVAX (perhaps when the validator was added recently)
            await requirePChainBallance(client, 50000n, opts.yes);

            await completeValidatorRemoval(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                middlewareSvc,
                balancerSvc,
                config,
                removeNodeTxHash,
                !options.skipWaitApi,
                options.nodeId.length > 0 ? options.nodeId : undefined,
                options.addNodeTx.length > 0 ? options.addNodeTx : undefined,
            );
        });

    // Init stake update
    middlewareCmd
        .command("init-stake-update")
        .description("Initialize validator stake update and lock")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNodeID())
        .argument("newStake", "New stake amount")
        .action(async (middlewareAddress, nodeId, newStake) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const primaryCollateral = await middlewareSvc.read.PRIMARY_ASSET();
            const collateral = await config.contracts.DefaultCollateral(primaryCollateral);
            const decimals = await collateral.read.decimals();
            const newStakeWei = parseUnits(newStake, decimals);
            await middlewareInitStakeUpdate(
                middlewareSvc,
                nodeId,
                newStakeWei
            );
        });

    // Complete stake update
    middlewareCmd
        .command("complete-stake-update")
        .description("Complete validator stake update of all or specified node IDs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validatorStakeUpdateTxHash", "Validator stake update transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .action(async (middlewareAddress, validatorStakeUpdateTxHash, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }

            const client = await generateClient(opts.network, options.pchainTxPrivateKey, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);

            // Check if P-Chain address have 0.000050000 AVAX for tx fees
            await requirePChainBallance(client, 50000n, opts.yes);

            await completeWeightUpdate(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                middlewareSvc,
                config,
                validatorStakeUpdateTxHash,
                options.nodeId.length > 0 ? options.nodeId : undefined,
            );
        });

    // Operator cache / calcAndCacheStakes
    middlewareCmd
        .command("calc-operator-cache")
        .description("Calculate and cache stakes for operators")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (middlewareAddress, epoch, collateralClass) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            logger.log("Calculating and caching stakes...");

            if (!client.account) {
                throw new Error('Client account is required');
            }
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const hash = await middlewareSvc.safeWrite.calcAndCacheStakes([epoch, collateralClass],
                {
                    chain: null,
                    account: client.account,
                });
            logger.log("calcAndCacheStakes done, tx hash:", hash);

        });

    // calcAndCacheNodeStakeForAllOperators
    middlewareCmd
        .command("calc-node-stakes")
        .description("Calculate and cache node stakes for all operators")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareCalcNodeStakes(
                middlewareSvc
            );
        });

    // forceUpdateNodes
    middlewareCmd
        .command("force-update-nodes")
        .description("Force update operator nodes with stake limit")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addOption(new Option("--limit-stake <stake>", "Stake limit").default(0n).argParser(ParserAVAX))
        .action(async (middlewareAddress, operator, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareForceUpdateNodes(
                middlewareSvc,
                operator,
                options.limitStake
            );
        });

    // topUpAllOperatorNodes
    middlewareCmd
        .command("top-up-operator-validators")
        .description("Top up all operator validators to meet a target continuous fee balance")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .argument("targetBalance", "Target continuous fee balance per validator (in AVAX)")
        .action(async (middlewareAddress, operator, targetBalance) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const targetBalanceWei = parseUnits(targetBalance, 9); // AVAX has 9 decimals
            if (targetBalanceWei <= BigInt(1e7)) { // 0.01 AVAX min
                throw new Error("Target balance must be greater than 0.01 AVAX");
            }
            const balancerAddress = await middlewareSvc.read.BALANCER()
            const balancer = await config.contracts.BalancerValidatorManager(balancerAddress);
            const [nodeCount, subnetID] = await Promise.all([middlewareSvc.read.getOperatorNodesLength([operator]), balancer.read.subnetID()]);
            const validators = await getCurrentValidators(client, utils.base58check.encode(hexToUint8Array(subnetID)))

            const validatorsToCheck = await Promise.all(
                A.range(0, Number(nodeCount) - 1)
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
            await requirePChainBallance(client, totalTopUp + BigInt(2e4) * nodeCount, opts.yes); // extra 20000 for fees
            if (!opts.yes) {
                const response = await logger.prompt(`Proceed with topping up validators? (y/n): `);
                if (response.toLowerCase() !== 'y') {
                    logger.log("Operation cancelled by user.");
                    process.exit(0);
                }
            }

            for (const { validationId, topup } of validatorsToTopUp) {
                logger.log(`\nTopping up validator ${validationId}`);
                const amount = Number(topup) / 1e9
                pipe(await increasePChainValidatorBalance(
                    client,
                    amount,
                    validationId,
                    false
                ),
                    R.tapError(err => { logger.error(err); process.exit(1) }),)
            }
            logger.log("\nCompleted top-up of operator validators.");
            logger.addData('total_amount', totalTopUp)
            logger.addData('validators', validatorsToTopUp)
        });

    // getOperatorStake (read)
    middlewareCmd
        .command("get-operator-stake")
        .description("Get operator stake for a specific epoch and collateral class")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (middlewareAddress, operator, epoch, collateralClass) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorStake(
                middlewareSvc,
                operator,
                epoch,
                collateralClass
            );
        });

    middlewareCmd
        .command("get-operator-nodes")
        .description("Get operator nodes")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const nodeCount = await middlewareSvc.read.getOperatorNodesLength([operator]);
            const abi = [getAbiItem({ abi: middlewareSvc.abi, name: 'operatorNodesArray' })] as Abi

            const multicallResult = await client.multicall(
                {
                    contracts: A.range(0, Number(nodeCount) - 1).map(i => { return { args: [operator, BigInt(i)], abi, address: middlewareAddress, functionName: 'operatorNodesArray' } })
                }
            )

            const nodes = multicallResult.map((node) => node.error ? "error" : encodeNodeID(node.result as Hex))

            logger.log(nodes)
            logger.addData('nodes', nodes)
        });


    // getCurrentEpoch (read)
    middlewareCmd
        .command("get-current-epoch")
        .description("Get current epoch number")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetCurrentEpoch(
                middlewareSvc
            );
        });

    // getEpochStartTs (read)
    middlewareCmd
        .command("get-epoch-start-ts")
        .description("Get epoch start timestamp")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (middlewareAddress, epoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetEpochStartTs(
                middlewareSvc,
                epoch
            );
        });

    // getActiveNodesForEpoch (read)
    middlewareCmd
        .command("get-active-nodes-for-epoch")
        .description("Get active nodes for an operator in a specific epoch")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (middlewareAddress, operator, epoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetActiveNodesForEpoch(
                middlewareSvc,
                operator,
                epoch
            );
        });

    // getOperatorNodesLength (read)
    middlewareCmd
        .command("get-operator-nodes-length")
        .description("Get current number of nodes for an operator")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorNodesLength(
                middlewareSvc,
                operator
            );
        });

    // getNodeStakeCache (read)
    middlewareCmd
        .command("get-node-stake-cache")
        .description("Get node stake cache for a specific epoch and validator")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .addArgument(ArgHex("validationId", "Validation ID"))
        .action(async (middlewareAddress, epoch, validationId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetNodeStakeCache(
                middlewareSvc,
                epoch,
                validationId
            );
        });

    // getOperatorLockedStake (read)
    middlewareCmd
        .command("get-operator-locked-stake")
        .description("Get operator locked stake")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorLockedStake(
                middlewareSvc,
                operator
            );
        });

    // nodePendingRemoval (read)
    middlewareCmd
        .command("node-pending-removal")
        .description("Check if node is pending removal")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validationId", "Validation ID"))
        .action(async (middlewareAddress, validationId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareNodePendingRemoval(
                middlewareSvc,
                validationId
            );
        });

    // getOperatorUsedStakeCached (read)
    middlewareCmd
        .command("get-operator-used-stake")
        .description("Get operator used stake from cache")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetOperatorUsedStake(
                middlewareSvc,
                operator
            );
        });

    // getOperatorAvailableStake (read)
    middlewareCmd
        .command("get-operator-available-stake")
        .description("Get operator available stake")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const availableStake = await middlewareSvc.read.getOperatorAvailableStake([operator]);
            logger.log(`Operator ${operator} available stake:\n${availableStake}`);
        });

    // getAllOperators (read)
    middlewareCmd
        .command("get-all-operators")
        .description("Get all operators registered")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetAllOperators(
                middlewareSvc
            );
        });

    // getCollateralClassIds (read)
    middlewareCmd
        .command("get-collateral-class-ids")
        .description("Get all collateral class IDs from the middleware")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await getCollateralClassIds(
                middlewareSvc
            );
        });

    // getActiveCollateralClasses (read)
    middlewareCmd
        .command("get-active-collateral-classes")
        .description("Get active collateral classes (primary and secondary)")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await getActiveCollateralClasses(
                middlewareSvc
            );
        });

    middlewareCmd
        .command("node-logs")
        .description("Get middleware node logs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addOption(new Option("--node-id <nodeId>", "Node ID to filter logs").default(undefined).argParser(ParserNodeID))
        .addOption(new Option('--snowscan-api-key <string>', "Snowscan API key").default(""))
        .action(async (middlewareAddress, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            logger.log(`nodeId: ${options.nodeId}`);
            const middleware = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareGetNodeLogs(
                client,
                middleware,
                config,
                options.nodeId,
                options.snowscanApiKey
            );
        });

    middlewareCmd
        .command("get-last-node-validation-id")
        .description("Set middleware log level")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgNodeID())
        .action(async (middlewareAddress, nodeId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const balancerAddress = await middlewareSvc.read.balancerValidatorManager();
            const balancerSvc = await config.contracts.BalancerValidatorManager(balancerAddress);
            logger.log(`Fetching last validation ID`);
            const validationId = await middlewareLastValidationId(
                client,
                middlewareSvc,
                balancerSvc,
                nodeId
            )
            logger.log(`Last validationID: ${validationId}`);
        });

    middlewareCmd
        .command("to-vault-epoch")
        .description("convert middleware epoch to a vault epoch")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgAddress("vaultAddress", "Vault address"))
        .addArgument(ArgNumber("middlewareEpoch", "Middleware epoch number"))
        .action(async (middlewareAddress, vaultAddress, middlewareEpoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const vaultSvc = await config.contracts.VaultTokenized(vaultAddress);
            const middlewareEpochTs = await middlewareSvc.read.getEpochStartTs([middlewareEpoch]);
            const vaultEpoch = await vaultSvc.read.epochAt([middlewareEpochTs]);
            logger.log(`Vault epoch at middleware epoch ${middlewareEpoch} (timestamp: ${middlewareEpochTs}) is ${vaultEpoch}`);
        });

    middlewareCmd
        .command("update-window-ends-ts")
        .description("Get the end timestamp of the last completed middleware epoch window")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .action(async (middlewareAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const [currentEpoch, updateWindow] = await middlewareSvc.multicall(['getCurrentEpoch', 'UPDATE_WINDOW'])
            const lastEpochStartTs = await middlewareSvc.read.getEpochStartTs([currentEpoch])
            logger.log(`Window ends at: ${lastEpochStartTs + updateWindow}`);
        });

    middlewareCmd
        .command("vault-to-middleware-epoch")
        .description("convert vault epoch to a middleware epoch")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgAddress("vaultAddress", "Vault address"))
        .addArgument(ArgNumber("vaultEpoch", "Vault epoch number"))
        .action(async (middlewareAddress, vaultAddress, vaultEpoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const vaultSvc = await config.contracts.VaultTokenized(vaultAddress);
            const vaultEpochStartTs = await vaultSvc.read.epochDuration() * vaultEpoch + await vaultSvc.read.epochDurationInit();
            const middlewareEpoch = await middlewareSvc.read.getEpochAtTs([vaultEpochStartTs]);
            logger.log(`Middleware epoch at vault epoch ${vaultEpoch} (timestamp: ${vaultEpochStartTs}) is ${middlewareEpoch}`);
        });

    middlewareCmd
        .command("set-vault-manager")
        .description("Set vault manager")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgAddress("vaultManagerAddress", "Vault manager address"))
        .action(async (middlewareAddress, vaultManagerAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            await middlewareSvc.safeWrite.setVaultManager([vaultManagerAddress])
            logger.log(`Set vault manager to ${vaultManagerAddress} on middleware ${middlewareAddress} ok`);
        });

    middlewareCmd
        .command("get-operator-validation-ids")
        .description("Get operator validation IDs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (middlewareAddress, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const validationIDs = await middlewareSvc.read.getOperatorValidationIDs([operator]);
            logger.log(`Validation IDs for operator ${operator}: ${validationIDs.join(', ')}`);
        });

    middlewareCmd
        .command("account-info")
        .description("Get account info")
        .addArgument(ArgAddress("middlewareAddress", "Middleware address"))
        .addArgument(ArgAddress("account", "Account address"))
        .action(async (middlewareAddress, account) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const middlewareSvc = await config.contracts.L1Middleware(middlewareAddress);
            const [owner, operators, epoch, balancerAddress] = await middlewareSvc.multicall(['owner', 'getAllOperators', 'getCurrentEpoch', 'BALANCER']);
            const roles = getRoles(middlewareSvc);
            const accessControl = await config.contracts.AccessControl(middlewareAddress);
            const hasRole = await accessControl.multicall(roles.map(role => { return { name: 'hasRole', args: [ensureRoleHex(role), account] } }));
            logger.log(`Account ${account} has the following rights: `);
            if (account === owner) {
                logger.log(`L1 owner`);
            }
            if (hasRole.some(role => role)) {
                logger.log(`Middleware roles: `);
                logger.log("  " + roles.filter((_, index) => hasRole[index]).join('\n  '));
            }
            if (operators.includes(account)) {
                const balancerSvc = await config.contracts.BalancerValidatorManager(balancerAddress);
                const [stake, validationIDs] = await middlewareSvc.multicall([
                    { name: 'getOperatorStake', args: [account, 1, BigInt(epoch)] },
                    { name: 'getOperatorValidationIDs', args: [account] }]);
                const validators = await balancerSvc.multicall(validationIDs.flatMap(id => { return [{ name: 'getValidator', args: [id] }, { name: 'isValidatorPendingWeightUpdate', args: [id] }] }));
                logger.log(`Operator with stake ${stake} and the following validators: `);
                const subnetIdHex = await balancerSvc.read.subnetID();
                const pChainValidators = await getCurrentValidators(client, utils.base58check.encode(hexToBytes(subnetIdHex)));
                const formated: { [key: string]: any } = {};
                for (let i = 0; i < validators.length; i += 2) {
                    const validator = validators[i] as Validator;
                    const pendingWeightUpdate = validators[i + 1];
                    const status = ValidatorStatusNames[validator.status == ValidatorStatus.Active && pendingWeightUpdate ? ValidatorStatus.PendingStakeUpdated : validator.status];
                    const pChainValidator = pChainValidators.find(v => v.nodeID === validator.nodeID);
                    formated[encodeNodeID(validator.nodeID)] = { NodeID: encodeNodeID(validator.nodeID), status, weight: validator.weight, ValidationId: validationIDs[i / 2], continuousAVAXBalance: parseUnits(pChainValidator?.balance?.toString() ?? '0', 9) }
                }
                logger.logJsonTree(formated);
            }
        });

    middlewareCmd
        .command('weight-watcher')
        .description('Watch for operators weight changes')
        .addArgument(ArgAddress('middlewareAddress', 'Middleware address'))
        .addOption(new Option('-e, --epochs <number>', 'Number of epochs to watch').argParser(Number))
        .addOption(new Option('-l, --loop-epochs <number>', 'Number of epochs to loop').argParser(Number))
        .action(async (middlewareAddress, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            await weightWatcher(await config.contracts.L1Middleware(middlewareAddress), config, { epochs: options.epochs, loopEpochs: options.loopEpochs });
        });
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
        .action(async (l1Address) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const service = await config.contracts.OperatorL1OptInService(config.opL1OptIn);
            await optInL1(
                service,
                l1Address
            );
        });

    operatorOptInCmd
        .command("l1-out")
        .description("Operator opts out from a given L1")
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .action(async (l1Address) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const service = await config.contracts.OperatorL1OptInService(config.opL1OptIn);
            await optOutL1(
                service,
                l1Address
            );
        });

    operatorOptInCmd
        .command("check-l1")
        .description("Check if an operator is opted in to a given L1")
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("l1Address", "L1 validator manager contract address"))
        .action(async (operator, l1Address) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const service = await config.contracts.OperatorL1OptInService(config.opL1OptIn);
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
    operatorOptInCmd
        .command("vault-in")
        .description("Operator opts in to a given Vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const service = await config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await optInVault(
                service,
                vaultAddress
            );
        });

    operatorOptInCmd
        .command("vault-out")
        .description("Operator opts out from a given Vault")
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const service = await config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await optOutVault(
                service,
                vaultAddress
            );
        });

    operatorOptInCmd
        .command("check-vault")
        .description("Check if an operator is opted in to a given Vault")
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("vaultAddress", "Vault contract address"))
        .action(async (operator, vaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const service = await config.contracts.OperatorVaultOptInService(config.opVaultOptIn);
            await checkOptInVault(
                service,
                operator,
                vaultAddress
            );
        });

    /**
     * --------------------------------------------------
     * Validator Manager
     * --------------------------------------------------
     */
    const validatorManagerCmd = program
        .command("vmc")
        .description("Commands to interact with ValidatorManager contracts");

    validatorManagerCmd
        .command("info")
        .description("Get summary informations of a ValidatorManager contract")
        .addArgument(ArgAddress("validatorManagerAddress", "Validator manager address"))
        .action(async (validatorManagerAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            // instantiate ValidatorManager contract
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);

            const results = await validatorManager.multicall([
                'getChurnTracker',
                'getChurnPeriodSeconds',
                'l1TotalWeight',
                'owner',
                'subnetID'
            ], { details: true });

            console.log(results.reduce((acc, r) => ({ ...acc, [r.name]: r.result }), {} as Record<string, unknown>));
        });

    validatorManagerCmd
        .command("transfer-ownership")
        .description("Transfer the ownership of a ValidatorManager contract")
        .addArgument(ArgAddress("validatorManagerAddress", "Validator manager address"))
        .addArgument(ArgAddress("owner", "Owner address"))
        .action(async (validatorManagerAddress, owner) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            // instantiate ValidatorManager contract
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);
            await validatorManager.safeWrite.transferOwnership([owner]);
        });

    validatorManagerCmd
        .command("complete-validator-removal")
        .description("Complete the removal of a validator that has been pending removal")
        .addArgument(ArgAddress("validatorManagerAddress", "Validator manager address"))
        .addArgument(ArgHex("removalTxId", "Removal transaction ID"))
        .action(async (validatorManagerAddress, removalTxId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            // instantiate ValidatorManager contract
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);

        });


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
        .action(async (balancerValidatorManagerAddress, middlewareAddress, maxWeight) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            // instantiate BalancerValidatorManager contract
            const balancer = await config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await setUpSecurityModule(
                balancer,
                middlewareAddress,
                maxWeight
            );
        });

    balancerCmd
        .command("get-security-modules")
        .description("Get all security modules")
        .addArgument(ArgAddress("balancerValidatorManagerAddress", "Balancer validator manager address"))
        .action(async (balancerValidatorManagerAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const balancer = await config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await getSecurityModules(
                balancer
            );
        });

    balancerCmd
        .command("get-security-module-weights")
        .description("Get security module weights")
        .addArgument(ArgAddress("balancerValidatorManagerAddress", "Balancer validator manager address"))
        .addArgument(ArgAddress("securityModule", "Security module address"))
        .action(async (balancerValidatorManagerAddress, securityModule) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const balancer = await config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            await getSecurityModuleWeights(
                balancer,
                securityModule
            );
        });

    balancerCmd
        .command("get-validator-status")
        .description("Get validator status by node ID")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgNodeID("nodeId", "Node ID"))
        .action(async (balancerAddress, nodeId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const balancer = await config.contracts.BalancerValidatorManager(balancerAddress);
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
        });

    balancerCmd
        .command("resend-validator-registration")
        .description("Resend validator registration transaction")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgNodeID("nodeId", "Node ID"))
        .action(async (balancerAddress, nodeId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const balancer = await config.contracts.BalancerValidatorManager(balancerAddress);
            const nodeIdHex32 = parseNodeID(nodeId, false)
            const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
            const hash = await balancer.safeWrite.resendRegisterValidatorMessage([validationId]);
            logger.log("resendValidatorRegistration executed successfully, tx hash:", hash);
        }
        );

    balancerCmd
        .command("resend-weight-update")
        .description("Resend validator weight update transaction")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgNodeID("nodeId", "Node ID"))
        .action(async (balancerAddress, nodeId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const balancer = await config.contracts.BalancerValidatorManager(balancerAddress);
            const nodeIdHex32 = parseNodeID(nodeId, false)
            const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
            const hash = await balancer.safeWrite.resendValidatorWeightUpdate([validationId]);
            logger.log("resendWeightUpdate executed successfully, tx hash:", hash);
        }
        );

    balancerCmd
        .command("resend-validator-removal")
        .description("Resend validator removal transaction")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgNodeID("nodeId", "Node ID"))
        .action(async (balancerAddress, nodeId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const balancer = await config.contracts.BalancerValidatorManager(balancerAddress);
            const nodeIdHex32 = parseNodeID(nodeId, false)
            const validationId = await balancer.read.getNodeValidationID([nodeIdHex32]);
            const hash = await balancer.safeWrite.resendValidatorRemovalMessage([validationId]);
            logger.log("resendValidatorRemoval executed successfully, tx hash:", hash);
        }
        );

    balancerCmd
        .command("transfer-l1-ownership")
        .description("Transfer Validator manager, balancer and its security modules ownership to a new owner")
        .addArgument(ArgAddress("balancerAddress", "Balancer contract address"))
        .addArgument(ArgAddress("newOwner", "New owner address"))
        .action(async (balancerAddress, newOwner) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const balancer = await config.contracts.BalancerValidatorManager(balancerAddress);
            const VMTx = await balancer.safeWrite.transferValidatorManagerOwnership([newOwner]);
            logger.log("transferValidatorManagerOwnership executed successfully, tx hash:", VMTx);
            const BTx = await balancer.safeWrite.transferOwnership([newOwner]);
            logger.log("transferOwnership of balancer executed successfully, tx hash:", BTx);
            const securityModules = await balancer.read.getSecurityModules();
            for (const smAddress of securityModules) {
                const smOwnable = await config.contracts.Ownable(smAddress);

                const SMTx = await smOwnable.safeWrite.transferOwnership([newOwner])
                logger.log(`transferOwnership of security module ${smAddress} executed successfully, tx hash:`, SMTx);
                const smAccessControl = await config.contracts.AccessControl(smAddress);
                const isAccessControl = await smAccessControl.read.supportsInterface(["0x7965db0b"])
                if (isAccessControl) {
                    const ROLETX = await smAccessControl.safeWrite.grantRole([await smAccessControl.read.DEFAULT_ADMIN_ROLE(), newOwner])
                    logger.log(`grantRole DEFAULT_ADMIN_ROLE to ${newOwner} on security module ${smAddress} executed successfully, tx hash:`, ROLETX);
                }

            }
        });
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
        .addArgument(ArgBigInt("initialWeight", "Initial weight of the validator"))
        .addOption(new Option("--registration-expiry <expiry>", "Expiry timestamp (default: now + 12 hours)"))
        .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .action(async (poaSecurityModule, nodeId, blsKey, initialWeight, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const poaSM = await config.contracts.PoASecurityModule(poaSecurityModule);
            const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex');

            // Default registration expiry to now + 12 hours if not provided
            // const registrationExpiry = options.registrationExpiry
            //     ? BigInt(options.registrationExpiry)
            //     : BigInt(Math.floor(Date.now() / 1000) + 12 * 60 * 60); // current time + 12 hours in seconds

            // Build remainingBalanceOwner and disableOwner PChainOwner structs
            // If pchainRemainingBalanceOwnerAddress or pchainDisableOwnerAddress are empty (not provided), use the client account
            const remainingBalanceOwnerAddress = options.pchainRemainingBalanceOwnerAddress.length > 0 ? options.pchainRemainingBalanceOwnerAddress : [defaultOwnerAddress];
            const disableOwnerAddress = options.pchainDisableOwnerAddress.length > 0 ? options.pchainDisableOwnerAddress : [defaultOwnerAddress];
            const remainingBalanceOwner: [number, Hex[]] = [
                Number(options.pchainRemainingBalanceOwnerThreshold),
                remainingBalanceOwnerAddress
            ];
            const disableOwner: [number, Hex[]] = [
                Number(options.pchainDisableOwnerThreshold),
                disableOwnerAddress
            ];

            const nodeIdHex32 = parseNodeID(nodeId, false)
            const hash = await poaSM.safeWrite.initiateValidatorRegistration([nodeIdHex32, blsKey, { threshold: remainingBalanceOwner[0], addresses: remainingBalanceOwner[1] }, { threshold: disableOwner[0], addresses: disableOwner[1] }, initialWeight]);
            logger.log("addNode executed successfully, tx hash:", hash);
        });

    poaCmd
        .command("complete-validator-registration")
        .description("Complete validator registration on the P-Chain and on the middleware after adding a node")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgHex("addNodeTxHash", "Add node transaction hash"))
        .addArgument(ArgBLSPOP())
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01'))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .action(async (poaSecurityModuleAddress, addNodeTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }

            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const poaSecurityModule = await config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            const balancerSvc = await config.contracts.BalancerValidatorManager(await poaSecurityModule.read.balancerValidatorManager());

            const initialBalance = ParseUnits(options.initialBalance, 9, 'Invalid initial balance')

            // Check if P-Chain address have 0.1 AVAX for tx fees but some times it can be less than 0.000050000 AVAX (perhaps when the validator was removed recently)
            await requirePChainBallance(client, BigInt(Math.round((50000 + Number(initialBalance)))), opts.yes);

            // Call middlewareCompleteValidatorRegistration
            await completeValidatorRegistration(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                poaSecurityModule,
                balancerSvc,
                config,
                blsProofOfPossession,
                addNodeTxHash,
                initialBalance,
                !options.skipWaitApi
            );
        });

    poaCmd
        .command("remove-node")
        .description("Initiate validator removal")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgNodeID())
        .action(async (poaSecurityModuleAddress, nodeID) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const poaSecurityModule = await config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            const balancerValidatorManagerAddress = await poaSecurityModule.read.balancerValidatorManager();
            const balancer = await config.contracts.BalancerValidatorManager(balancerValidatorManagerAddress);
            // Convert nodeID to Hex if necessary
            const nodeIdHex = parseNodeID(nodeID, false);
            logger.log(nodeIdHex)
            const validationId = await balancer.read.getNodeValidationID([nodeIdHex]);
            const txHash = await poaSecurityModule.safeWrite.initiateValidatorRemoval([validationId], {
                chain: null,
                account: client.account!,
            })
            logger.log(`End validation initialized for node ${nodeID}. Transaction hash: ${txHash}`);

        });

    poaCmd
        .command("complete-validator-removal")
        .description("Complete validator removal in the P-Chain and in the POA Security Module")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgHex("removeNodeTxHash", "Remove node transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .addOption(new Option("--add-node-tx <addNodeTx>", "Add node transaction hash").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
        .action(async (poaSecurityModuleAddress, removeNodeTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const poaSecurityModule = await config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            const balancerSvc = await config.contracts.BalancerValidatorManager(await poaSecurityModule.read.balancerValidatorManager());
            // Check if P-Chain address have 0.000050000 AVAX for tx fees
            await requirePChainBallance(client, 50000n, opts.yes);

            const txHash = await completeValidatorRemoval(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                poaSecurityModule,
                balancerSvc,
                config,
                removeNodeTxHash,
                !options.skipWaitApi,
                options.nodeId.length > 0 ? options.nodeId : undefined,
                options.addNodeTx.length > 0 ? options.addNodeTx : undefined,
            );

            logger.log(`End validation initialized for node . Transaction hash: ${txHash}`);
        });

    poaCmd
        .command("init-weight-update")
        .description("Update validator weight")
        .addArgument(ArgAddress("poaSecurityModuleAddress", "POA Security Module address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgBigInt("newWeight", "New weight"))
        .action(async (poaSecurityModuleAddress, nodeId, newWeight) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const poaSecurityModule = await config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            logger.log("Calling function initializeValidatorStakeUpdate...");

            // Parse NodeID to bytes32 format
            const nodeIdHex32 = parseNodeID(nodeId)

            const hash = await poaSecurityModule.safeWrite.initiateValidatorWeightUpdate([nodeIdHex32, newWeight]);
            logger.log("initiateValidatorWeightUpdate executed successfully, tx hash:", hash);
        });

    poaCmd
        .command("complete-weight-update")
        .description("Complete validator weight update of all or specified node IDs")
        .addArgument(ArgAddress("middlewareAddress", "Middleware contract address"))
        .addArgument(ArgHex("validatorStakeUpdateTxHash", "Validator stake update transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .action(async (poaSecurityModuleAddress, weightUpdateTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const poaSecurityModule = await config.contracts.PoASecurityModule(poaSecurityModuleAddress);
            // Check if P-Chain address have 0.000050000 AVAX for tx fees
            await requirePChainBallance(client, 50000n, opts.yes);

            const txHash = await completeWeightUpdate(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                poaSecurityModule,
                config,
                weightUpdateTxHash,
                options.nodeId.length > 0 ? options.nodeId : undefined,
            );

            logger.log(`Weight update completed for node . Transaction hash: ${txHash}`);
        });

    /**
     * --------------------------------------------------
     * KITE STAKING MANAGER
     * --------------------------------------------------
     */
    const kiteStakingManagerCmd = program
        .command("kite-staking-manager")
        .alias("ksm")
        .description("Commands to interact with KiteStakingManager contracts");

    kiteStakingManagerCmd
        .command("update-staking-config")
        .description("Update staking configuration")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
        .argument("minimumStakeAmount", "Minimum stake amount")
        .argument("maximumStakeAmount", "Maximum stake amount")
        .argument("minimumStakeDuration", "Minimum stake duration in seconds")
        .addArgument(ArgNumber("minimumDelegationFeeBips", "Minimum delegation fee in basis points"))
        .addArgument(ArgNumber("maximumStakeMultiplier", "Maximum stake multiplier"))
        .action(async (kiteStakingManagerAddress, minimumStakeAmount, maximumStakeAmount, minimumStakeDuration, minimumDelegationFeeBips, maximumStakeMultiplier) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);

            // Get staking config to determine decimals - typically 18 for native tokens
            // For now, assume 18 decimals (1e18) for stake amounts
            const minimumStakeAmountWei = parseUnits(minimumStakeAmount, 18);
            const maximumStakeAmountWei = parseUnits(maximumStakeAmount, 18);
            const minimumStakeDurationBigInt = BigInt(minimumStakeDuration);

            await updateStakingConfig(
                kiteStakingManager,
                minimumStakeAmountWei,
                maximumStakeAmountWei,
                minimumStakeDurationBigInt,
                minimumDelegationFeeBips,
                maximumStakeMultiplier
            );
        });

    kiteStakingManagerCmd
        .command("initiate-validator-registration")
        .description("Initiate validator registration on KiteStakingManager")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
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
        .action(async (kiteStakingManagerAddress, nodeId, blsKey, delegationFeeBips, minStakeDuration, rewardRecipient, stakeAmount, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);
            const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex');

            // Build remainingBalanceOwner and disableOwner PChainOwner structs
            const remainingBalanceOwnerAddress = options.pchainRemainingBalanceOwnerAddress.length > 0 ? options.pchainRemainingBalanceOwnerAddress : [defaultOwnerAddress];
            const disableOwnerAddress = options.pchainDisableOwnerAddress.length > 0 ? options.pchainDisableOwnerAddress : [defaultOwnerAddress];
            const remainingBalanceOwner: [number, Hex[]] = [
                Number(options.pchainRemainingBalanceOwnerThreshold),
                remainingBalanceOwnerAddress
            ];
            const disableOwner: [number, Hex[]] = [
                Number(options.pchainDisableOwnerThreshold),
                disableOwnerAddress
            ];

            // Get staking config to determine decimals for initial stake
            // For now, assume 18 decimals (1e18) for stake amounts
            const stakeAmountWei = parseUnits(stakeAmount, 18);
            const minStakeDurationBigInt = BigInt(minStakeDuration);

            await initiateValidatorRegistration(
                kiteStakingManager,
                nodeId,
                blsKey,
                remainingBalanceOwner,
                disableOwner,
                delegationFeeBips,
                minStakeDurationBigInt,
                rewardRecipient,
                stakeAmountWei
            );
        });

    kiteStakingManagerCmd
        .command("complete-validator-registration")
        .description("Complete validator registration on the P-Chain and on the KiteStakingManager after initiating registration")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
        .addArgument(ArgHex("initiateTxHash", "Initiate validator registration transaction hash"))
        .addArgument(ArgBLSPOP())
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01'))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .action(async (kiteStakingManagerAddress, initiateTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }
            const initialBalance = ParseUnits(options.initialBalance, 9, 'Invalid initial balance');
            const client = await generateClient(opts.network, options.pchainTxPrivateKey, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);

            await kiteCompleteValidatorRegistration(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                kiteStakingManager,
                config,
                blsProofOfPossession,
                initiateTxHash,
                initialBalance,
                !options.skipWaitApi
            );
        });

    kiteStakingManagerCmd
        .command("initiate-delegator-registration")
        .description("Initiate delegator registration on KiteStakingManager")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgAddress("rewardRecipient", "Reward recipient address"))
        .argument("stakeAmount", "Initial stake amount")
        .action(async (kiteStakingManagerAddress, nodeId, rewardRecipient, stakeAmount) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);

            // Get staking config to determine decimals for stake amount
            // For now, assume 18 decimals (1e18) for stake amounts
            const stakeAmountWei = parseUnits(stakeAmount, 18);

            await initiateDelegatorRegistration(
                kiteStakingManager,
                config,
                nodeId,
                rewardRecipient,
                stakeAmountWei
            );
        });

    kiteStakingManagerCmd
        .command("complete-delegator-registration")
        .description("Complete delegator registration on the P-Chain and on the KiteStakingManager after initiating registration")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
        .addArgument(ArgHex("initiateTxHash", "Initiate delegator registration transaction hash"))
        .argument("rpcUrl", "RPC URL for getting validator uptime")
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .action(async (kiteStakingManagerAddress, initiateTxHash, rpcUrl, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);

            await kiteCompleteDelegatorRegistration(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                kiteStakingManager,
                config,
                initiateTxHash,
                rpcUrl
            );
        });

    kiteStakingManagerCmd
        .command("initiate-delegator-removal")
        .description("Initiate delegator removal on KiteStakingManager")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
        .addArgument(ArgHex("delegationID", "Delegation ID"))
        .addOption(new Option("--include-uptime-proof", "Include uptime proof in the removal").default(false))
        .addOption(new Option("--rpc-url <rpcUrl>", "RPC URL for getting validator uptime (required if --include-uptime-proof is true)"))
        .action(async (kiteStakingManagerAddress, delegationID, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);

            await initiateDelegatorRemoval(
                client,
                kiteStakingManager,
                config,
                delegationID,
                options.includeUptimeProof,
                options.rpcUrl
            );
        });

    kiteStakingManagerCmd
        .command("complete-delegator-removal")
        .description("Complete delegator removal on the P-Chain and on the KiteStakingManager after initiating removal")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
        .addArgument(ArgHex("initiateRemovalTxHash", "Initiate delegator removal transaction hash"))
        .argument("rpcUrl", "RPC URL for getting validator uptime")
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .addOption(new Option("--delegation-id <delegationID>", "Delegation ID of the delegator being removed").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
        .addOption(new Option("--initiate-tx <initiateTx>", "Initiate delegator registration transaction hash"))
        .action(async (kiteStakingManagerAddress, initiateRemovalTxHash, rpcUrl, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);

            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);
            // Check if P-Chain address have 0.000050000 AVAX for tx fees
            await requirePChainBallance(client, 50000n, opts.yes);

            await kiteCompleteDelegatorRemoval(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                kiteStakingManager,
                config,
                initiateRemovalTxHash,
                rpcUrl,
                !options.skipWaitApi,
                options.delegationId.length > 0 ? options.delegationId : undefined,
                options.initiateTx ? (options.initiateTx as Hex) : undefined
            );
        });

    kiteStakingManagerCmd
        .command("initiate-validator-removal")
        .description("Initiate validator removal on KiteStakingManager")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
        .addArgument(ArgNodeID())
        .addOption(new Option("--include-uptime-proof", "Include uptime proof in the removal").default(false))
        .action(async (kiteStakingManagerAddress, nodeId, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);

            await initiateValidatorRemoval(
                kiteStakingManager,
                config,
                nodeId,
                options.includeUptimeProof
            );
        });

    kiteStakingManagerCmd
        .command("complete-validator-removal")
        .description("Complete validator removal on the P-Chain and on the KiteStakingManager after initiating removal")
        .addArgument(ArgAddress("kiteStakingManagerAddress", "KiteStakingManager contract address"))
        .addArgument(ArgHex("initiateRemovalTxHash", "Initiate validator removal transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .addOption(new Option("--initiate-tx <initiateTx>", "Initiate validator registration transaction hash").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
        .action(async (kiteStakingManagerAddress, initiateRemovalTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);

            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const kiteStakingManager = await config.contracts.KiteStakingManager(kiteStakingManagerAddress);
            // Check if P-Chain address have 0.000050000 AVAX for tx fees
            await requirePChainBallance(client, 50000n, opts.yes);

            await kiteCompleteValidatorRemoval(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                kiteStakingManager,
                config,
                initiateRemovalTxHash,
                !options.skipWaitApi,
                options.nodeId.length > 0 ? options.nodeId : undefined,
                options.initiateTx.length > 0 ? options.initiateTx : undefined,
            );
        });

    /**
     * --------------------------------------------------
     * STAKING VAULT
     * --------------------------------------------------
     */
    const stakingVaultCmd = program
        .command("staking-vault")
        .alias("sv")
        .description("Commands to interact with StakingVault contracts");

    stakingVaultCmd
        .command("deposit")
        .description("Deposit native tokens (AVAX) into the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .argument("amount", "Amount to deposit in AVAX")
        .addArgument(ArgBigInt("minShares", "Minimum shares expected from the deposit (slippage protection)"))
        .action(async (stakingVaultAddress, amount, minShares) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

            await depositStakingVault(
                client,
                stakingVault,
                amount,
                minShares
            );
        });

    stakingVaultCmd
        .command("request-withdrawal")
        .description("Request withdrawal from the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .argument("shares", "Amount of shares to withdraw")
        .action(async (stakingVaultAddress, shares) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

            await requestWithdrawalStakingVault(
                client,
                stakingVault,
                shares
            );
        });

    stakingVaultCmd
        .command("claim-withdrawal")
        .description("Claim a withdrawal from the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgBigInt("requestId", "Withdrawal request ID to claim"))
        .action(async (stakingVaultAddress, requestId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

            await claimWithdrawalStakingVault(
                client,
                stakingVault,
                requestId
            );
        });

    stakingVaultCmd
        .command("process-epoch")
        .description("Process the current epoch in the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .action(async (stakingVaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

            await processEpochStakingVault(
                client,
                stakingVault
            );
        });

    stakingVaultCmd
        .command("initiate-validator-registration")
        .description("Initiate validator registration in the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgNodeID())
        .addArgument(ArgHex("blsKey", "BLS public key"))
        .argument("stakeAmount", "Stake amount in AVAX")
        .addOption(new Option("--pchain-remaining-balance-owner-threshold <threshold>", "P-Chain remaining balance owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-disable-owner-threshold <threshold>", "P-Chain disable owner threshold").default(1).argParser(ParserNumber))
        .addOption(new Option("--pchain-remaining-balance-owner-address <address>", "P-Chain remaining balance owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .addOption(new Option("--pchain-disable-owner-address <address>", "P-Chain disable owner address").default([] as Hex[]).argParser(collectMultiple(ParserAddress)))
        .action(async (stakingVaultAddress, nodeId, blsKey, stakeAmount, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);
            const defaultOwnerAddress = fromBytes(utils.bech32ToBytes(client.addresses.P), 'hex');

            // Build remainingBalanceOwner and disableOwner PChainOwner structs
            const remainingBalanceOwnerAddress = options.pchainRemainingBalanceOwnerAddress.length > 0 ? options.pchainRemainingBalanceOwnerAddress : [defaultOwnerAddress];
            const disableOwnerAddress = options.pchainDisableOwnerAddress.length > 0 ? options.pchainDisableOwnerAddress : [defaultOwnerAddress];
            const remainingBalanceOwner: [number, Hex[]] = [
                Number(options.pchainRemainingBalanceOwnerThreshold),
                remainingBalanceOwnerAddress
            ];
            const disableOwner: [number, Hex[]] = [
                Number(options.pchainDisableOwnerThreshold),
                disableOwnerAddress
            ];

            await initiateValidatorRegistrationStakingVault(
                client,
                config,
                stakingVault,
                nodeId,
                blsKey,
                remainingBalanceOwner,
                disableOwner,
                stakeAmount
            );
        });

    stakingVaultCmd
        .command("add-operator")
        .description("Add an operator to the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .argument("allocationBips", "Allocation in basis points (1 bips = 0.01%)")
        .addArgument(ArgAddress("feeRecipient", "Fee recipient address"))
        .action(async (stakingVaultAddress, operator, allocationBips, feeRecipient) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

            const allocationBipsBigInt = BigInt(allocationBips);

            await addOperatorStakingVault(
                client,
                config,
                stakingVault,
                operator,
                allocationBipsBigInt,
                feeRecipient
            );
        });

    stakingVaultCmd
        .command("complete-validator-registration")
        .description("Complete validator registration on the P-Chain and on the StakingVault after initiating registration")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgAddress("validatorManagerAddress", "ValidatorManager contract address"))
        .addArgument(ArgHex("initiateTxHash", "Initiate validator registration transaction hash"))
        .addArgument(ArgBLSPOP())
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--initial-balance <initialBalance>", "Node initial balance to pay for continuous fee").default('0.01'))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be visible through the P-Chain API"))
        .action(async (stakingVaultAddress, validatorManagerAddress, initiateTxHash, blsProofOfPossession, options) => {
            const opts = program.opts();

            // If pchainTxPrivateKey is not provided, use the private key
            if (!options.pchainTxPrivateKey) {
                options.pchainTxPrivateKey = opts.privateKey!;
            }
            const initialBalance = ParseUnits(options.initialBalance, 9, 'Invalid initial balance');
            const client = await generateClient(opts.network, options.pchainTxPrivateKey, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);

            await completeValidatorRegistrationStakingVault(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                config,
                stakingVault,
                validatorManager,
                blsProofOfPossession,
                initiateTxHash,
                initialBalance,
                !options.skipWaitApi
            );
        });

    stakingVaultCmd
        .command("initiate-validator-removal")
        .description("Initiate validator removal in the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgAddress("validatorManagerAddress", "ValidatorManager contract address"))
        .addArgument(ArgNodeID())
        .action(async (stakingVaultAddress, validatorManagerAddress, nodeId) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);

            await initiateValidatorRemovalStakingVault(
                client,
                config,
                stakingVault,
                validatorManager,
                nodeId
            );
        });

    stakingVaultCmd
        .command("complete-validator-removal")
        .description("Complete validator removal on the P-Chain and on the StakingVault after initiating removal")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgAddress("validatorManagerAddress", "ValidatorManager contract address"))
        .addArgument(ArgHex("initiateRemovalTxHash", "Initiate validator removal transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be removed from the P-Chain API"))
        .addOption(new Option("--node-id <nodeId>", "Node ID of the validator being removed").default([] as NodeId[]).argParser(collectMultiple(ParserNodeID)))
        .addOption(new Option("--initiate-tx <initiateTx>", "Initiate validator registration transaction hash").argParser((value) => value as Hex))
        .action(async (stakingVaultAddress, validatorManagerAddress, initiateRemovalTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);
            // Check if P-Chain address have 0.000050000 AVAX for tx fees
            await requirePChainBallance(client, 50000n, opts.yes);

            await completeValidatorRemovalStakingVault(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                config,
                stakingVault,
                validatorManager,
                initiateRemovalTxHash,
                !options.skipWaitApi,
                options.nodeId.length > 0 ? options.nodeId : undefined,
                options.initiateTx
            );
        });

    stakingVaultCmd
        .command("initiate-delegator-registration")
        .description("Initiate delegator registration in the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgAddress("validatorManagerAddress", "ValidatorManager contract address"))
        .addArgument(ArgNodeID())
        .argument("amount", "Stake amount in AVAX")
        .action(async (stakingVaultAddress, validatorManagerAddress, nodeId, amount) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);

            await initiateDelegatorRegistrationStakingVault(
                client,
                config,
                stakingVault,
                validatorManager,
                nodeId,
                amount
            );
        });

    stakingVaultCmd
        .command("complete-delegator-registration")
        .description("Complete delegator registration on the P-Chain and on the StakingVault after initiating registration")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgAddress("validatorManagerAddress", "ValidatorManager contract address"))
        .addArgument(ArgHex("initiateTxHash", "Initiate delegator registration transaction hash"))
        .argument("rpcUrl", "RPC URL for getting validator uptime")
        .addArgument(ArgHex("uptimeBlockchainID", "Uptime blockchain ID (Hex format, same as KiteStakingManager settings)"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .action(async (stakingVaultAddress, validatorManagerAddress, initiateTxHash, rpcUrl, uptimeBlockchainID, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);

            await completeDelegatorRegistrationStakingVault(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                config,
                stakingVault,
                validatorManager,
                initiateTxHash,
                rpcUrl,
                uptimeBlockchainID
            );
        });

    stakingVaultCmd
        .command("initiate-delegator-removal")
        .description("Initiate delegator removal in the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgHex("delegationID", "Delegation ID"))
        .action(async (stakingVaultAddress, delegationID) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

            await initiateDelegatorRemovalStakingVault(
                client,
                config,
                stakingVault,
                delegationID
            );
        });

    stakingVaultCmd
        .command("complete-delegator-removal")
        .description("Complete delegator removal on the P-Chain and on the StakingVault after initiating removal")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgAddress("validatorManagerAddress", "ValidatorManager contract address"))
        .addArgument(ArgHex("initiateRemovalTxHash", "Initiate delegator removal transaction hash"))
        .addOption(new Option("--pchain-tx-private-key <pchainTxPrivateKey>", "P-Chain transaction private key/secret name or 'ledger'. Defaults to the private key.").argParser(ParserPrivateKey))
        .addOption(new Option("--skip-wait-api", "Don't wait for the validator to be removed from the P-Chain API"))
        .addOption(new Option("--delegation-id <delegationID>", "Delegation ID of the delegator being removed").default([] as Hex[]).argParser(collectMultiple(ParserHex)))
        .addOption(new Option("--initiate-tx <initiateTx>", "Initiate delegator registration transaction hash").argParser((value) => value as Hex))
        .action(async (stakingVaultAddress, validatorManagerAddress, initiateRemovalTxHash, options) => {
            const opts = program.opts();
            if (!options.pchainTxPrivateKey) options.pchainTxPrivateKey = opts.privateKey!;
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);
            const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress);
            // Check if P-Chain address have 0.000050000 AVAX for tx fees
            await requirePChainBallance(client, 50000n, opts.yes);

            await completeDelegatorRemovalStakingVault(
                client,
                options.pchainTxPrivateKey ? await generateClient(opts.network, options.pchainTxPrivateKey) : client,
                config,
                stakingVault,
                validatorManager,
                initiateRemovalTxHash,
                !options.skipWaitApi,
                options.delegationId.length > 0 ? options.delegationId : undefined,
                options.initiateTx
            );
        });

    stakingVaultCmd
        .command("update-operator-allocations")
        .description("Update operator allocations in the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .argument("allocationBips", "Allocation in basis points (1 bips = 0.01%)")
        .action(async (stakingVaultAddress, operator, allocationBips) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

            const allocationBipsBigInt = BigInt(allocationBips);
            await stakingVault.safeWrite.updateOperatorAllocations([[operator], [allocationBipsBigInt]])
        });

    stakingVaultCmd
        .command("info")
        .description("Get information about the StakingVault")
        .addArgument(ArgAddress("stakingVaultAddress", "StakingVault contract address"))
        .action(async (stakingVaultAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

            const [currentEpoch, lastEpochProcessed, liquidityBufferBips, operatorList, totalSupply, symbol, owner, paused, totalPooledStake, decimals, epochDuration] = await stakingVault.multicall(["getCurrentEpoch", "getLastEpochProcessed", "getLiquidityBufferBips", "getOperatorList", "totalSupply", "symbol", "owner", "paused", "getTotalPooledStake", 'decimals', 'getEpochDuration'])
            const todecimals = (amount: bigint) => Number(amount) / (10 ** Number(decimals));
            logger.log(`StakingVault ${stakingVaultAddress} info:`);
            logger.log(`  Current Epoch: ${currentEpoch}`);
            logger.log(`  Epoch Duration: ${epochDuration}`);
            logger.log(`  Last Epoch Processed: ${lastEpochProcessed}`);
            logger.log(`  Liquidity Buffer (bips): ${liquidityBufferBips}`);
            logger.log(`  Total Supply (shares): ${todecimals(totalSupply)} ` + symbol);
            logger.log(`  Total Pooled Stake (wei): ${totalPooledStake}`);
            logger.log(`  Symbol: ${symbol}`);
            logger.log(`  Owner: ${owner}`);
            logger.log(`  Paused: ${paused}`);
            logger.log(`  Operators:`);
            for (let i = 0; i < operatorList.length; i++) {
                const operator = operatorList[i]
                const [{ active, allocationBips, activeStake, accruedFees, feeRecipient }, balance, validatorIDs] = await stakingVault.multicall([{ name: "getOperatorInfo", args: [operator] }, { name: "balanceOf", args: [operator] }, { name: 'getOperatorValidators', args: [operator] }]);
                logger.log(`    Operator ${operator}: active=${active} allocationBips=${allocationBips} activeStake=${activeStake} feeRecipient=${feeRecipient}`);
                logger.log(`      Validator IDs: ${validatorIDs.join(", ")}`);
                logger.log(`      Accrued Fees: ${accruedFees}`);
                logger.log(`      Balance (stake): ${todecimals(balance)} ` + symbol);

            }
        });

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
        .action(async (middlewareVaultManager, operatorAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);

            const operator = operatorAddress;
            logger.log(`Operator: ${operator}`);

            // 1) Read total vaults from VaultManager
            const vaultManager = await config.contracts.VaultManager(middlewareVaultManager);
            const vaultCount = await vaultManager.read.getVaultCount()

            logger.log(`Found ${vaultCount} vault(s).`);

            // This map accumulates the total stake for each collateral
            const totalStakesByCollateral: Record<string, bigint> = {};

            // 2) Let's get all L1 addresses from the L1Registry (similar to your Python code)
            const l1Registry = await config.contracts.L1Registry(config.l1Registry)
            const totalL1s = await l1Registry.read.totalL1s();

            // We'll store them in an array
            const l1Array: Hex[] = [];
            for (let i = 0n; i < totalL1s; i++) {
                // e.g. getL1At(i) might return [address, metadataUrl], adjust as needed
                const [l1Address, _] = await l1Registry.read.getL1At([i]);

                l1Array.push(l1Address as Hex);
            }

            // 3) For each vault in [0..vaultCount-1], read collateralClass, delegator, collateral
            for (let i = 0n; i < vaultCount; i++) {
                const [vaultAddress] = await vaultManager.read.getVaultAtWithTimes([i]);

                logger.log(`\nVault #${i}: ${vaultAddress}`);

                // read the collateralClass
                const collateralClass = await vaultManager.read.getVaultCollateralClass([vaultAddress]);

                // read delegator
                const vaultTokenized = await config.contracts.VaultTokenized(vaultAddress);
                const delegator = await vaultTokenized.read.delegator();

                if (delegator === '0x0000000000000000000000000000000000000000') {
                    logger.log("    (No delegator set, skipping)");
                    continue;
                }
                const l1RestakeDelegator = await config.contracts.L1RestakeDelegator(delegator);
                // read collateral
                const collateral = await vaultTokenized.read.collateral();

                // 4) For each L1 in l1Array, check if operator is opted in
                for (const l1Address of l1Array) {
                    const operatorL1OptInService = await config.contracts.OperatorL1OptInService(config.opL1OptIn);
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
        });

    vaultManagerCmd
        .command("l1stakes")
        .description("Show L1 stakes for a given validator manager")
        .addArgument(ArgAddress("validatorManagerAddress", "Validator manager address"))
        .description("Show L1 stakes for a given validator manager")
        .action(async () => {
            // TODO: Implement
        });

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
        .addArgument(ArgCB58("blockchainId", "Blockchain ID"))
        .addArgument(ArgNodeID())
        .action(async (rpcUrl, blockchainId, nodeId) => {
            rpcUrl = rpcUrl + "/ext/bc/" + blockchainId;
            const opts = program.opts();
            const client = await generateClient(opts.network);
            await getValidationUptimeMessage(
                client.network,
                rpcUrl,
                nodeId,
                client.network === "fuji" ? 5 : 1,
                blockchainId);
        });

    uptimeCmd
        .command('compute-validator-uptime')
        .addArgument(ArgAddress("uptimeTrackerAddress", "Uptime tracker contract address"))
        .addArgument(ArgHex("signedUptimeHex", "Signed uptime hex"))
        .action(async (uptimeTrackerAddress, signedUptimeHex) => {
            const opts = program.opts();
            const { privateKey, network, wait, safe } = program.opts();
            const client = await generateClient(network, privateKey!, safe);
            const config = getConfig(client, wait, opts.skipAbiValidation);
            await computeValidatorUptime(
                await config.contracts.UptimeTracker(uptimeTrackerAddress as Hex),
                signedUptimeHex as Hex
            );
        });

    // ---- Combined Uptime Reporting Command ----
    uptimeCmd
        .command("report-uptime-validator")
        .description("Gets a validator's signed uptime message and submits it to the UptimeTracker contract.")
        .addArgument(ArgURI("rpcUrl", "RPC URL like 'http(s)://<domain or ip and port>'"))
        .addArgument(ArgCB58("blockchainId", "The Blockchain ID for which the uptime is being reported"))
        .addArgument(ArgNodeID("nodeId", "The NodeID of the validator"))
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract on the C-Chain"))
        .action(async (rpcUrl, blockchainId, nodeId, uptimeTrackerAddress) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                logger.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }

            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            rpcUrl = rpcUrl + "/ext/bc/" + blockchainId;

            await reportAndSubmitValidatorUptime(
                client.network,
                rpcUrl,
                nodeId,
                blockchainId,
                await config.contracts.UptimeTracker(uptimeTrackerAddress),
                client.account!
            );
        });

    // ---- Adding new commands for operator uptime ----
    uptimeCmd
        .command("compute-operator-uptime")
        .description("Compute uptime for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                logger.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const uptimeTracker = await config.contracts.UptimeTracker(uptimeTrackerAddress);
            await computeOperatorUptimeAtEpoch(
                uptimeTracker,
                operator,
                epoch
            );
        });

    uptimeCmd
        .command("compute-operator-uptime-range")
        .description("Compute uptime for an operator over a range of epochs (client-side looping)")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("startEpoch", "Starting epoch number"))
        .addArgument(ArgNumber("endEpoch", "Ending epoch number"))
        .action(async (uptimeTrackerAddress, operator, startEpoch, endEpoch) => {
            const opts = program.opts();
            if (!opts.privateKey!) {
                logger.error("Error: Private key is required. Use -k or set PK environment variable.");
                process.exit(1);
            }
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const uptimeTracker = await config.contracts.UptimeTracker(uptimeTrackerAddress);
            await computeOperatorUptimeForEpochs(
                uptimeTracker,
                operator,
                startEpoch,
                endEpoch
            );
        });

    // ---- Read-only commands for uptime data ----
    uptimeCmd
        .command("get-validator-uptime")
        .description("Get the recorded uptime for a validator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgHex("validationID", "Validation ID of the validator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, validationID, epoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const uptimeTracker = await config.contracts.UptimeTracker(uptimeTrackerAddress);
            const uptime = await getValidatorUptimeForEpoch(
                uptimeTracker,
                validationID,
                epoch
            );
            logger.log(`Validator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
        });

    uptimeCmd
        .command("check-validator-uptime-set")
        .description("Check if uptime data is set for a validator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgHex("validationID", "Validation ID of the validator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, validationID, epoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const uptimeTracker = await config.contracts.UptimeTracker(uptimeTrackerAddress);
            const isSet = await isValidatorUptimeSetForEpoch(
                uptimeTracker,
                validationID,
                epoch
            );
            logger.log(`Validator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
        });

    uptimeCmd
        .command("get-operator-uptime")
        .description("Get the recorded uptime for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const uptimeTracker = await config.contracts.UptimeTracker(uptimeTrackerAddress);
            const uptime = await getOperatorUptimeForEpoch(
                uptimeTracker,
                operator,
                epoch
            );
            logger.log(`Operator uptime for epoch ${epoch}: ${uptime.toString()} seconds`);
        });

    uptimeCmd
        .command("check-operator-uptime-set")
        .description("Check if uptime data is set for an operator at a specific epoch")
        .addArgument(ArgAddress("uptimeTrackerAddress", "Address of the UptimeTracker contract"))
        .addArgument(ArgAddress("operator", "Address of the operator"))
        .addArgument(ArgNumber("epoch", "Epoch number"))
        .action(async (uptimeTrackerAddress, operator, epoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const uptimeTracker = await config.contracts.UptimeTracker(uptimeTrackerAddress);
            const isSet = await isOperatorUptimeSetForEpoch(
                uptimeTracker,
                operator,
                epoch
            );
            logger.log(`Operator uptime is ${isSet ? 'set' : 'not set'} for epoch ${epoch}`);
        });

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
        .action(async (rewardsAddress, epoch, batchSize) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const txHash = await distributeRewards(
                rewardsContract,
                epoch,
                batchSize
            );
            logger.log(`Rewards distributed for epoch ${epoch}. tx hash: ${txHash}`);
        });

    rewardsCmd
        .command("claim")
        .description("Claim rewards for a staker in batch of 64 epochs")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));

            let hashs: Hex[] = [];
            for (const _ of Array.from({ length: await getRewardsClaimsCount(rewardsContract, config, 'Staker', client.account!) })) {
                hashs.push(await claimRewards(
                    rewardsContract,
                    recipient,
                ));
            }

            if (hashs.length === 0) {
                logger.log("No rewards to claim");
                return;
            }

            const logs = await Promise.all(hashs.map(hash => getERC20Events(hash, config)));
            logs.flat().forEach((log) => {
                if (log.eventName === "Transfer") {
                    const { from, to, value } = log.args;
                    logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
                }
            });
        });

    rewardsCmd
        .command("claim-operator-fee")
        .description("Claim operator fees in batch of 64 epochs")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));

            let hashs: Hex[] = [];

            for (const _ of Array.from({ length: await getRewardsClaimsCount(rewardsContract, config, 'Operator', client.account!) })) {
                hashs.push(await claimOperatorFee(
                    rewardsContract,
                    recipient
                ));
            }

            if (hashs.length === 0) {
                logger.log("No operator fees to claim");
                return;
            }

            const logs = await Promise.all(hashs.map(hash => getERC20Events(hash, config)));
            logs.flat().forEach((log) => {
                if (log.eventName === "Transfer") {
                    const { from, to, value } = log.args;
                    logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
                }
            });

        });

    rewardsCmd
        .command("claim-curator-fee")
        .description("Claim all curator fees in batch of 64 epochs")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));

            let hashs: Hex[] = [];

            for (const _ of Array.from({ length: await getRewardsClaimsCount(rewardsContract, config, 'Curator', client.account!) })) {
                hashs.push(await claimCuratorFee(
                    rewardsContract,
                    recipient
                ));
            }

            if (hashs.length === 0) {
                logger.log("No curator fees to claim");
                return;
            }

            const logs = await Promise.all(hashs.map(hash => getERC20Events(hash, config)));
            logs.flat().forEach((log) => {
                if (log.eventName === "Transfer") {
                    const { from, to, value } = log.args;
                    logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
                }
            });
        });

    rewardsCmd
        .command("claim-protocol-fee")
        .description("Claim protocol fees (only for protocol owner)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            const hash = await claimProtocolFee(
                rewardsContract,
                recipient
            );

            if (!hash) {
                logger.log("No protocol fees to claim");
                return;
            }

            const logs = await getERC20Events(hash, config)
            logs.forEach((log) => {
                if (log.eventName === "Transfer") {
                    const { from, to, value } = log.args;
                    logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
                }
            });
        });

    rewardsCmd
        .command("claim-undistributed")
        .description("Claim undistributed rewards (admin only)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to claim undistributed rewards for"))
        .addOption(new Option("--recipient <recipient>", "Optional recipient address").argParser(ParserAddress))
        .action(async (rewardsAddress, epoch, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const recipient = options.recipient ?? (await getDefaultAccount(opts));
            const hash = await claimUndistributedRewards(
                rewardsContract,
                epoch,
                recipient
            );

            if (!hash) {
                logger.log("No undistributed rewards to claim");
                return;
            }

            const logs = await getERC20Events(hash, config)
            logs.forEach((log) => {
                if (log.eventName === "Transfer") {
                    const { from, to, value } = log.args;
                    logger.log(`Rewards claimed: ${value.toString()} tokens transferred from ${from} to ${to}`);
                }
            });
        });

    rewardsCmd
        .command("set-amount")
        .description("Set rewards amount for epochs")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("startEpoch", "Starting epoch"))
        .addArgument(ArgNumber("numberOfEpochs", "Number of epochs"))
        .argument("rewardsAmount", "Amount of rewards in decimal format")
        .action(async (rewardsAddress, startEpoch, numberOfEpochs, rewardsAmount) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            if (rewardsContract.name !== 'RewardsNativeToken') {
                throw new Error('Rewards contract is not a RewardsNativeToken');
            }
            const tokenAddress = await (rewardsContract as SafeSuzakuContract['RewardsNativeToken']).read.rewardsToken() as Hex;
            const token = await config.contracts.ERC20(tokenAddress);
            const decimals = await token.read.decimals();
            const rewardsAmountWei = parseUnits(rewardsAmount, decimals);
            const amountToApprove = rewardsAmountWei * BigInt(numberOfEpochs);
            await token.safeWrite.approve([rewardsAddress, amountToApprove], {
                chain: null,
                account: client.account!,
            });
            const txHash = await setRewardsAmountForEpochs(
                rewardsContract,
                startEpoch,
                numberOfEpochs,
                rewardsAmountWei
            );
            logger.log(`setRewardsAmountForEpochs tx hash: ${txHash}`);
        });

    rewardsCmd
        .command("set-bips-collateral-class")
        .description("Set rewards bips for collateral class")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .addArgument(ArgNumber("bips", "Bips in basis points (100 = 1%)"))
        .action(async (rewardsAddress, collateralClass, bips) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const hash = await setRewardsBipsForCollateralClass(
                rewardsContract,
                collateralClass,
                bips
            );
            logger.log(`setRewardsBipsForCollateralClass tx hash: ${hash}`);
        });

    rewardsCmd
        .command("set-min-uptime")
        .description("Set minimum required uptime for rewards eligibility")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("minUptime", "Minimum uptime in seconds"))
        .action(async (rewardsAddress, minUptime) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const hash = await setMinRequiredUptime(
                rewardsContract,
                minUptime
            );
            logger.log(`setMinRequiredUptime tx hash: ${hash}`);
        });

    rewardsCmd
        .command("set-protocol-owner")
        .description("Set protocol owner (DEFAULT_ADMIN_ROLE only)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("newOwner", "New protocol owner address"))
        .action(async (rewardsAddress, newOwner) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const hash = await setProtocolOwner(
                rewardsContract,
                newOwner
            );
            logger.log(`setProtocolOwner tx hash: ${hash}`);
        });

    rewardsCmd
        .command("update-protocol-fee")
        .description("Update protocol fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const hash = await updateProtocolFee(
                rewardsContract,
                newFee
            );
            logger.log(`updateProtocolFee tx hash: ${hash}`);
        });

    rewardsCmd
        .command("update-operator-fee")
        .description("Update operator fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const hash = await updateOperatorFee(
                rewardsContract,
                newFee
            );
            logger.log(`updateOperatorFee tx hash: ${hash}`);
        });

    rewardsCmd
        .command("update-curator-fee")
        .description("Update curator fee")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("newFee", "New fee in basis points (100 = 1%)"))
        .action(async (rewardsAddress, newFee) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const hash = await updateCuratorFee(
                rewardsContract,
                newFee
            );
            logger.log(`updateCuratorFee tx hash: ${hash}`);
        });

    rewardsCmd
        .command("update-all-fees")
        .description("Update all fees at once (protocol, operator, curator)")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("protocolFee", "New protocol fee in basis points (100 = 1%)"))
        .addArgument(ArgNumber("operatorFee", "New operator fee in basis points (100 = 1%)"))
        .addArgument(ArgNumber("curatorFee", "New curator fee in basis points (100 = 1%)"))
        .action(async (rewardsAddress, protocolFee, operatorFee, curatorFee) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            const hash = await updateAllFees(
                rewardsContract,
                protocolFee,
                operatorFee,
                curatorFee
            );
            logger.log(`updateAllFees tx hash: ${hash}`);
        });

    rewardsCmd
        .command("get-epoch-rewards")
        .description("Get rewards amount for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .action(async (rewardsAddress, epoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getEpochRewards(
                rewardsContract,
                epoch
            );
        });

    rewardsCmd
        .command("get-operator-shares")
        .description("Get operator shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .action(async (rewardsAddress, epoch, operator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getOperatorShares(
                rewardsContract,
                epoch,
                operator
            );
        });

    rewardsCmd
        .command("get-vault-shares")
        .description("Get vault shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("vault", "Vault address"))
        .action(async (rewardsAddress, epoch, vault) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getVaultShares(
                rewardsContract,
                epoch,
                vault
            );
        });

    rewardsCmd
        .command("get-curator-shares")
        .description("Get curator shares for a specific epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .addArgument(ArgAddress("curator", "Curator address"))
        .action(async (rewardsAddress, epoch, curator) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getCuratorShares(
                rewardsContract,
                epoch,
                curator
            );
        });

    rewardsCmd
        .command("get-protocol-rewards")
        .description("Get protocol rewards for a token")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("token", "Token address"))
        .action(async (rewardsAddress, token) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getProtocolRewards(
                rewardsContract
            );
        });

    rewardsCmd
        .command("get-distribution-batch")
        .description("Get distribution batch status for an epoch")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgNumber("epoch", "Epoch to query"))
        .action(async (rewardsAddress, epoch) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getDistributionBatch(
                rewardsContract,
                epoch
            );
        });

    rewardsCmd
        .command("get-fees-config")
        .description("Get current fees configuration")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .action(async (rewardsAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getFeesConfiguration(
                rewardsContract
            );
        });

    rewardsCmd
        .command("get-bips-collateral-class")
        .description("Get rewards bips for collateral class")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgBigInt("collateralClass", "Collateral class ID"))
        .action(async (rewardsAddress, collateralClass) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getRewardsBipsForCollateralClass(
                rewardsContract,
                collateralClass
            );
        });

    rewardsCmd
        .command("get-min-uptime")
        .description("Get minimum required uptime for rewards eligibility")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .action(async (rewardsAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getMinRequiredUptime(
                rewardsContract
            );
        });

    rewardsCmd
        .command("get-last-claimed-staker")
        .description("Get last claimed epoch for a staker")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("staker", "Staker address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(async (rewardsAddress, staker, rewardToken) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getLastEpochClaimedStaker(
                rewardsContract,
                staker
            );
        });

    rewardsCmd
        .command("get-last-claimed-operator")
        .description("Get last claimed epoch for an operator")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("operator", "Operator address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(async (rewardsAddress, operator, rewardToken) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getLastEpochClaimedOperator(
                rewardsContract,
                operator
            );
        });

    rewardsCmd
        .command("get-last-claimed-curator")
        .description("Get last claimed epoch for a curator")
        .addArgument(ArgAddress("rewardsAddress", "Address of the rewards contract"))
        .addArgument(ArgAddress("curator", "Curator address"))
        .addArgument(ArgAddress("rewardToken", "Reward token address"))
        .action(async (rewardsAddress, curator, rewardToken) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, true);
            const rewardsContract = await config.contracts.RewardsNativeToken(rewardsAddress);
            await getLastEpochClaimedCurator(
                rewardsContract,
                curator
            );
        });

    buildKeyStoreCmds(
        program
            .command("key")
            .description("Manage the cli keystore (advanced users can use pass directly)")
    )

    function printIndentedHelp(cmd: CommandUnknownOpts | Command, indent = 0): boolean {
        const pad = " ".repeat(indent);
        let newLineToLog = false;
        let hasSubCmds = false;

        cmd.commands.forEach((sub,) => {
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

    const accessControlCmd = program
        .command("access-control")
        .description("Commands for managing access control");

    accessControlCmd
        .command("grant-role")
        .description("Grant a role to an account")
        .addArgument(ArgAddress("contractAddress", "Address of the contract"))
        .argument("role", "Role hash or name case unsensitive without '()'")
        .addArgument(ArgAddress("account", "Account address to grant the role to"))
        .action(async (contractAddress, role, account) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const accessControl = await config.contracts.AccessControl(contractAddress);
            if (!await isAccessControl(accessControl)) {
                throw new Error("Contract does not implement AccessControl interface");
            }
            const txHash = await grantRole(
                accessControl,
                role,
                account
            );
            logger.log(`Role granted. tx hash: ${txHash}`);
        });

    accessControlCmd
        .command("revoke-role")
        .description("Revoke a role from an account")
        .addArgument(ArgAddress("contractAddress", "Address of the contract"))
        .argument("role", "Role hash or name case unsensitive")
        .addArgument(ArgAddress("account", "Account address to revoke the role from"))
        .action(async (contractAddress, role, account) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const accessControl = await config.contracts.AccessControl(contractAddress);
            if (!await isAccessControl(accessControl)) {
                throw new Error("Contract does not implement AccessControl interface");
            }
            const txHash = await revokeRole(
                accessControl,
                role,
                account
            );
            logger.log(`Role revoked. tx hash: ${txHash}`);
        });

    accessControlCmd
        .command("has-role")
        .description("Check if an account has a specific role")
        .addArgument(ArgAddress("contractAddress", "Address of the contract"))
        .argument("role", "Role hash or name case unsensitive")
        .addArgument(ArgAddress("account", "Account address to check"))
        .action(async (contractAddress, role, account) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const accessControl = await config.contracts.AccessControl(contractAddress);
            if (!await isAccessControl(accessControl)) {
                throw new Error("Contract does not implement AccessControl interface");
            }
            const hasRoleResult = await hasRole(
                accessControl,
                role,
                account
            );
            logger.log(`Account ${account} has role ${role}: ${hasRoleResult}`);
        });

    accessControlCmd
        .command("get-role-admin")
        .description("Get the admin role that controls a specific role")
        .addArgument(ArgAddress("contractAddress", "Address of the contract"))
        .argument("role", "Role hash or name case unsensitive")
        .action(async (contractAddress, role) => {
            const opts = program.opts();
            const client = await generateClient(opts.network);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            const accessControl = await config.contracts.AccessControl(contractAddress);
            if (!await isAccessControl(accessControl)) {
                throw new Error("Contract does not implement AccessControl interface");
            }
            const adminRole = await getRoleAdmin(
                accessControl,
                role
            );
            logger.log(`Admin role for role ${role} is: ${adminRole}`);
        });

    const ledgerCmd = program
        .command("ledger")
        .description("Commands for ledger")

    ledgerCmd
        .command("addresses")
        .description("Get ledger addresses")
        .action(async () => {
            const opts = program.opts();
            const client = await generateClient(opts.network, 'ledger');
            logger.log(client.addresses);
        });

    ledgerCmd
        .command('fix-usb-rules')
        .description('Fix ledger usb rules on linux')
        .action(async () => {
            logger.log("Fixing ledger usb rules...");
            try {
                // Execute system command to fix ledger usb rules (https://github.com/LedgerHQ/ledger-live-desktop/issues/2873#issuecomment-674844905)
                const result = execSync('wget -q -O - https://raw.githubusercontent.com/LedgerHQ/udev-rules/master/add_udev_rules.sh | sudo bash');
                logger.log(result.toString());
            } catch (error) {
                logger.error("Failed to fix ledger usb rules");
                logger.error(error);
            }
        });

    const safeCmd = program
        .command("safe")
        .description("Commands for safe")

    safeCmd
        .command("nonce")
        .description("Get safe nonce")
        .addArgument(ArgAddress("safeAddress", "Address of the safe"))
        .action(async (safeAddress) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            logger.log((await client.safe!.getNonce()).toString());
        });

    safeCmd
        .command("get-role")
        .description("Get user role in the safe")
        .addOption(OptAddress("--account <account>", "Account address to check"))
        .action(async (options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const addressToCheck = options.account || client.account!.address;
            const owners = await client.safe!.getOwners()
            const delegates = await client.safe!.apiKit!.getSafeDelegates({ safeAddress: opts.safe! })
            if (owners.find(owner => owner.toLowerCase() === addressToCheck.toLowerCase())) {
                logger.log("Owner");
            } else if (delegates.results.find(delegate => delegate.delegate.toLowerCase() === addressToCheck.toLowerCase())) {
                logger.log("Delegate");
            } else {
                logger.log("No role");
            }
        });


    program.
        command('create-network', { hidden: true })
        .description('Create a new network')
        .argument('chainName', 'Name of the chain')
        .argument('genesisFile', 'Path to the genesis file')
        .option('--vm-id <vmId>', 'subnet-evm custom id')
        .action(async (chainName, genesisFile, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const subnetId = await createSubnet({ client })
            const genesisData = readFileSync(genesisFile).toString('utf-8');
            const chainId = await createChain({
                client,
                chainName,
                subnetId,
                genesisData,
                SubnetEVMId: options.vmId
            })
            logger.log(`Network created:`)
            logger.log(`  Chain ID: ${chainId}`)
            logger.log(`  Subnet ID: ${subnetId}`)
            logger.addData('network', { chainId, subnetId })
        });

    program
        .command('subnet-to-l1', { hidden: true })
        .description('Convert a subnet to L1')
        .addArgument(ArgCB58('subnetId', 'Subnet ID of the subnet'))
        .addArgument(ArgCB58('chainId', 'Chain ID of the subnet'))
        .addArgument(ArgAddress('validatorManagerAddress', 'Validator manager of the subnet'))
        .addArgument(ArgCB58('vmcChainId', 'Validator Manager Contract Chain ID'))
        .addOption(new Option('--validatorConfig <validatorConfig>', 'Validator config file path (json)').default([]).argParser(collectMultiple(String)).makeOptionMandatory())
        .action(async (subnetId, chainId, validatorManagerAddress, vmcChainId, options) => {
            const opts = program.opts();
            const client = await generateClient(opts.network, opts.privateKey!, opts.safe);
            const config = getConfig(client, opts.wait, opts.skipAbiValidation);
            // const validatorManager = await config.contracts.ValidatorManager(validatorManagerAddress)
            await convertSubnetToL1({ client, subnetId, chainId, validatorManager: validatorManagerAddress, validatorManagerBlockchainID: vmcChainId, validators: options.validatorConfig.map(v => JSON.parse(readFileSync(v).toString('utf-8'))) })
        });

    program
        .command("help-all")
        .description("Display help for all commands and sub-commands")
        .action(async () => {
            console.log(`Suzaku CLI - version ${program.version()}`);
            console.log(program.description());
            console.log("Commands:\n");
            printIndentedHelp(program);
        });

    program.hook("preAction", () => {

        const opts = program.opts();
        // Block manually private key on mainnet
        if (opts.privateKey! && opts.network === "mainnet") {
            logger.error("Using private key on mainnet is not allowed. Use the secret keystore or a ledger instead.");
            process.exit(1);
        }
        // Ensure privateKey is set if opts.secret or ledger is provided
        if (opts.secretName) {
            program.setOptionValue('privateKey', opts.secretName)
        } else if (opts.ledger) {
            program.setOptionValue('privateKey', 'ledger')
        }

        // Activate json output if --json is provided
        logger.setJsonMode(opts.json);
    });

    program
        .command("completion install")
        .description("Install autocompletion for Bash/Zsh")
        .action(async () => installCompletion(program));

    program
        .command("__complete")
        .description("internal completion helper")
        .option("--line <line>")
        .action(async ({ line }) => {
            line = line || "";
            const parts = line.trim().split(/\s+/).slice(1);

            let node: Command = program;
            for (const part of parts) {
                const found = node.commands.find(c => c.name() === part);
                if (!found) break;
                node = found as any;
            }

            const suggestions = node.commands.map(c => c.name());
            console.log(suggestions.join(" "));
        });

    program.parse(process.argv);
}

main()
