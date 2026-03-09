# Metrics Reference

All metrics are exposed at `GET /metrics` in Prometheus text format. Node.js process metrics (heap, event loop lag) are included via `prom-client` defaults.

## Vault Health

Read from the StakingVault contract every tick via multicall.

| Metric | Type | What it means |
|--------|------|---------------|
| `suzaku_solvency_ratio` | gauge | `getTotalPooledStake() / totalSupply()`. Should be ~1.0. Measures whether the vault's token supply is fully backed by staked assets. Drift above 1 means extra rewards haven't been distributed; drift below 1 means the vault is undercollateralized. At 0, deposits are blocked entirely (insolvency gate) |
| `suzaku_exchange_rate` | gauge | Share-to-asset conversion rate from `getExchangeRate()`. Starts at 1.0 and grows as rewards accrue. A sudden drop indicates a loss event |
| `suzaku_tvl` | gauge | Total value locked in native token — `getTotalPooledStake()`. The sum of all staked assets including those delegated to validators |
| `suzaku_available_stake` | gauge | Liquid native token in the vault's buffer — `getAvailableStake()`. This is what's immediately available for withdrawals without needing to unstake from validators. When this drops low, `prepareWithdrawals` must initiate validator/delegator removals, adding 14+ day delays |
| `suzaku_pending_withdrawals` | gauge | Total native token requested for withdrawal but not yet claimable — `getPendingWithdrawals()`. High values mean users are waiting |
| `suzaku_queue_depth` | gauge | Number of withdrawal requests in the FIFO queue (`getWithdrawalQueueLength() - getQueueHead()`). The queue is head-of-line blocking — one large unfulfillable request blocks everything behind it |
| `suzaku_epoch_lag` | gauge | `getCurrentEpoch() - getLastEpochProcessed()`. How many epochs behind the vault is. The keeper calls `processEpoch()` to advance this. Each call processes up to 350 withdrawal entries, so large backlogs take multiple iterations. While epochs are behind, new withdrawal requests can't be fulfilled |
| `suzaku_pending_protocol_fees` | gauge | Unclaimed protocol fees in native token — `getPendingProtocolFees()`. Requires `VAULT_ADMIN_ROLE` to claim (the keeper can't claim these, it just tracks them) |
| `suzaku_vault_paused` | gauge | 0 = active, 1 = paused. When paused, deposits and withdrawal requests are blocked. Emergency state set by the vault admin |

## Per-Operator (label: `operator`)

Each operator is a separate label value. Tracked per tick by querying `getOperatorInfo`, `getOperatorExitDebt`, `getOperatorValidators`, `getOperatorDelegators`.

| Metric | Type | What it means |
|--------|------|---------------|
| `suzaku_operator_active_stake` | gauge | native token actively staked through this operator's validators/delegators |
| `suzaku_operator_exit_debt` | gauge | native token owed by this operator due to slashing or early exits. At 50% of the operator's allocation, the operator is frozen on-chain |
| `suzaku_operator_allocation_bips` | gauge | Operator's share of the vault's total stake in basis points (10000 = 100%). Set by the vault admin |
| `suzaku_operator_accrued_fees` | gauge | Unclaimed operator fees in native token |
| `suzaku_operator_validator_count` | gauge | Number of active validators for this operator |
| `suzaku_operator_delegator_count` | gauge | Number of active delegators for this operator |

## Keeper Internals

| Metric | Type | What it means |
|--------|------|---------------|
| `suzaku_keeper_last_tick_timestamp` | gauge | Unix timestamp of the last completed tick |
| `suzaku_keeper_tick_duration_ms` | gauge | How long the last tick took in milliseconds |
| `suzaku_keeper_tick_errors_total` | counter | Total ticks that failed with an unhandled error |
| `suzaku_keeper_epochs_processed_total` | counter | Total successful `processEpoch` calls |
| `suzaku_keeper_withdrawals_prepared_total` | counter | Total `prepareWithdrawals` calls |
| `suzaku_keeper_harvests_total` | counter | Total harvest runs |
| `suzaku_keeper_queue_cleanups_total` | counter | Total withdrawal entries cleaned from the queue head |
| `suzaku_keeper_validator_regs_completed_total` | counter | Validator registrations completed (P-Chain) |
| `suzaku_keeper_delegator_regs_completed_total` | counter | Delegator registrations completed (P-Chain) |
| `suzaku_keeper_validator_removals_total` | counter | Validator removals completed (P-Chain) |
| `suzaku_keeper_delegator_removals_total` | counter | Delegator removals completed (P-Chain) |

## On-Chain Events

Counters incremented by `watchContractEvent` listeners (watch mode only, polled every 2s).

| Metric | Type | What it means |
|--------|------|---------------|
| `suzaku_events_deposited_total` | counter | `StakingVault__Deposited` — someone deposited native token into the vault |
| `suzaku_events_withdrawal_requested_total` | counter | `StakingVault__WithdrawalRequested` — someone queued a withdrawal |
| `suzaku_events_withdrawal_claimed_total` | counter | `StakingVault__WithdrawalClaimed` — someone claimed a fulfilled withdrawal |
| `suzaku_events_epoch_processed_total` | counter | `StakingVault__EpochProcessed` — an epoch was processed (by this keeper or anyone) |
| `suzaku_events_harvested_total` | counter | `StakingVault__Harvested` — rewards were harvested |
| `suzaku_harvest_total_rewards` | gauge | native token from the last `Harvested` event's `totalRewards` field |
