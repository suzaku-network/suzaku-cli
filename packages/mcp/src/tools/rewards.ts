import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, CliResult, RunCliOptions } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Network, RpcUrl } from '../schemas.js';
import { augmentEpochStatus, augmentFeesConfig, augmentLastClaimed } from './payload-augment.js';

/** Extract data from a CliResult, returning empty object on failure.
 *  When label and warnings are provided, records failed sub-calls for surfacing to the caller. */
function extractData(result: CliResult, label?: string, warnings?: string[]): Record<string, unknown> {
  if (!result.success || result.data == null || typeof result.data !== 'object') {
    if (label && warnings) warnings.push(`${label}: ${result.error ?? 'no data'}`);
    return {};
  }
  return result.data as Record<string, unknown>;
}
export function registerRewardsTools(server: McpServer, readOnly?: boolean) {
  // ── Reads ──

  server.tool(
    'rewards_get_epoch_rewards',
    'Get reward details for a specific epoch — shows the total rewards amount set for that epoch',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch number'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, epoch, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['rewards', 'get-epoch-rewards', rewardsAddress, epoch],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'rewards_get_distribution_batch',
    'Check distribution progress for an epoch — shows how many operators have been processed and whether distribution is complete',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch number'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, epoch, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['rewards', 'get-distribution-batch', rewardsAddress, epoch],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'rewards_get_fees_config',
    'Get the current protocol, operator, and curator fee configuration for a rewards contract',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, network, rpcUrl }) => {
      const result = await runCli(
        ['rewards', 'get-fees-config', rewardsAddress],
        { network, rpcUrl },
      );
      if (result.success && result.data) return formatResult({ ...result, data: augmentFeesConfig(result.data) });
      return formatResult(result);
    },
  );

  server.tool(
    'rewards_get_operator_shares',
    'Get the rewards share allocated to a specific operator for an epoch',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch number'),
      operator: Address.describe('Operator address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, epoch, operator, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['rewards', 'get-operator-shares', rewardsAddress, epoch, operator],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'rewards_get_vault_shares',
    'Get the rewards share allocated to a specific vault for an epoch',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch number'),
      vaultAddress: Address.describe('Vault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, epoch, vaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['rewards', 'get-vault-shares', rewardsAddress, epoch, vaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'rewards_get_curator_shares',
    'Get the rewards share allocated to a specific curator for an epoch',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch number'),
      curator: Address.describe('Curator address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, epoch, curator, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['rewards', 'get-curator-shares', rewardsAddress, epoch, curator],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'rewards_get_min_uptime',
    'Get the current minimum uptime a validator must achieve to be eligible for rewards. ' +
    'This getter proves only the current value; it does not expose whether or when the value changed historically.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, network, rpcUrl }) => {
      const result = await runCli(
        ['rewards', 'get-min-uptime', rewardsAddress],
        { network, rpcUrl },
      );
      if (result.success && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
        return formatResult({
          ...result,
          data: {
            ...result.data as Record<string, unknown>,
            historyAvailable: false,
            historyNote: 'This read proves the current value only; historical changes are not exposed by this tool.',
          },
        });
      }
      return formatResult(result);
    },
  );

  server.tool(
    'rewards_get_last_claimed',
    'Get the last epoch for which a staker, operator, or curator has successfully claimed rewards — use this to check if claims are up to date',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      claimerType: z.enum(['staker', 'operator', 'curator']).describe('Role of the account: staker, operator, or curator'),
      accountAddress: Address.describe('Address of the staker, operator, or curator'),
      rewardTokenAddress: Address.describe('Reward token contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, claimerType, accountAddress, rewardTokenAddress, network, rpcUrl }) => {
      const subcommand = `get-last-claimed-${claimerType}`;
      const result = await runCli(
        ['rewards', subcommand, rewardsAddress, accountAddress, rewardTokenAddress],
        { network, rpcUrl },
      );
      if (result.success && result.data) return formatResult({ ...result, data: augmentLastClaimed(result.data) });
      return formatResult(result);
    },
  );

  server.tool(
    'rewards_get_epoch_status',
    'Get funded/distributionComplete status and the set rewards amount for one epoch or a range of epochs, plus the contract scheduling constants (funding deadline, distribution earliest offset, claim grace period). Params are `epoch` (+ optional `toEpoch` for a range) — NOT startEpoch/epochs as in middleware_epoch_rewards_report; they mirror the CLI’s `get-epoch-status <epoch> --to-epoch`.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Start epoch — this parameter is named `epoch`, not startEpoch (the single epoch to query if toEpoch is omitted)'),
      toEpoch: z.string().optional().describe('End epoch (inclusive) for a range query — named `toEpoch`, not endEpoch'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, epoch, toEpoch, network, rpcUrl }) => {
      const from = Number(epoch);
      const to = toEpoch ? Number(toEpoch) : from;
      if (!Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to < 0) {
        return formatResult({ success: false, data: null, error: 'epoch and toEpoch must be non-negative integers' });
      }
      if (to - from + 1 > 50) {
        return formatResult({ success: false, data: null, error: `Epoch range too large (${to - from + 1}); maximum is 50 epochs per call` });
      }
      const args = ['rewards', 'get-epoch-status', rewardsAddress, epoch];
      if (toEpoch) args.push('--to-epoch', toEpoch);
      const result = await runCli(args, { network, rpcUrl });
      if (result.success && result.data) return formatResult({ ...result, data: augmentEpochStatus(result.data) });
      return formatResult(result);
    },
  );

  server.tool(
    'rewards_get_events',
    'Scan rewards contract lifecycle events (RewardsAmountSet, RewardsDistributed, RewardsClaimed, UndistributedRewardsClaimed, Operator/Curator/ProtocolFeeClaimed, ZeroRewardsClaim) over a block or epoch range. Returns per-type counts and a flat chronological event list. Block scans can take ~30s per epoch of range; prefer a dedicated RPC.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      middlewareAddress: Address.optional().describe('L1Middleware address (required when using fromEpoch/toEpoch)'),
      fromEpoch: z.string().optional().describe('Start epoch; fromBlock derived from its start timestamp'),
      toEpoch: z.string().optional().describe('End epoch (inclusive); toBlock derived from the next epoch start'),
      fromBlock: z.string().optional().describe('Start block (overrides fromEpoch)'),
      toBlock: z.string().optional().describe('End block (overrides toEpoch; defaults to latest)'),
      events: z.string().optional().describe('Comma-separated event names to include (defaults to all lifecycle events)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, middlewareAddress, fromEpoch, toEpoch, fromBlock, toBlock, events, network, rpcUrl }) => {
      const args = ['rewards', 'get-events', rewardsAddress];
      if (middlewareAddress) args.push('--middleware', middlewareAddress);
      if (fromEpoch) args.push('--from-epoch', fromEpoch);
      if (toEpoch) args.push('--to-epoch', toEpoch);
      if (fromBlock) args.push('--from-block', fromBlock);
      if (toBlock) args.push('--to-block', toBlock);
      if (events) args.push('--events', events);
      return formatResult(await runCli(args, { network, rpcUrl, timeout: 180_000, eventScan: true }));
    },
  );

  server.tool(
    'rewards_epoch_diagnosis',
    'Separate contract set-amount evidence from the bot policy window for an epoch, report whether it is ' +
    'already funded, whether another successful call would accumulate, and what action is safe. Also ' +
    'diagnoses incomplete distribution and set-amount event history. Historical public-RPC scans may take several minutes. Use its computed setAmountReadiness ' +
    'fields and bot-policy deadline; do not recompute the lifecycle from epoch numbers. This tool does ' +
    'not check uptime: never recommend uptime reporting or computation from this result alone; call ' +
    'middleware_uptime_report or deployment_heartbeat first.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      middlewareAddress: Address.describe('L1Middleware contract address (required to look up set-amount event history)'),
      epoch: z.string().describe('Epoch number to diagnose'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, middlewareAddress, epoch, network, rpcUrl }) => {
      const opts: RunCliOptions = { network, rpcUrl, skipLimiter: true };
      const _warnings: string[] = [];
      const targetEpoch = Number(epoch);
      if (!Number.isInteger(targetEpoch) || targetEpoch < 0) {
        return formatResult({ success: false, data: null, error: 'epoch must be a non-negative integer' });
      }
      // The set-amount window is currentEpoch-2 <= target < currentEpoch, so it
      // closes when target+3 begins. This is dynamic protocol arithmetic, not a
      // deployment-specific epoch pin.
      const setAmountDeadlineEpoch = targetEpoch + 3;

      // Phase 1: parallel reads — epoch state plus the live window/deadline.
      const [
        epochRewardsResult,
        feesConfigResult,
        distributionBatchResult,
        currentEpochResult,
        setAmountDeadlineResult,
        epochStatusResult,
      ] = await Promise.all([
        runCli(['rewards', 'get-epoch-rewards', rewardsAddress, epoch], opts),
        runCli(['rewards', 'get-fees-config', rewardsAddress], opts),
        runCli(['rewards', 'get-distribution-batch', rewardsAddress, epoch], opts),
        runCli(['middleware', 'get-current-epoch', middlewareAddress], opts),
        runCli(['middleware', 'get-epoch-start-ts', middlewareAddress, String(setAmountDeadlineEpoch)], opts),
        runCli(['rewards', 'get-epoch-status', rewardsAddress, epoch], opts),
      ]);

      // Phase 2: optional set-amount event history.
      let setAmountEventsResult: CliResult | null = null;
      try {
        setAmountEventsResult = await runCli(
          ['rewards', 'get-amount-set-events', rewardsAddress, epoch, '--middleware', middlewareAddress],
          { ...opts, timeout: 300_000, eventScan: true },
        );
        if (!setAmountEventsResult.success) {
          _warnings.push('set-amount event history unavailable');
          setAmountEventsResult = null;
        }
      } catch {
        _warnings.push('set-amount event history unavailable');
        setAmountEventsResult = null;
      }

      const epochRewards = extractData(epochRewardsResult, 'get-epoch-rewards', _warnings);
      const feeConfig = extractData(feesConfigResult, 'get-fees-config', _warnings);
      const distribution = extractData(distributionBatchResult, 'get-distribution-batch', _warnings);
      const currentEpochData = extractData(currentEpochResult, 'get-current-epoch', _warnings);
      const setAmountDeadlineData = extractData(setAmountDeadlineResult, 'get-epoch-start-ts', _warnings);
      const epochStatusData = extractData(epochStatusResult, 'get-epoch-status', _warnings);
      const setAmountEventsData = setAmountEventsResult ? extractData(setAmountEventsResult, 'get-amount-set-events', _warnings) as Record<string, any> : null;
      // CLI nests the payload under its addData key
      const setAmountEvents: Record<string, any> | null = setAmountEventsData?.rewardsAmountSetEvents ?? setAmountEventsData;
      const epochStatusTable = (
        epochStatusData.epochStatusTable && typeof epochStatusData.epochStatusTable === 'object'
          ? epochStatusData.epochStatusTable
          : epochStatusData
      ) as Record<string, any>;
      const epochStatusRow = Array.isArray(epochStatusTable.epochs)
        ? epochStatusTable.epochs.find((row: Record<string, unknown>) => Number(row?.epoch) === targetEpoch)
        : null;

      // Build diagnosis
      const diagnosis: string[] = [];

      // Check for zero rewards
      const currentEpochRewards = epochRewards.rewardsAmount ?? epochRewards.amount ?? epochRewards.epochRewards;
      const fundingKnown = currentEpochRewards !== null && currentEpochRewards !== undefined;
      const rewardsIsZero =
        currentEpochRewards === 0 ||
        currentEpochRewards === '0' ||
        currentEpochRewards === null ||
        currentEpochRewards === undefined;
      const alreadyFunded = fundingKnown ? !rewardsIsZero : null;
      const currentEpochNumber = Number(currentEpochData.epoch);
      const currentEpochKnown = Number.isInteger(currentEpochNumber) && currentEpochNumber >= 0;
      const setAmountDeadlineTs = Number(setAmountDeadlineData.epochStartTs);
      const deadlineKnown = Number.isFinite(setAmountDeadlineTs) && setAmountDeadlineTs > 0;
      const withinBotOperationalWindow = currentEpochKnown
        ? targetEpoch < currentEpochNumber && targetEpoch >= currentEpochNumber - 2
        : null;
      const distributionEarliestOffset = Number(epochStatusTable.constants?.distributionEarliestOffset);
      const distributionOffsetKnown =
        Number.isInteger(distributionEarliestOffset) && distributionEarliestOffset >= 0;
      const distributionOpenEpoch = distributionOffsetKnown
        ? targetEpoch + distributionEarliestOffset
        : null;
      const lastProcessedIndex =
        distribution.lastProcessedOperator ??
        distribution.lastProcessedOperatorIndex ??
        distribution.lastIndex ??
        distribution.processedCount;
      const totalOperators = distribution.totalOperators ?? distribution.operatorCount;
      const isComplete =
        distribution.isComplete ??
        distribution.complete ??
        distribution.distributed ??
        epochStatusRow?.distributionComplete;
      const publicDistributionProgress =
        (Number.isFinite(Number(lastProcessedIndex)) && Number(lastProcessedIndex) > 0) ||
        isComplete === true ||
        isComplete === 'true';
      // Before the contract's distribution time gate opens, distribution cannot
      // have started. After it opens, a zero public batch cursor is insufficient:
      // the contract also checks a private vault-bucketing cursor that no read
      // tool currently exposes.
      const distributionStarted =
        currentEpochKnown && distributionOpenEpoch !== null && currentEpochNumber < distributionOpenEpoch
          ? false
          : publicDistributionProgress
            ? true
            : null;
      const contractCanAcceptValidSetAmount =
        distributionStarted === false ? true : distributionStarted === true ? false : null;
      const setAmountEventCountRaw = setAmountEvents?.eventCount;
      const setAmountEventCount = setAmountEventCountRaw === null || setAmountEventCountRaw === undefined
        ? null
        : Number(setAmountEventCountRaw);
      const eventCountKnown = setAmountEventCount !== null && Number.isFinite(setAmountEventCount);
      const additionalSetWouldAccumulate =
        alreadyFunded === true || (eventCountKnown && setAmountEventCount > 0)
          ? true
          : alreadyFunded === false && eventCountKnown
            ? false
            : null;
      const deadlineUtc = deadlineKnown ? new Date(setAmountDeadlineTs * 1000).toISOString() : null;
      const secondsUntilDeadline = deadlineKnown
        ? setAmountDeadlineTs - Math.floor(Date.now() / 1000)
        : null;

      if (rewardsIsZero) {
        diagnosis.push(`No rewards set for epoch ${epoch} — claim-undistributed and distribute will be no-ops (zero payout).`);
      }

      // Check for set-amount accumulation
      if (setAmountEvents) {
        const eventCount = Number(setAmountEvents.eventCount ?? 0);
        const totalAmount = setAmountEvents.totalAmount;
        if (eventCount > 1) {
          diagnosis.push(
            `${eventCount} set-amount transactions affect epoch ${epoch} and their amounts accumulate on-chain — ` +
            `accumulated total ${totalAmount} vs current epoch rewards ${currentEpochRewards}.`
          );
        } else if (eventCount === 1) {
          diagnosis.push(`1 set-amount transaction found for epoch ${epoch} — no accumulation.`);
        } else {
          diagnosis.push(`No set-amount events found for epoch ${epoch}.`);
        }
      }

      // Check distribution completeness
      if (isComplete === false || isComplete === 'false') {
        if (lastProcessedIndex !== undefined && totalOperators !== undefined) {
          diagnosis.push(
            `Distribution is not complete — last processed operator index ${lastProcessedIndex} of ${totalOperators}. ` +
            `Run rewards_distribute with remaining batches before calling claim-undistributed.`
          );
        } else {
          diagnosis.push('Distribution is not complete — run rewards_distribute before calling claim-undistributed.');
        }
      } else if (isComplete === true || isComplete === 'true') {
        diagnosis.push(`Distribution is complete for epoch ${epoch}.`);
      }

      let recommendedAction: string;
      let setAmountSummary: string;
      if (!currentEpochKnown) {
        recommendedAction = 'cannot_determine_settability';
        setAmountSummary = `Could not determine whether the bot permits setting epoch ${targetEpoch} because the current-epoch read failed.`;
      } else if (targetEpoch >= currentEpochNumber) {
        recommendedAction = 'wait_for_epoch_completion';
        setAmountSummary = `The bot will not set epoch ${targetEpoch} yet because it has not completed (current epoch ${currentEpochNumber}).`;
      } else if (withinBotOperationalWindow === false) {
        recommendedAction = 'bot_set_amount_window_closed';
        setAmountSummary = `The bot's operational set-amount window for epoch ${targetEpoch} closed when epoch ${setAmountDeadlineEpoch} began.`;
      } else if (contractCanAcceptValidSetAmount === false) {
        recommendedAction = 'do_not_set_distribution_started';
        setAmountSummary = `The contract will reject another set-amount for epoch ${targetEpoch} because distribution has started.`;
      } else if (additionalSetWouldAccumulate === true) {
        recommendedAction = 'do_not_set_already_funded';
        setAmountSummary =
          `Epoch ${targetEpoch} is inside the bot's operational window, but rewards are already present; ` +
          'the bot will refuse another proposal because any successful contract call would add, not overwrite. ' +
          'Do not top up unless the additional funding is deliberate and reviewed.';
      } else if (additionalSetWouldAccumulate === null) {
        recommendedAction = 'verify_event_history_before_setting';
        setAmountSummary =
          `Epoch ${targetEpoch} is inside the bot's operational window, but prior set-amount history could not be verified. ` +
          'Verify the event history before setting anything.';
      } else if (contractCanAcceptValidSetAmount === null) {
        recommendedAction = 'verify_distribution_not_started';
        setAmountSummary =
          `Epoch ${targetEpoch} is inside the bot's operational window with no existing funding found, ` +
          'but the available reads cannot prove that distribution has not begun. Verify distribution state before setting.';
      } else {
        recommendedAction = 'set_amount_before_deadline';
        setAmountSummary =
          `Epoch ${targetEpoch} is inside the bot's operational window, distribution is still time-gated, ` +
          'and no existing funding was found; set the intended amount before the bot-policy deadline.';
      }
      diagnosis.unshift(setAmountSummary);
      diagnosis.push(
        'Uptime was not checked by this tool. Do not recommend uptime reporting or computation unless ' +
        'middleware_uptime_report or deployment_heartbeat reports that uptime is missing.',
      );

      if (_warnings.length > 0) {
        diagnosis.push(`Diagnosis incomplete — ${_warnings.length} read(s) failed (${_warnings.join('; ')}). Do not treat this as a clean bill of health.`);
      } else if (diagnosis.length === 0) {
        diagnosis.push('No anomalies detected — check individual tool outputs for details.');
      }

      const result = {
        epoch,
        epochRewards: currentEpochRewards,
        setAmountReadiness: {
          targetEpoch,
          currentEpoch: currentEpochKnown ? currentEpochNumber : null,
          withinBotOperationalWindow,
          contractCanAcceptValidSetAmount,
          distributionStarted,
          distributionOpenEpoch,
          distributionStartFullyObservable: false,
          alreadyFunded,
          setAmountEventCount: eventCountKnown ? setAmountEventCount : null,
          eventHistoryAvailable: setAmountEvents !== null,
          additionalSetWouldAccumulate,
          botSettableThroughEpoch: targetEpoch + 2,
          botWindowClosesAtEpoch: setAmountDeadlineEpoch,
          botWindowClosesAtTs: deadlineKnown ? setAmountDeadlineTs : null,
          botWindowClosesAtUtc: deadlineUtc,
          secondsUntilBotWindowCloses: secondsUntilDeadline,
          recommendedAction,
          human: setAmountSummary,
        },
        feeConfig,
        distribution: {
          isComplete: isComplete ?? null,
          lastProcessedIndex: lastProcessedIndex ?? null,
          totalOperators: totalOperators ?? null,
          raw: distribution,
        },
        uptimeAssessment: {
          status: 'not_checked',
          actionRequired: null,
          instruction:
            'Do not recommend uptime reporting or computation unless middleware_uptime_report or ' +
            'deployment_heartbeat reports that uptime is missing.',
        },
        setAmountEvents: setAmountEvents ?? null,
        diagnosis,
        ...(_warnings.length > 0 ? { _warnings } : {}),
      };

      return formatResult({ success: true, data: result });
    },
  );

  if (readOnly) return;

  registerDirectWriteTools(server);
}

function registerDirectWriteTools(server: McpServer) {
  // ── Writes ──

  server.tool(
    'rewards_distribute',
    'Distribute rewards for an epoch (requires SUZAKU_PK). ' +
    'Pre-checks: call rewards_get_distribution_batch first — if isComplete=true this is a no-op, skip it; ' +
    'operator uptime must be recorded for the epoch or the transaction reverts with OperatorUptimeNotSet ' +
    '(check middleware_uptime_report or the heartbeat uptime flags). Run rewards_epoch_diagnosis if the epoch state is unclear.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch number'),
      batchSize: z.string().describe('Positive integer — number of operators to process in this distribution batch'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ rewardsAddress, epoch, batchSize, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('rewards_distribute', { rewardsAddress, epoch, batchSize, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['rewards', 'distribute', rewardsAddress, epoch, batchSize],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'rewards_claim',
    'Claim available staker rewards for the signer (requires SUZAKU_PK). ' +
    'Rewards are claimable only once an epoch\'s distribution is complete (rewards_get_epoch_status); ' +
    'check rewards_get_last_claimed first to see the claim cursor — claims process up to 64 epochs per call. ' +
    'Operator/curator fee claims are separate flows not exposed by this tool.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      recipient: Address.optional().describe('Recipient address for claimed rewards (defaults to signer)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ rewardsAddress, recipient, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('rewards_claim', { rewardsAddress, recipient, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['rewards', 'claim', rewardsAddress];
      if (recipient) args.push('--recipient', recipient);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'rewards_set_amount',
    'Set the rewards amount per epoch for a range of consecutive epochs (requires SUZAKU_PK). ' +
    'WARNING: calling this multiple times for overlapping epochs ACCUMULATES amounts on-chain — ' +
    'each call adds to the existing total rather than replacing it. ' +
    'Run rewards_epoch_diagnosis first to check whether a set-amount has already been submitted for the target epoch.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      startEpoch: z.string().describe('First epoch to set rewards for'),
      numberOfEpochs: z.string().describe('Number of consecutive epochs to set (starting from startEpoch)'),
      rewardsAmount: z.string().describe(
        'Rewards amount per epoch in human-readable decimal format, denominated in the rewards token\'s own decimals ' +
        '(e.g. "1000.5" for 1000.5 tokens). The CLI reads the token decimals on-chain and converts to wei internally.',
      ),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ rewardsAddress, startEpoch, numberOfEpochs, rewardsAmount, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation(
        'rewards_set_amount',
        { rewardsAddress, startEpoch, numberOfEpochs, rewardsAmount, network, rpcUrl },
        'rewardsAmount',
      );
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['rewards', 'set-amount', rewardsAddress, startEpoch, numberOfEpochs, rewardsAmount],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'rewards_claim_undistributed',
    'Reclaim undistributed rewards for an epoch back to the admin (requires SUZAKU_PK). ' +
    'Admin-only operation — the caller must hold the admin role on the rewards contract. ' +
    'Only meaningful after distribution is complete; if multiple set-amount calls accumulated for the epoch, ' +
    'the reclaimed amount will reflect the full accumulated total.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch to reclaim undistributed rewards for'),
      recipient: Address.optional().describe('Address to receive the reclaimed tokens (defaults to signer)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ rewardsAddress, epoch, recipient, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('rewards_claim_undistributed', { rewardsAddress, epoch, recipient, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['rewards', 'claim-undistributed', rewardsAddress, epoch];
      if (recipient) args.push('--recipient', recipient);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );
}
