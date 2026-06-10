import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, CliResult, RunCliOptions } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Network, RpcUrl } from '../schemas.js';

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
      return formatResult(await runCli(
        ['rewards', 'get-fees-config', rewardsAddress],
        { network, rpcUrl },
      ));
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
    'Get the minimum uptime percentage a validator must achieve to be eligible for rewards in this contract',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['rewards', 'get-min-uptime', rewardsAddress],
        { network, rpcUrl },
      ));
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
      return formatResult(await runCli(
        ['rewards', subcommand, rewardsAddress, accountAddress, rewardTokenAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'rewards_get_epoch_status',
    'Get funded/distributionComplete status and the set rewards amount for one epoch or a range of epochs, plus the contract scheduling constants (funding deadline, distribution earliest offset, claim grace period). Use epoch + toEpoch to fetch a whole claimability window in one call.',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Start epoch (the single epoch to query if toEpoch is omitted)'),
      toEpoch: z.string().optional().describe('End epoch (inclusive) for a range query'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ rewardsAddress, epoch, toEpoch, network, rpcUrl }) => {
      const args = ['rewards', 'get-epoch-status', rewardsAddress, epoch];
      if (toEpoch) args.push('--to-epoch', toEpoch);
      return formatResult(await runCli(args, { network, rpcUrl }));
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
      return formatResult(await runCli(args, { network, rpcUrl, timeout: 180_000 }));
    },
  );

  server.tool(
    'rewards_epoch_diagnosis',
    'Diagnose why claim-undistributed or distribute is returning unexpected numbers for an epoch. Runs all relevant reads in parallel and synthesizes plain-language findings — e.g. detects accumulation from multiple set-amount calls, incomplete distribution, or zero rewards.',
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

      // Phase 1: parallel reads — epoch rewards, fees config, distribution batch
      const [epochRewardsResult, feesConfigResult, distributionBatchResult] = await Promise.all([
        runCli(['rewards', 'get-epoch-rewards', rewardsAddress, epoch], opts),
        runCli(['rewards', 'get-fees-config', rewardsAddress], opts),
        runCli(['rewards', 'get-distribution-batch', rewardsAddress, epoch], opts),
      ]);

      // Phase 2: optional set-amount event history (CLI command may not exist yet)
      let setAmountEventsResult: CliResult | null = null;
      try {
        setAmountEventsResult = await runCli(
          ['rewards', 'get-amount-set-events', rewardsAddress, epoch, '--middleware', middlewareAddress],
          opts,
        );
        if (!setAmountEventsResult.success) {
          _warnings.push(`get-amount-set-events: ${setAmountEventsResult.error ?? 'no data'} — set-amount event history unavailable`);
          setAmountEventsResult = null;
        }
      } catch {
        _warnings.push('get-amount-set-events: command not available — set-amount event history unavailable');
        setAmountEventsResult = null;
      }

      const epochRewards = extractData(epochRewardsResult, 'get-epoch-rewards', _warnings);
      const feeConfig = extractData(feesConfigResult, 'get-fees-config', _warnings);
      const distribution = extractData(distributionBatchResult, 'get-distribution-batch', _warnings);
      const setAmountEventsData = setAmountEventsResult ? extractData(setAmountEventsResult, 'get-amount-set-events', _warnings) as Record<string, any> : null;
      // CLI nests the payload under its addData key
      const setAmountEvents: Record<string, any> | null = setAmountEventsData?.rewardsAmountSetEvents ?? setAmountEventsData;

      // Build diagnosis
      const diagnosis: string[] = [];

      // Check for zero rewards
      const currentEpochRewards = epochRewards.rewardsAmount ?? epochRewards.amount ?? epochRewards.epochRewards;
      const rewardsIsZero =
        currentEpochRewards === 0 ||
        currentEpochRewards === '0' ||
        currentEpochRewards === null ||
        currentEpochRewards === undefined;

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
            `accumulated total ${totalAmount} vs current epoch rewards ${currentEpochRewards}. ` +
            `This is the most likely cause of unexpected claim-undistributed payouts (e.g. the epoch 35 incident where 3 txs summed to 29384 and claim-undistributed paid out 95% of that).`
          );
        } else if (eventCount === 1) {
          diagnosis.push(`1 set-amount transaction found for epoch ${epoch} — no accumulation.`);
        } else {
          diagnosis.push(`No set-amount events found for epoch ${epoch}.`);
        }
      }

      // Check distribution completeness
      const lastProcessedIndex = distribution.lastProcessedOperator ?? distribution.lastProcessedOperatorIndex ?? distribution.lastIndex ?? distribution.processedCount;
      const totalOperators = distribution.totalOperators ?? distribution.operatorCount;
      const isComplete = distribution.isComplete ?? distribution.complete ?? distribution.distributed;

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

      if (diagnosis.length === 0) {
        diagnosis.push('No anomalies detected — check individual tool outputs for details.');
      }

      const result = {
        epoch,
        epochRewards: currentEpochRewards,
        feeConfig,
        distribution: {
          isComplete: isComplete ?? null,
          lastProcessedIndex: lastProcessedIndex ?? null,
          totalOperators: totalOperators ?? null,
          raw: distribution,
        },
        setAmountEvents: setAmountEvents ?? null,
        diagnosis,
        ...(_warnings.length > 0 ? { _warnings } : {}),
      };

      return formatResult({ success: true, data: result });
    },
  );

  if (readOnly) return;

  // ── Writes ──

  server.tool(
    'rewards_distribute',
    'Distribute rewards for an epoch (requires SUZAKU_PK)',
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
    'Claim available staker rewards (requires SUZAKU_PK)',
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
