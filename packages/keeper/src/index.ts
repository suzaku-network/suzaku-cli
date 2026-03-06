#!/usr/bin/env node

import 'dotenv/config';
import { Command, Option } from '@commander-js/extra-typings';
import { generateClient } from 'suzaku-cli/dist/client';
import { getConfig } from 'suzaku-cli/dist/config';
import { chainList } from 'suzaku-cli/dist/lib/chainList';
import { ParserPrivateKey, ParserNumber, ArgAddress, ParserHex } from 'suzaku-cli/dist/lib/cliParser';
import { keeperRun, keeperWatch } from './keeper';
import { Hex } from 'viem';

const networkChoices = Object.keys(chainList) as [string, ...string[]];

const program = new Command()
    .name('suzaku-keeper')
    .description('Keeper bot for Suzaku StakingVault operations')
    .version('0.1.0')
    .addOption(new Option('-n, --network <network>', 'Chain selector').choices(networkChoices).default('mainnet').env('NETWORK'))
    .addOption(new Option('-k, --private-key <pk>', 'EVM private key (hex)').env('PK').argParser(ParserPrivateKey))
    .addOption(new Option('-w, --wait <n>', 'Confirmations to wait').default(2).argParser(ParserNumber))
    .addOption(new Option('--skip-abi-validation', 'Skip contract ABI validation'));

program
    .command('run')
    .description('Single keeper run: process epoch, prepare withdrawals, complete removals, cleanup queue')
    .addArgument(ArgAddress('stakingVaultAddress', 'StakingVault contract address'))
    .addOption(new Option('--harvest', 'Also run harvest this invocation'))
    .addOption(new Option('--pchain-tx-private-key <pchainTxPrivateKey>', 'P-Chain private key for completing registrations/removals').env('PCHAIN_TX_PRIVATE_KEY').argParser(ParserPrivateKey))
    .addOption(new Option('--core', 'Run core operations only').conflicts('completions'))
    .addOption(new Option('--completions', 'Run P-Chain completions only').conflicts('core'))
    .addOption(new Option('--rpc-url <rpcUrl>', 'RPC URL for uptime queries (delegator registration completion)').env('RPC_URL'))
    .addOption(new Option('--uptime-blockchain-id <uptimeBlockchainID>', 'Blockchain ID for uptime proofs (auto-read from storage if omitted)').env('UPTIME_BLOCKCHAIN_ID').argParser((v: string) => ParserHex(v)))
    .action(async (stakingVaultAddress, options) => {
        const opts = program.opts();
        const client = await generateClient(opts.network as any, opts.privateKey as Hex);
        const config = getConfig(client, opts.wait, opts.skipAbiValidation);
        const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

        const pchainClient = options.pchainTxPrivateKey
            ? await generateClient(opts.network as any, options.pchainTxPrivateKey as Hex)
            : undefined;

        await keeperRun(client, pchainClient, config, stakingVault, {
            harvest: options.harvest,
            coreOnly: options.core,
            completionsOnly: options.completions,
            rpcUrl: options.rpcUrl,
            uptimeBlockchainID: options.uptimeBlockchainId as Hex | undefined,
        });
    });

program
    .command('watch')
    .description('Long-running keeper daemon with periodic polling')
    .addArgument(ArgAddress('stakingVaultAddress', 'StakingVault contract address'))
    .addOption(new Option('--poll-interval <seconds>', 'Poll interval in seconds').default(1800).argParser(ParserNumber))
    .addOption(new Option('--harvest-interval <seconds>', 'Harvest interval in seconds').default(43200).argParser(ParserNumber))
    .addOption(new Option('--pchain-tx-private-key <pchainTxPrivateKey>', 'P-Chain private key for completing registrations/removals').env('PCHAIN_TX_PRIVATE_KEY').argParser(ParserPrivateKey))
    .addOption(new Option('--core', 'Run core operations only').conflicts('completions'))
    .addOption(new Option('--completions', 'Run P-Chain completions only').conflicts('core'))
    .addOption(new Option('--rpc-url <rpcUrl>', 'RPC URL for uptime queries (delegator registration completion)').env('RPC_URL'))
    .addOption(new Option('--uptime-blockchain-id <uptimeBlockchainID>', 'Blockchain ID for uptime proofs (auto-read from storage if omitted)').env('UPTIME_BLOCKCHAIN_ID').argParser((v: string) => ParserHex(v)))
    .action(async (stakingVaultAddress, options) => {
        const opts = program.opts();
        const client = await generateClient(opts.network as any, opts.privateKey as Hex);
        const config = getConfig(client, opts.wait, opts.skipAbiValidation);
        const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

        const pchainClient = options.pchainTxPrivateKey
            ? await generateClient(opts.network as any, options.pchainTxPrivateKey as Hex)
            : undefined;

        await keeperWatch(client, pchainClient, config, stakingVault, {
            pollInterval: options.pollInterval,
            harvestInterval: options.harvestInterval,
            coreOnly: options.core,
            completionsOnly: options.completions,
            rpcUrl: options.rpcUrl,
            uptimeBlockchainID: options.uptimeBlockchainId as Hex | undefined,
        });
    });

program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
});
