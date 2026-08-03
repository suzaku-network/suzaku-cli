# Zenith Audit Followups

Keeper changes and CLI additions made to reflect remediations landed on the
`lst-kite` `zenith-audit` branch. Per-issue status is tracked upstream in
`lst-kite/docs-internal/zenith/STATUS.md`. Behavioral ground truth for each
remediation is the referenced commit in `lst-kite`.

This doc covers only the issues that required work in `suzaku-cli`. Issues
that were code fixes inside the vault with no keeper-side impact (e.g.
`#3`, `#14`, `#15`) are not listed here.

## #5: Third-party commission crystallization

Commit: `lst-kite/75d989d` (role-doc), `lst-kite/19d9a21` + others for the
behavior the crystallization complements.

Behavioral change: third-party delegations on vault-owned validators accrue
commission on the SM side (in `_redeemableValidatorRewards`) only when
something calls `claimDelegatorRewardsFor` on the SM. Without a keeper
duty, the vault would not pick up that commission during `harvest()`.

Keeper impact:

- New helper `claimDelegatorRewardsFor` in `suzaku-cli/src/kiteStaking.ts`.
- New module `suzaku-cli/packages/keeper/src/thirdParty.ts` with
  `crystallizeThirdPartyCommissions`. Enumerates vault-owned validators,
  log-scans SM `InitiatedDelegatorRegistration` events (7-day lookback,
  matching `findRemovalTxHash` convention), filters out delegations where
  the delegator is the vault itself, then calls
  `claimDelegatorRewardsFor(delegationID, false, 0)` on each. Reverts are
  swallowed (delegation may have been removed, no reward may have accrued).
- Hooked into `keeperRun` inside the harvest branch, before
  `batchedHarvest`, so the vault's next harvest picks up the newly credited
  commission in the same tick.
- New CLI flag `--no-third-party-crystallize` on both `run` and `watch`
  subcommands (commander `--no-X` convention; crystallization is on by
  default and the flag disables it).

Runbook: watch `suzaku_third_party_commissions_crystallized_total` rise
each harvest interval. If the error counter grows, inspect logs with
`LOG_LEVEL=debug` to see which delegationIDs are failing.

## #13: PendingAdded delegations

Commits: `lst-kite/06dfcae`, `lst-kite/a06a3e0` (tests only, no contract
fix).

Behavioral change: none. Vault skips PendingAdded delegations in removal
paths; recovery is permissionless `completeDelegatorRegistration`.

Keeper impact: none. The keeper already calls
`completeDelegatorRegistration` each tick when a delegator is in status
`PendingAdded` — see the `status !== 1` guard in `keeperRun`'s
delegator loop in `keeper.ts`. Do not disable this duty with
`--completions=false` for extended periods; it is the PendingAdded
recovery path.

## #17 / #28 / #29: prepareWithdrawals idempotency

Commits: `lst-kite/19d9a21`, `lst-kite/3540c38`, `lst-kite/fee8ad6` (doc).

Behavioral change: Phase 3 debt scoring in `_selectAndRemoveStake` is now
rate-limited to once per epoch via `lastDebtScoringEpoch`. Repeated calls
to `prepareWithdrawals` within a single epoch do not re-score debt;
paydown and accrual are both gated.

Keeper impact: none. The existing loop in `keeperRun` calls
`prepareWithdrawals` every tick when `getPendingWithdrawals() > 0n`; this
is now explicitly safe. Do not add guards to skip repeat calls within an
epoch; the rate limit already handles it. Resist the urge to "optimize"
that loop.

## #21: ValidatorRemovalAdopted watcher

Commit: `lst-kite/cf2a475`.

Behavioral change: when a third-party validator owner initiates removal on
the SM directly, the vault auto-adopts it on the next `prepareWithdrawals`
and emits `StakingVault__ValidatorRemovalAdopted(address indexed operator,
bytes32 indexed validationID, uint256 amount)`. No keeper action is
required to trigger the adoption.

Keeper impact:

- New watcher in `monitor.ts` inside `startEventWatchers` subscribes to
  `StakingVault__ValidatorRemovalAdopted`. Each event increments
  `suzaku_events_validator_removal_adopted_total` and logs `operator`,
  `validationID`, `amount` to stderr.

Runbook: a steady stream of adoptions suggests miscoordination with
external validator owners. Investigate whether the vault's operator setup
is using its own validators (expected) versus competing with external
owners (investigate governance).

## #23: Stranded reward recovery

Commits: `lst-kite/764d6bd` (two-layer fix), `lst-kite/9aa6584` (active-ID
guard).

Behavioral change: when `RewardVault` is underfunded at removal completion,
rewards stay in SM storage but the vault has already cleaned up tracking.
Two new permissionless recovery functions let anyone drain the stranded
rewards once the RewardVault is refunded:

- `recoverStrandedValidatorRewards(validationID)`
- `recoverStrandedDelegatorRewards(delegationID)`

Both revert `StakingVault__NotYetRemoved` if the ID is still tracked
(`validatorToOperator[V] != 0` or `delegatorInfo[D].operator != 0`).
Recovery ordering: delegator first, then validator (the SM's
`claimDelegatorRewards` adds the validator's delegation commission to
`_redeemableValidatorRewards`, so validator recovery should run after).

Chosen automation posture: alert-only in the keeper. The operator
executes recovery via CLI once the RewardVault is refunded and the
preconditions are known to hold. Automating end-to-end would require
tracking pending IDs in persistent state, polling refund status, and
ordering enforcement; the operational risk of a bot running recovery at
the wrong moment (e.g. mid-refund) outweighs the convenience.

Keeper impact:

- New watcher for SM `RewardDistributionFailed(address indexed recipient,
  uint256 amount, string reason)` (KSM address resolved via
  `getValidatorManagerAddress`). On each event: increments
  `suzaku_events_reward_distribution_failed_total` and fires a webhook
  alert carrying `recipient`, `amount`, `reason`. The event payload does
  not distinguish validator from delegator, so the alert instructs the
  operator to run either `recover-stranded-validator` or
  `recover-stranded-delegator` after identifying the affected ID
  off-chain.
- New watcher for vault `StakingVault__StrandedRewardsClaimed`. Each event
  increments `suzaku_events_stranded_rewards_claimed_total`. Used to
  observe when recovery actually ran.

CLI impact:

- New helpers `recoverStrandedValidatorRewardsStakingVault` and
  `recoverStrandedDelegatorRewardsStakingVault` in
  `suzaku-cli/src/stakingVault.ts`.
- New subcommands under `suzaku staking-vault`:
  - `recover-stranded-validator <stakingVaultAddress> <validationID>`
  - `recover-stranded-delegator <stakingVaultAddress> <delegationID>`
  Both catch `StakingVault__NotYetRemoved` (via substring match on the
  viem revert message, same pattern as `StakingVault__NoEligibleStake`
  in `keeper.ts`) and print a human-readable explanation before exiting.

Operator runbook when `RewardDistributionFailed` fires:

1. From the alert payload, use `recipient` and the on-chain context
   (recent `completeValidatorRemoval` / `completeDelegatorRemoval` txs
   for that recipient) to identify the affected `validationID` or
   `delegationID`.
2. Confirm the RewardVault has been refunded by the admin (coordinate
   off-chain; the vault has no direct view into SM RewardVault balance).
3. Confirm the removal is final (`validatorToOperator` or `delegatorInfo`
   cleared). If not, wait for `completeValidatorRemoval` /
   `completeDelegatorRemoval` to complete and tracking to clear.
4. If both validator and delegator rewards are stranded for the same
   validator, run `recover-stranded-delegator` for each delegation first,
   then `recover-stranded-validator` for the validator.
5. Watch `suzaku_events_stranded_rewards_claimed_total` to confirm the
   vault processed it.

## Metrics added

| Metric | Type | Labels | Issue |
|---|---|---|---|
| `suzaku_third_party_commissions_scanned_total` | counter | | #5 |
| `suzaku_third_party_commissions_crystallized_total` | counter | | #5 |
| `suzaku_third_party_commissions_errors_total` | counter | | #5 |
| `suzaku_events_validator_removal_adopted_total` | counter | | #21 |
| `suzaku_events_reward_distribution_failed_total` | counter | | #23 |
| `suzaku_events_stranded_rewards_claimed_total` | counter | | #23 |

## CLI subcommands added

| Subcommand | Issue |
|---|---|
| `suzaku staking-vault recover-stranded-validator <vault> <validationID>` | #23 |
| `suzaku staking-vault recover-stranded-delegator <vault> <delegationID>` | #23 |

## Rollback

- `#5` crystallization: pass `--no-third-party-crystallize` to disable in
  `run` or `watch`. No state is retained across disabled runs.
- `#21`, `#23` watchers: disable by setting `--metrics-port 0` (disables
  the full monitor, including the unchanged watchers). Fine-grained
  opt-out is not wired in this phase.
- `#23` recovery CLI: no-ops if never invoked. Nothing to roll back.

## Manual validation checklist

1. On `lst-kite` branch `zenith-audit`, run `forge build` to produce
   `out/`, then in `suzaku-cli` run
   `node scripts/update-abis.mjs --source-dir <lst-kite>/out`. Confirm
   the script reports updates to `KiteStakingManager.ts`, `StakingVault.ts`,
   `StakingVaultOperations.ts`.
2. `pnpm build` in `suzaku-cli`, TypeScript should pass.
3. `suzaku staking-vault recover-stranded-validator --help` displays. Same
   for `recover-stranded-delegator`.
4. On Fuji, start `suzaku-keeper watch <vault>` and verify the new metrics
   appear under `GET /metrics` even before any event fires.
5. Trigger a synthetic `RewardDistributionFailed` on a test setup (drain
   the RewardVault before a completion) and confirm the webhook payload
   references the correct CLI subcommand.
6. Exercise `NotYetRemovedError` by calling
   `recover-stranded-validator` against a validator that is still tracked
   by the vault; confirm the CLI prints the guidance and exits non-zero.
