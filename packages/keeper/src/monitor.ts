import { Registry, Gauge, Counter, collectDefaultMetrics } from 'prom-client';
import { formatUnits, type Address, type Hex, type WatchContractEventReturnType } from 'viem';
import type { ExtendedWalletClient } from 'suzaku-cli/dist/client';
import { SafeSuzakuContract } from 'suzaku-cli/dist/lib/viemUtils';
import StakingVaultABI from 'suzaku-cli/dist/abis/StakingVault';
import type { KeeperRunResult } from './keeper';
import * as https from 'node:https';
import * as http from 'node:http';

// ── Alert thresholds ─────────────────────────────────────────────────

export interface AlertThresholds {
    solvencyDeviation: number;   // e.g. 0.01 = 1%
    epochLag: number;            // e.g. 2
    queueDepth: number;          // e.g. 100
    consecutiveFailures: number; // e.g. 3
    exitDebtBips: number;        // e.g. 500 = 5% of allocation
}

interface AlertPayload {
    severity: 'warning' | 'critical' | 'resolved';
    title: string;
    description: string;
    value: number;
    threshold: number;
    timestamp: string;
    vault: string;
}

// ── Monitor ──────────────────────────────────────────────────────────

export class Monitor {
    readonly registry: Registry;
    private thresholds: AlertThresholds;
    private webhookUrl?: string;
    private vaultAddress = '';

    // Alert state tracking (key → currently alerting)
    private alertState = new Map<string, boolean>();
    private _consecutiveFailures = 0;
    private _lastTickTimestamp = 0;

    // ── Vault health gauges ──────────────────────────────────────────

    private solvencyRatio: Gauge;
    private exchangeRate: Gauge;
    private tvl: Gauge;
    private availableStake: Gauge;
    private pendingWithdrawals: Gauge;
    private queueDepth: Gauge;
    private epochLag: Gauge;
    private pendingProtocolFees: Gauge;
    private vaultPaused: Gauge;

    // ── Per-operator gauges ──────────────────────────────────────────

    private operatorExitDebt: Gauge;
    private operatorActiveStake: Gauge;
    private operatorAllocationBips: Gauge;
    private operatorAccruedFees: Gauge;
    private operatorValidatorCount: Gauge;
    private operatorDelegatorCount: Gauge;

    // ── Keeper internal gauges ───────────────────────────────────────

    private lastTickTimestamp: Gauge;
    private tickDurationMs: Gauge;
    private tickErrors: Counter;
    private epochsProcessed: Counter;
    private withdrawalsPrepared: Counter;
    private harvests: Counter;
    private queueCleanups: Counter;
    private validatorRegsCompleted: Counter;
    private delegatorRegsCompleted: Counter;
    private validatorRemovals: Counter;
    private delegatorRemovals: Counter;

    // ── Event counters ───────────────────────────────────────────────

    private eventsDeposited: Counter;
    private eventsWithdrawalRequested: Counter;
    private eventsWithdrawalClaimed: Counter;
    private eventsEpochProcessed: Counter;
    private eventsHarvested: Counter;
    private harvestTotalRewards: Gauge;

    constructor(thresholds: AlertThresholds, webhookUrl?: string) {
        this.thresholds = thresholds;
        this.webhookUrl = webhookUrl;
        this.registry = new Registry();

        collectDefaultMetrics({ register: this.registry });

        // Vault health
        this.solvencyRatio = new Gauge({ name: 'suzaku_solvency_ratio', help: 'getTotalPooledStake / totalSupply', registers: [this.registry] });
        this.exchangeRate = new Gauge({ name: 'suzaku_exchange_rate', help: 'Vault exchange rate', registers: [this.registry] });
        this.tvl = new Gauge({ name: 'suzaku_tvl', help: 'Total value locked (native token)', registers: [this.registry] });
        this.availableStake = new Gauge({ name: 'suzaku_available_stake', help: 'Available stake (native token)', registers: [this.registry] });
        this.pendingWithdrawals = new Gauge({ name: 'suzaku_pending_withdrawals', help: 'Pending withdrawals (native token)', registers: [this.registry] });
        this.queueDepth = new Gauge({ name: 'suzaku_queue_depth', help: 'Withdrawal queue depth', registers: [this.registry] });
        this.epochLag = new Gauge({ name: 'suzaku_epoch_lag', help: 'Epochs behind (current - last processed)', registers: [this.registry] });
        this.pendingProtocolFees = new Gauge({ name: 'suzaku_pending_protocol_fees', help: 'Pending protocol fees (native token)', registers: [this.registry] });
        this.vaultPaused = new Gauge({ name: 'suzaku_vault_paused', help: 'Vault paused state (0/1)', registers: [this.registry] });

        // Per-operator
        this.operatorExitDebt = new Gauge({ name: 'suzaku_operator_exit_debt', help: 'Operator exit debt (native token)', labelNames: ['operator'], registers: [this.registry] });
        this.operatorActiveStake = new Gauge({ name: 'suzaku_operator_active_stake', help: 'Operator active stake (native token)', labelNames: ['operator'], registers: [this.registry] });
        this.operatorAllocationBips = new Gauge({ name: 'suzaku_operator_allocation_bips', help: 'Operator allocation in basis points', labelNames: ['operator'], registers: [this.registry] });
        this.operatorAccruedFees = new Gauge({ name: 'suzaku_operator_accrued_fees', help: 'Operator accrued fees (native token)', labelNames: ['operator'], registers: [this.registry] });
        this.operatorValidatorCount = new Gauge({ name: 'suzaku_operator_validator_count', help: 'Operator validator count', labelNames: ['operator'], registers: [this.registry] });
        this.operatorDelegatorCount = new Gauge({ name: 'suzaku_operator_delegator_count', help: 'Operator delegator count', labelNames: ['operator'], registers: [this.registry] });

        // Keeper internal
        this.lastTickTimestamp = new Gauge({ name: 'suzaku_keeper_last_tick_timestamp', help: 'Unix timestamp of last tick', registers: [this.registry] });
        this.tickDurationMs = new Gauge({ name: 'suzaku_keeper_tick_duration_ms', help: 'Duration of last tick in ms', registers: [this.registry] });
        this.tickErrors = new Counter({ name: 'suzaku_keeper_tick_errors_total', help: 'Total tick errors', registers: [this.registry] });
        this.epochsProcessed = new Counter({ name: 'suzaku_keeper_epochs_processed_total', help: 'Total epochs processed', registers: [this.registry] });
        this.withdrawalsPrepared = new Counter({ name: 'suzaku_keeper_withdrawals_prepared_total', help: 'Total prepareWithdrawals calls', registers: [this.registry] });
        this.harvests = new Counter({ name: 'suzaku_keeper_harvests_total', help: 'Total harvests', registers: [this.registry] });
        this.queueCleanups = new Counter({ name: 'suzaku_keeper_queue_cleanups_total', help: 'Total queue cleanup entries', registers: [this.registry] });
        this.validatorRegsCompleted = new Counter({ name: 'suzaku_keeper_validator_regs_completed_total', help: 'Total validator registrations completed', registers: [this.registry] });
        this.delegatorRegsCompleted = new Counter({ name: 'suzaku_keeper_delegator_regs_completed_total', help: 'Total delegator registrations completed', registers: [this.registry] });
        this.validatorRemovals = new Counter({ name: 'suzaku_keeper_validator_removals_total', help: 'Total validator removals completed', registers: [this.registry] });
        this.delegatorRemovals = new Counter({ name: 'suzaku_keeper_delegator_removals_total', help: 'Total delegator removals completed', registers: [this.registry] });

        // Event counters
        this.eventsDeposited = new Counter({ name: 'suzaku_events_deposited_total', help: 'Deposited events observed', registers: [this.registry] });
        this.eventsWithdrawalRequested = new Counter({ name: 'suzaku_events_withdrawal_requested_total', help: 'WithdrawalRequested events observed', registers: [this.registry] });
        this.eventsWithdrawalClaimed = new Counter({ name: 'suzaku_events_withdrawal_claimed_total', help: 'WithdrawalClaimed events observed', registers: [this.registry] });
        this.eventsEpochProcessed = new Counter({ name: 'suzaku_events_epoch_processed_total', help: 'EpochProcessed events observed', registers: [this.registry] });
        this.eventsHarvested = new Counter({ name: 'suzaku_events_harvested_total', help: 'Harvested events observed', registers: [this.registry] });
        this.harvestTotalRewards = new Gauge({ name: 'suzaku_harvest_total_rewards', help: 'Total rewards from last harvest event (native token)', registers: [this.registry] });
    }

    // ── Vault metrics collection ─────────────────────────────────────

    async collectVaultMetrics(stakingVault: SafeSuzakuContract['StakingVault']): Promise<void> {
        this.vaultAddress = stakingVault.address;

        const [
            totalPooledStake,
            totalSupply,
            exchangeRate,
            availableStake,
            pendingWithdrawals,
            queueLength,
            queueHead,
            currentEpoch,
            lastEpochProcessed,
            pendingProtocolFees,
            paused,
        ] = await stakingVault.multicall([
            'getTotalPooledStake',
            'totalSupply',
            'getExchangeRate',
            'getAvailableStake',
            'getPendingWithdrawals',
            'getWithdrawalQueueLength',
            'getQueueHead',
            'getCurrentEpoch',
            'getLastEpochProcessed',
            'getPendingProtocolFees',
            'paused',
        ]);

        const toFloat = (val: bigint) => Number(formatUnits(val, 18));

        const supply = toFloat(totalSupply);
        const solvency = supply > 0 ? toFloat(totalPooledStake) / supply : 1;

        this.solvencyRatio.set(solvency);
        this.exchangeRate.set(toFloat(exchangeRate));
        this.tvl.set(toFloat(totalPooledStake));
        this.availableStake.set(toFloat(availableStake));
        this.pendingWithdrawals.set(toFloat(pendingWithdrawals));
        this.queueDepth.set(Number(queueLength - queueHead));
        this.epochLag.set(Number(currentEpoch - lastEpochProcessed));
        this.pendingProtocolFees.set(toFloat(pendingProtocolFees));
        this.vaultPaused.set(paused ? 1 : 0);

        // Per-operator metrics
        const operatorList = await stakingVault.read.getOperatorList();
        for (const operator of operatorList) {
            try {
                const [info, exitDebt, validators, delegators] = await Promise.all([
                    stakingVault.read.getOperatorInfo([operator]),
                    stakingVault.read.getOperatorExitDebt([operator]),
                    stakingVault.read.getOperatorValidators([operator]),
                    stakingVault.read.getOperatorDelegators([operator]),
                ]);

                const label = { operator };
                this.operatorExitDebt.labels(label).set(toFloat(exitDebt));
                this.operatorActiveStake.labels(label).set(toFloat(info.activeStake));
                this.operatorAllocationBips.labels(label).set(Number(info.allocationBips));
                this.operatorAccruedFees.labels(label).set(toFloat(info.accruedFees));
                this.operatorValidatorCount.labels(label).set(validators.length);
                this.operatorDelegatorCount.labels(label).set(delegators.length);
            } catch {
                // Non-critical — skip this operator
            }
        }
    }

    // ── Record tick result ───────────────────────────────────────────

    recordTickResult(result: KeeperRunResult, durationMs: number, failed: boolean): void {
        const now = Date.now();
        this._lastTickTimestamp = now;
        this.lastTickTimestamp.set(Math.floor(now / 1000));
        this.tickDurationMs.set(durationMs);

        if (failed) {
            this._consecutiveFailures++;
            this.tickErrors.inc();
        } else {
            this._consecutiveFailures = 0;
        }

        if (result.epochProcessed) this.epochsProcessed.inc();
        if (result.prepareWithdrawalsCalled) this.withdrawalsPrepared.inc();
        if (result.harvestCalled) this.harvests.inc();
        if (result.queueCleanupCount > 0) this.queueCleanups.inc(result.queueCleanupCount);
        if (result.validatorRegistrationsCompleted > 0) this.validatorRegsCompleted.inc(result.validatorRegistrationsCompleted);
        if (result.delegatorRegistrationsCompleted > 0) this.delegatorRegsCompleted.inc(result.delegatorRegistrationsCompleted);
        if (result.validatorRemovalsCompleted > 0) this.validatorRemovals.inc(result.validatorRemovalsCompleted);
        if (result.delegatorRemovalsCompleted > 0) this.delegatorRemovals.inc(result.delegatorRemovalsCompleted);
    }

    // ── Event watchers ───────────────────────────────────────────────

    startEventWatchers(
        client: ExtendedWalletClient,
        stakingVaultAddress: Address
    ): () => void {
        const unwatchers: WatchContractEventReturnType[] = [];
        const abi = StakingVaultABI;
        const pollingInterval = 2000;

        unwatchers.push(client.watchContractEvent({
            address: stakingVaultAddress,
            abi,
            eventName: 'StakingVault__Deposited' as any,
            pollingInterval,
            onLogs: () => { this.eventsDeposited.inc(); },
        }));

        unwatchers.push(client.watchContractEvent({
            address: stakingVaultAddress,
            abi,
            eventName: 'StakingVault__WithdrawalRequested' as any,
            pollingInterval,
            onLogs: () => { this.eventsWithdrawalRequested.inc(); },
        }));

        unwatchers.push(client.watchContractEvent({
            address: stakingVaultAddress,
            abi,
            eventName: 'StakingVault__WithdrawalClaimed' as any,
            pollingInterval,
            onLogs: () => { this.eventsWithdrawalClaimed.inc(); },
        }));

        unwatchers.push(client.watchContractEvent({
            address: stakingVaultAddress,
            abi,
            eventName: 'StakingVault__EpochProcessed' as any,
            pollingInterval,
            onLogs: () => { this.eventsEpochProcessed.inc(); },
        }));

        unwatchers.push(client.watchContractEvent({
            address: stakingVaultAddress,
            abi,
            eventName: 'StakingVault__Harvested' as any,
            pollingInterval,
            onLogs: (logs: any[]) => {
                this.eventsHarvested.inc();
                if (logs.length > 0 && logs[0].args?.totalRewards != null) {
                    this.harvestTotalRewards.set(Number(formatUnits(logs[0].args.totalRewards, 18)));
                }
            },
        }));

        unwatchers.push(client.watchContractEvent({
            address: stakingVaultAddress,
            abi,
            eventName: 'Paused' as any,
            pollingInterval,
            onLogs: () => {
                this.vaultPaused.set(1);
                this.checkAlert('vaultPaused', true, 1, 0, 'Vault paused', 'critical');
            },
        }));

        unwatchers.push(client.watchContractEvent({
            address: stakingVaultAddress,
            abi,
            eventName: 'Unpaused' as any,
            pollingInterval,
            onLogs: () => {
                this.vaultPaused.set(0);
                this.checkAlert('vaultPaused', false, 0, 0, 'Vault unpaused');
            },
        }));

        return () => {
            for (const unwatch of unwatchers) {
                unwatch();
            }
        };
    }

    // ── Alerting ─────────────────────────────────────────────────────

    checkAlerts(): void {
        // Solvency deviation
        this.checkAlertFromGauge('solvency', this.solvencyRatio, (val) => Math.abs(val - 1.0) > this.thresholds.solvencyDeviation,
            'Solvency ratio drift', 'warning', this.thresholds.solvencyDeviation);

        // Epoch lag
        this.checkAlertFromGauge('epochLag', this.epochLag, (val) => val > this.thresholds.epochLag,
            'Epoch lag exceeded', 'warning', this.thresholds.epochLag);

        // Queue depth
        this.checkAlertFromGauge('queueDepth', this.queueDepth, (val) => val > this.thresholds.queueDepth,
            'Queue depth exceeded', 'warning', this.thresholds.queueDepth);

        // Consecutive failures
        this.checkAlert('consecutiveFailures',
            this._consecutiveFailures >= this.thresholds.consecutiveFailures,
            this._consecutiveFailures, this.thresholds.consecutiveFailures,
            'Consecutive tick failures', 'critical');

        // Vault paused (already handled via event watcher, but also check on tick)
        this.checkAlertFromGauge('vaultPaused', this.vaultPaused, (val) => val === 1,
            'Vault is paused', 'critical', 0);
    }

    private async checkAlertFromGauge(
        key: string, gauge: Gauge, condition: (val: number) => boolean,
        title: string, severity: 'warning' | 'critical', threshold: number
    ): Promise<void> {
        const val = (await gauge.get()).values[0]?.value ?? 0;
        this.checkAlert(key, condition(val), val, threshold, title, severity);
    }

    private checkAlert(
        key: string, isAlerting: boolean, value: number, threshold: number,
        title: string, severity: 'warning' | 'critical' = 'warning'
    ): void {
        const wasAlerting = this.alertState.get(key) ?? false;

        if (isAlerting && !wasAlerting) {
            this.alertState.set(key, true);
            this.fireWebhook({
                severity,
                title,
                description: `${title}: value=${value}, threshold=${threshold}`,
                value,
                threshold,
                timestamp: new Date().toISOString(),
                vault: this.vaultAddress,
            });
        } else if (!isAlerting && wasAlerting) {
            this.alertState.set(key, false);
            this.fireWebhook({
                severity: 'resolved',
                title: `${title} (resolved)`,
                description: `${title} resolved: value=${value}`,
                value,
                threshold,
                timestamp: new Date().toISOString(),
                vault: this.vaultAddress,
            });
        }
    }

    private fireWebhook(payload: AlertPayload): void {
        if (!this.webhookUrl) return;

        const body = JSON.stringify({
            ...payload,
            // Slack-compatible
            text: `[${payload.severity.toUpperCase()}] ${payload.title}: ${payload.description}`,
        });

        try {
            const url = new URL(this.webhookUrl);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.request(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            });
            req.on('error', () => {}); // fire-and-forget
            req.write(body);
            req.end();
        } catch {
            // Invalid URL or network error — don't crash the keeper
        }
    }

    // ── Health status ────────────────────────────────────────────────

    getHealthStatus(pollIntervalSeconds: number): { healthy: boolean; lastTickAge: number; consecutiveFailures: number } {
        const lastTickAge = this._lastTickTimestamp > 0
            ? (Date.now() - this._lastTickTimestamp) / 1000
            : 0;

        const healthy =
            this._consecutiveFailures < this.thresholds.consecutiveFailures &&
            (this._lastTickTimestamp === 0 || lastTickAge < pollIntervalSeconds * 3);

        return { healthy, lastTickAge, consecutiveFailures: this._consecutiveFailures };
    }
}
