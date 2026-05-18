#!/usr/bin/env node


import { Command, CommandUnknownOpts, Option } from '@commander-js/extra-typings';
import { Hex, parseUnits } from "viem";
import { addL1Commands } from "./l1";
import { addOperatorRegistryCommands } from "./operator";
import { Chains, generateClient } from "./client";
import { logger } from './lib/logger';
import {
    addVaultManagerCommands
} from "./vaultManager";
import { addVaultCommands } from "./vault";
import { addMiddlewareCommands } from "./middleware";

import {addOperatorOptInCommands} from "./operatorOptIn";

import addBalancerCommands from "./balancer";
import {addUptimeCommands} from "./uptime";

import {rewardsCmd} from "./rewards";
import { requirePChainBallance } from "./lib/transferUtils";
import { NodeId } from "./lib/utils";

import { addKeyStoreCommands } from "./keyStore";
import { ArgAddress, ArgCB58, ParserPrivateKey, ParserNumber, ParserNodeID, parseSecretName, collectMultiple, OptAddress, OptCB58 } from "./lib/cliParser";
import { convertSubnetToL1, createChain, createSubnet, getCurrentValidators, increasePChainValidatorBalance } from './lib/pChainUtils';
import { pipe, R } from '@mobily/ts-belt';
import {
    getL1Registry, getL1Middleware, getVaultTokenized, getDefaultCollateral,
    getL1RestakeDelegator, getVaultManager, getOperatorL1OptInService, getOperatorRegistry,
    getOperatorVaultOptInService, getPoASecurityModule, getUptimeTracker, getVaultFactory,
    getBalancerValidatorManager, getValidatorManager, getAccessControl, getRewardsNativeToken,
    getERC20, getKiteStakingManager, getStakingVault,
} from '@suzaku-network/suzaku-sdk/core';
import { kiteStakingManagerCommands } from './kiteStakingManager';
import { addStakingVaultCommands } from './stakingVault';
import { installCompletion } from './lib/autoCompletion';
import { addAccessControlCmd } from './accessControl';
import { SuzakuABINames, setCastMode, CurriedSuzakuContractMap } from './lib/viemUtils';
import './lib/commandUtils';
import { execSync } from 'child_process';
import { chainList, setCustomChainRpcUrl } from './lib/chainList';
import { readFileSync } from 'fs';
import packageJson from '../package.json';
import { addValidatorManagerCommands } from './validatorManager';
import { addPOACommands } from './poa';

// Main function to set up the CLI commands
const program = new Command()
    .name('suzaku-cli')
    .addOption(new Option('-n, --network <network>')
        .choices(Object.keys(chainList) as Chains[])
        .default('mainnet'))
    .addOption(new Option('-r, --rpc-url <rpcUrl>', 'RPC URL for a custom network (automatically sets --network to custom)'))
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
    .version(packageJson.version)
    .configureOutput({
        writeOut: (str) => process.stdout.write(str),
        writeErr: (str) => { str.includes('Usage: suzaku-cli') ? process.stdout.write(str) : process.stderr.write(str) },
    });

// Set cast mode and handle --rpc-url/custom network before any command runs
program.hook('preSubcommand', async (thisCommand) => {
    if (['verify-abi', '__complete'].includes(thisCommand.name())) return;
    const opts = program.opts();
    if (opts.cast) setCastMode(true);

    if (opts.rpcUrl) {
        await setCustomChainRpcUrl(opts.rpcUrl);
        thisCommand.setOptionValue('network', 'custom');
    } else if (opts.network === 'custom') {
        logger.error('Error: --rpc-url is required when using --network custom');
        process.exit(1);
    }
    // Block manually private key on mainnet
    if (opts.privateKey! && chainList[opts.network].testnet === false) {
        logger.error("Using private key on mainnet is not allowed. Use the secret keystore or a ledger instead.");
        process.exit(1);
    }
    // Activate json output if --json is provided
    logger.setJsonMode(opts.json);
});

program.hook("preAction", () => {
    const opts = program.opts();
    // Ensure privateKey is set if opts.secret or ledger is provided
    if (opts.secretName) {
        program.setOptionValue('privateKey', opts.secretName)
    } else if (opts.ledger) {
        program.setOptionValue('privateKey', 'ledger')
    }
});
export type SuzakuCliProgram = typeof program;

program
    .command('verify-abi')
    .description('Verify that a contract at a given address matches the expected Suzaku ABI (5% tolerance)')
    .addArgument(ArgAddress("address", "Contract address to test"))
    .argument('abi', 'ABI name to test')
    .asyncAction(async (client, address, abi) => {
        const contractGetters: Partial<CurriedSuzakuContractMap<typeof client>> = {
            L1Registry: (a) => getL1Registry(client, a),
            L1Middleware: (a) => getL1Middleware(client, a),
            VaultTokenized: (a) => getVaultTokenized(client, a),
            DefaultCollateral: (a) => getDefaultCollateral(client, a),
            L1RestakeDelegator: (a) => getL1RestakeDelegator(client, a),
            VaultManager: (a) => getVaultManager(client, a),
            OperatorL1OptInService: (a) => getOperatorL1OptInService(client, a),
            OperatorRegistry: (a) => getOperatorRegistry(client, a),
            OperatorVaultOptInService: (a) => getOperatorVaultOptInService(client, a),
            PoASecurityModule: (a) => getPoASecurityModule(client, a),
            UptimeTracker: (a) => getUptimeTracker(client, a),
            VaultFactory: (a) => getVaultFactory(client, a),
            BalancerValidatorManager: (a) => getBalancerValidatorManager(client, a),
            ValidatorManager: (a) => getValidatorManager(client, a),
            AccessControl: (a) => getAccessControl(client, a),
            RewardsNativeToken: (a) => getRewardsNativeToken(client, a),
            ERC20: (a) => getERC20(client, a),
            KiteStakingManager: (a) => getKiteStakingManager(client, a),
            StakingVault: (a) => getStakingVault(client, a),
        };
        const getter = contractGetters[abi as SuzakuABINames];
        if (!getter) throw new Error(`Unknown contract: ${abi}`);
        await getter(address);
        logger.log(`Verified ABI for contract ${abi} at address ${address} ✅`);
    });

/* --------------------------------------------------
* Common Args
* -------------------------------------------------- */

// Contract
export const argValidatorManagerAddress = ArgAddress("validatorManagerAddress", "L1 validator manager contract address");

// EOA


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
    .asyncAction({ signer: true }, async (client, subnetID, targetBalance, options) => {
        const opts = program.opts();
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

addL1Commands(program);
addMiddlewareCommands(program);
addVaultManagerCommands(program);
addVaultCommands(program);
addOperatorRegistryCommands(program);
addOperatorOptInCommands(program);
addValidatorManagerCommands(program);
addBalancerCommands(program);
addPOACommands(program);
kiteStakingManagerCommands(program);
addStakingVaultCommands(program);
addUptimeCommands(program);
rewardsCmd(program);
addAccessControlCmd(program);


addKeyStoreCommands(
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



const ledgerCmd = program
    .command("ledger")
    .description("Commands for ledger")

ledgerCmd
    .command("addresses")
    .description("Get ledger addresses")
    .asyncAction(async () => {
        const opts = program.opts();
        const client = await generateClient(opts.network, 'ledger');
        logger.log(client.addresses);
    });

ledgerCmd
    .command('fix-usb-rules')
    .description('Fix ledger usb rules on linux')
    .asyncAction(async (client,) => {
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
    .asyncAction(async (client, safeAddress) => {
        logger.log((await client.safe!.getNonce()).toString());
    });

safeCmd
    .command("get-role")
    .description("Get user role in the safe")
    .addOption(OptAddress("--account <account>", "Account address to check"))
    .asyncAction({ signer: true }, async (client, options) => {
        const addressToCheck = options.account || client.addresses.C;
        const owners = await client.safe!.getOwners()
        const delegates = await client.safe!.apiKit!.getSafeDelegates({ safeAddress: program.opts().safe! })
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
    .asyncAction({ signer: true }, async (client, chainName, genesisFile, options) => {
        const subnetId = await createSubnet({ client: client })
        const genesisData = readFileSync(genesisFile).toString('utf-8');
        const chainId = await createChain({
            client: client,
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
    .addOption(new Option('--validatorclient <validatorclient>', 'Validator client file path (json)').default([]).argParser(collectMultiple(String)).makeOptionMandatory())
    .addOption(OptCB58('--convertTx <convertTx>', 'Existing convert transaction hash to reuse'))
    .addOption(new Option('--init-vmc', 'Initialize the VMC before conversion'))
    .asyncAction({ signer: true }, async (client, subnetId, chainId, validatorManagerAddress, vmcChainId, options) => {
        // const validatorManager = await getValidatorManager(client, validatorManagerAddress)
        await convertSubnetToL1({ client: client, subnetId, chainId, validatorManager: validatorManagerAddress, validatorManagerBlockchainID: vmcChainId, validators: options.validatorclient.map(v => JSON.parse(readFileSync(v).toString('utf-8'))), convertTx: options.convertTx, init: options.initVmc })
    });

program
    .command("help-all")
    .description("Display help for all commands and sub-commands")
    .action(() => {
        console.log(`Suzaku CLI - version ${program.version()}`);
        console.log(program.description());
        console.log("Commands:\n");
        printIndentedHelp(program);
    });

program
    .command("completion install")
    .description("Install autocompletion for Bash/Zsh")
    .action(() => installCompletion(program));

program
    .command("__complete")
    .description("internal completion helper")
    .option("--line <line>")
    .action(({ line }) => {
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
