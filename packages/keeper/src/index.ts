#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';

// Load Docker secrets from /run/secrets/ into process.env.
// Env vars take precedence — secret files are only used if the var is unset.
const DOCKER_SECRETS: Record<string, string> = {
    pk: 'PK',
    pchain_tx_private_key: 'PCHAIN_TX_PRIVATE_KEY',
};

for (const [secretName, envVar] of Object.entries(DOCKER_SECRETS)) {
    if (process.env[envVar]) continue;
    const path = `/run/secrets/${secretName}`;
    if (existsSync(path)) {
        process.env[envVar] = readFileSync(path, 'utf-8').trim();
    }
}

import { Command, Option } from '@commander-js/extra-typings';
import { generateClient } from 'suzaku-cli/dist/client';
import { getConfig } from 'suzaku-cli/dist/config';
import { chainList, setCustomChainRpcUrl } from 'suzaku-cli/dist/lib/chainList';
import { ParserPrivateKey, ParserNumber, ArgAddress, ParserHex } from 'suzaku-cli/dist/lib/cliParser';
import { keeperRun, keeperWatch } from './keeper';
import { Monitor } from './monitor';
import { startServer } from './server';
import { Hex } from 'viem';

const networkChoices = Object.keys(chainList) as [string, ...string[]];

const program = new Command()
    .name('suzaku-keeper')
    .description('Keeper bot for Suzaku StakingVault operations')
    .version('0.1.0')
    .addOption(new Option('-n, --network <network>', 'Chain selector').choices(networkChoices).default('mainnet').env('NETWORK'))
    .addOption(new Option('-r, --rpc-url <rpcUrl>', 'RPC URL (automatically sets --network custom)').env('RPC_URL'))
    .addOption(new Option('-k, --private-key <pk>', 'EVM private key (hex)').env('PK').argParser(ParserPrivateKey))
    .addOption(new Option('-w, --wait <n>', 'Confirmations to wait').default(2).argParser(ParserNumber))
    .addOption(new Option('--skip-abi-validation', 'Skip contract ABI validation').env('SKIP_ABI_VALIDATION'))
    .addOption(new Option('--metrics-port <port>', 'Prometheus metrics port (0 to disable)').default(9090).env('METRICS_PORT').argParser(ParserNumber))
    .addOption(new Option('--alert-webhook <url>', 'Alert webhook URL').env('ALERT_WEBHOOK_URL'))
    .addOption(new Option('--alert-solvency-threshold <n>', 'Solvency deviation threshold').default(0.01).argParser(Number))
    .addOption(new Option('--alert-epoch-lag <n>', 'Epoch lag threshold').default(2).argParser(ParserNumber))
    .addOption(new Option('--alert-queue-depth <n>', 'Queue depth threshold').default(100).argParser(ParserNumber))
    .addOption(new Option('--alert-consecutive-failures <n>', 'Consecutive failures threshold').default(3).argParser(ParserNumber))
    .addOption(new Option('--alert-exit-debt-bips <n>', 'Exit debt bips threshold').default(500).argParser(ParserNumber))
    .addOption(new Option('--alert-tick-duration <ms>', 'Tick duration alert threshold in ms (default: pollInterval * 0.8 * 1000)').env('ALERT_TICK_DURATION_MS').argParser(ParserNumber));

program.hook('preAction', async (thisCommand) => {
    const opts = program.opts();
    if (opts.rpcUrl) {
        await setCustomChainRpcUrl(opts.rpcUrl);
        thisCommand.setOptionValue('network', 'custom');
    } else if (opts.network === 'custom') {
        console.error('Error: --rpc-url is required when using --network custom');
        process.exit(1);
    }

    // C3: Guard against raw hex private keys on mainnet (post-RPC resolution)
    const resolvedChain = chainList[opts.network as string] ?? chainList.custom;
    if (resolvedChain && !resolvedChain.testnet && opts.privateKey && (opts.privateKey as string).startsWith('0x')) {
        console.error('Error: Raw hex private key on mainnet is not allowed. Use Docker secrets instead.');
        process.exit(1);
    }
});

program
    .command('run')
    .description('Single keeper run: process epoch, prepare withdrawals, complete removals, cleanup queue')
    .addArgument(ArgAddress('stakingVaultAddress', 'StakingVault contract address'))
    .addOption(new Option('--harvest', 'Also run harvest this invocation'))
    .addOption(new Option('--pchain-tx-private-key <pchainTxPrivateKey>', 'P-Chain private key for completing registrations/removals').env('PCHAIN_TX_PRIVATE_KEY').argParser(ParserPrivateKey))
    .addOption(new Option('--core', 'Run core operations only').conflicts('completions'))
    .addOption(new Option('--completions', 'Run P-Chain completions only').conflicts('core'))
    .addOption(new Option('--uptime-blockchain-id <uptimeBlockchainID>', 'Blockchain ID for uptime proofs (auto-read from storage if omitted)').env('UPTIME_BLOCKCHAIN_ID').argParser((v: string) => ParserHex(v)))
    .action(async (stakingVaultAddress, options) => {
        const opts = program.opts();
        const client = await generateClient(opts.network as any, opts.privateKey as Hex);
        const config = getConfig(client, opts.wait, opts.skipAbiValidation);
        const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

        const pchainClient = options.pchainTxPrivateKey
            ? await generateClient(opts.network as any, options.pchainTxPrivateKey as Hex)
            : undefined;

        const monitor = createMonitor(opts);
        const server = opts.metricsPort > 0 ? startServer(monitor, opts.metricsPort, Infinity) : undefined;

        try {
            await keeperRun(client, pchainClient, config, stakingVault, {
                harvest: options.harvest,
                coreOnly: options.core,
                completionsOnly: options.completions,
                rpcUrl: opts.rpcUrl,
                uptimeBlockchainID: options.uptimeBlockchainId as Hex | undefined,
            });
        } finally {
            server?.close();
        }
    });

program
    .command('watch')
    .description('Long-running keeper daemon with periodic polling')
    .addArgument(ArgAddress('stakingVaultAddress', 'StakingVault contract address'))
    .addOption(new Option('--poll-interval <seconds>', 'Poll interval in seconds').default(1800).argParser(ParserNumber))
    .addOption(new Option('--harvest-interval <seconds>', 'Harvest interval in seconds').default(43200).argParser(ParserNumber))
    .addOption(new Option('--tick-timeout <seconds>', 'Tick timeout in seconds (0=disabled)').default(0).env('TICK_TIMEOUT').argParser(ParserNumber))
    .addOption(new Option('--pchain-tx-private-key <pchainTxPrivateKey>', 'P-Chain private key for completing registrations/removals').env('PCHAIN_TX_PRIVATE_KEY').argParser(ParserPrivateKey))
    .addOption(new Option('--core', 'Run core operations only').conflicts('completions'))
    .addOption(new Option('--completions', 'Run P-Chain completions only').conflicts('core'))
    .addOption(new Option('--uptime-blockchain-id <uptimeBlockchainID>', 'Blockchain ID for uptime proofs (auto-read from storage if omitted)').env('UPTIME_BLOCKCHAIN_ID').argParser((v: string) => ParserHex(v)))
    .action(async (stakingVaultAddress, options) => {
        const opts = program.opts();
        const client = await generateClient(opts.network as any, opts.privateKey as Hex);
        const config = getConfig(client, opts.wait, opts.skipAbiValidation);
        const stakingVault = await config.contracts.StakingVault(stakingVaultAddress);

        const pchainClient = options.pchainTxPrivateKey
            ? await generateClient(opts.network as any, options.pchainTxPrivateKey as Hex)
            : undefined;

        const monitor = createMonitor(opts, options.pollInterval);
        let server: ReturnType<typeof startServer> | undefined;
        if (opts.metricsPort > 0) {
            server = startServer(monitor, opts.metricsPort, options.pollInterval);
        }

        const stopWatchers = monitor.startEventWatchers(client, stakingVaultAddress);

        const cleanup = () => { stopWatchers(); server?.close(); };

        await keeperWatch(client, pchainClient, config, stakingVault, {
            pollInterval: options.pollInterval,
            harvestInterval: options.harvestInterval,
            coreOnly: options.core,
            completionsOnly: options.completions,
            rpcUrl: opts.rpcUrl,
            uptimeBlockchainID: options.uptimeBlockchainId as Hex | undefined,
            monitor,
            onCleanup: cleanup,
            tickTimeoutMs: options.tickTimeout > 0 ? options.tickTimeout * 1000 : 0,
        });
    });

function createMonitor(opts: ReturnType<typeof program.opts>, pollIntervalSeconds?: number): Monitor {
    return new Monitor({
        solvencyDeviation: opts.alertSolvencyThreshold,
        epochLag: opts.alertEpochLag,
        queueDepth: opts.alertQueueDepth,
        consecutiveFailures: opts.alertConsecutiveFailures,
        exitDebtBips: opts.alertExitDebtBips,
        tickDurationMs: opts.alertTickDuration ?? (pollIntervalSeconds ? pollIntervalSeconds * 0.8 * 1000 : Infinity),
    }, opts.alertWebhook);
}

program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
});
