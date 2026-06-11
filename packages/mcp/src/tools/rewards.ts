import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'node:fs';
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

// 4-byte selectors used to spot already-queued proposals (cross-checked against abi-selectors.json)
const SET_REWARDS_AMOUNT_SELECTOR = 'bcad858a'; // setRewardsAmountForEpochs(uint48,uint48,uint256)
const DISTRIBUTE_REWARDS_SELECTOR = '733f44ae'; // distributeRewards(uint48,uint48)

/** Same chain → tx-service mapping the CLI uses (src/client.ts) */
function safeTxServiceBase(network?: string): string {
  return network === 'fuji'
    ? 'https://wallet-transaction-fuji.ash.center/api'
    : 'https://api.safe.global/tx-service/avax/api';
}

function resolveAddress(param: string | undefined, envName: string): string | undefined {
  const v = param ?? process.env[envName]?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : undefined;
}

/** Resolve a secret from a `<NAME>_FILE` path (compose file secret) or the direct env var. */
function readSecretEnv(directVar: string, fileVar: string): string | undefined {
  const file = process.env[fileVar];
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch {
      return undefined;
    }
  }
  return process.env[directVar];
}

interface PendingQueueCheck {
  blocked: boolean;
  matches: string[];
  warning?: string;
}

/**
 * Scan the Safe queue for an unexecuted proposal that already carries a call with
 * `selector` into `targetAddress` — matches both direct calls and calls nested in a
 * MultiSend batch (substring scan of the batch calldata). Fail-open with a warning:
 * this check is advisory; the CLI's exact-match dedup and the human signature in the
 * Safe UI remain the hard gates.
 */
async function checkPendingSafeQueue(
  network: string | undefined,
  selector: string,
  targetAddress: string,
): Promise<PendingQueueCheck> {
  const safeAddress = process.env.SUZAKU_SAFE_ADDRESS;
  if (!safeAddress) return { blocked: false, matches: [] };
  try {
    const headers: Record<string, string> = {};
    // Accepts the file-secret form (SAFE_API_KEY_FILE) used by the propose-bot deploy,
    // so the mainnet queue check authenticates instead of failing open.
    const apiKey = readSecretEnv('SAFE_API_KEY', 'SAFE_API_KEY_FILE');
    if (network === 'fuji' || !apiKey) {
      // fuji tx service is unauthenticated; mainnet without a key will likely 401 below
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const res = await fetch(
      `${safeTxServiceBase(network)}/v1/safes/${safeAddress}/multisig-transactions/?executed=false&limit=50`,
      { headers },
    );
    if (!res.ok) {
      const authHint = (res.status === 401 || res.status === 403)
        ? ' — SAFE_API_KEY may be missing or invalid'
        : '';
      return { blocked: false, matches: [], warning: `Safe queue check unavailable (HTTP ${res.status})${authHint} — verify the queue manually before signing` };
    }
    const body = await res.json() as { results?: Array<{ safeTxHash?: string; to?: string; data?: string | null }> };
    const target = targetAddress.toLowerCase().replace(/^0x/, '');
    const matches = (body.results ?? [])
      .filter((tx) => {
        const data = (tx.data ?? '').toLowerCase();
        if (!data.includes(selector)) return false;
        return (tx.to ?? '').toLowerCase() === targetAddress.toLowerCase() || data.includes(target);
      })
      .map((tx) => tx.safeTxHash ?? 'unknown');
    return { blocked: matches.length > 0, matches };
  } catch (err) {
    return {
      blocked: false,
      matches: [],
      warning: `Safe queue check failed (${err instanceof Error ? err.message : String(err)}) — verify the queue manually before signing`,
    };
  }
}

export function registerRewardsTools(server: McpServer, readOnly?: boolean, proposeOnly?: boolean) {
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
      if (process.env.SNOWSCAN_API_KEY) args.push('--snowscan-api-key', process.env.SNOWSCAN_API_KEY);
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

  if (!proposeOnly) registerDirectWriteTools(server);

  registerProposeTools(server);
}

function registerDirectWriteTools(server: McpServer) {
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

// ── Safe propose tools ──
// These never send a transaction: the CLI (with --safe and a DELEGATE key) submits an
// off-chain proposal to the Safe transaction service; owners review the decoded
// calldata in the Safe UI and sign there. bypassSuggest is sound ONLY because of that
// human signature gate.
function registerProposeTools(server: McpServer) {
  server.tool(
    'rewards_set_amount_propose',
    'Propose (never execute) the weekly rewards funding for ONE epoch to the Safe queue: a single MultiSend batch of ERC20 approve + setRewardsAmountForEpochs(epoch, 1, amount). ' +
    'Hard-refuses if the epoch already has rewards set on-chain (set-amount ACCUMULATES — the epoch 35/36 incident), if the epoch is outside the settable window, if the amount fails bounds, or if a matching proposal is already queued. ' +
    'Requires SUZAKU_SAFE_ADDRESS and a Safe DELEGATE key. Humans must verify the decoded calldata in the Safe UI before signing.',
    {
      epoch: z.string().describe('The single completed epoch to set rewards for'),
      rewardsAmount: z.string().describe('Rewards amount in human-readable decimal token units (e.g. "10450" for 10450 ALOT). The CLI converts to wei from on-chain token decimals.'),
      rewardsAddress: Address.optional().describe('Rewards contract address (defaults to SUZAKU_REWARDS_ADDRESS)'),
      middlewareAddress: Address.optional().describe('L1Middleware address for epoch-window checks (defaults to SUZAKU_MIDDLEWARE_ADDRESS)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ epoch, rewardsAmount, rewardsAddress: rewardsParam, middlewareAddress: middlewareParam, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      if (!process.env.SUZAKU_SAFE_ADDRESS) {
        return formatGuardError('rewards_set_amount_propose requires SUZAKU_SAFE_ADDRESS — this tool only proposes to a Safe queue, it never sends transactions');
      }
      const rewardsAddress = resolveAddress(rewardsParam, 'SUZAKU_REWARDS_ADDRESS');
      if (!rewardsAddress) return formatGuardError('No rewards contract address: pass rewardsAddress or set SUZAKU_REWARDS_ADDRESS');
      const middlewareAddress = resolveAddress(middlewareParam, 'SUZAKU_MIDDLEWARE_ADDRESS');
      if (!middlewareAddress) return formatGuardError('No middleware address: pass middlewareAddress or set SUZAKU_MIDDLEWARE_ADDRESS (needed to verify the epoch window)');

      const guardErr = await guardWriteOperation('rewards_set_amount_propose', { rewardsAddress, epoch, rewardsAmount, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);

      const epochNum = Number(epoch);
      if (!Number.isInteger(epochNum) || epochNum < 0) return formatGuardError(`epoch must be a non-negative integer, got "${epoch}"`);
      if (!/^\d+(\.\d+)?$/.test(rewardsAmount) || Number(rewardsAmount) <= 0) {
        return formatGuardError(`rewardsAmount must be a positive decimal number, got "${rewardsAmount}"`);
      }
      const warnings: string[] = [];
      // Fail closed: an unconfigured cap means no bound, so refuse rather than silently
      // propose an unbounded amount — operators must set an explicit ceiling.
      const cap = Number(process.env.SUZAKU_MAX_REWARDS_AMOUNT ?? '');
      if (!Number.isFinite(cap) || cap <= 0) {
        return formatGuardError('SUZAKU_MAX_REWARDS_AMOUNT is not configured — refusing to propose without an explicit upper bound. Set it to the maximum acceptable amount in human token units.');
      }
      if (Number(rewardsAmount) >= cap) {
        return formatGuardError(`rewardsAmount ${rewardsAmount} is at or above the configured cap (SUZAKU_MAX_REWARDS_AMOUNT=${cap}) — refusing`);
      }

      // Reads that gate the accumulation decision skip the dedup cache so a stale read
      // from a prior diagnosis call can never green-light a duplicate proposal.
      const opts: RunCliOptions = { network, rpcUrl, skipLimiter: true, skipDedup: true };

      // Hard gate (fail-closed): the epoch must have NO rewards set — set-amount accumulates.
      const epochRewardsResult = await runCli(['rewards', 'get-epoch-rewards', rewardsAddress, epoch], opts);
      if (!epochRewardsResult.success) {
        return formatGuardError(`Pre-check failed (get-epoch-rewards): ${epochRewardsResult.error ?? 'no data'} — refusing to propose without verifying on-chain state`);
      }
      const epochRewardsWei = String(extractData(epochRewardsResult).epochRewards ?? '0');
      if (!/^0+$/.test(epochRewardsWei)) {
        return formatGuardError(
          `Epoch ${epoch} already has rewards set on-chain (epochRewards=${epochRewardsWei} wei). ` +
          'set-amount ACCUMULATES — proposing again would ADD to the existing amount (the epoch 35/36 incident). Refusing. ' +
          'Run rewards_epoch_diagnosis for the full history.',
        );
      }

      // Epoch window (fail-closed): only the last completed epoch or the one before it.
      const currentEpochResult = await runCli(['middleware', 'get-current-epoch', middlewareAddress], { ...opts, skipDedup: true });
      const currentEpoch = Number(extractData(currentEpochResult).epoch);
      if (!currentEpochResult.success || !Number.isInteger(currentEpoch)) {
        return formatGuardError(`Pre-check failed (get-current-epoch): ${currentEpochResult.error ?? 'no data'} — refusing to propose without verifying the epoch window`);
      }
      if (epochNum >= currentEpoch) {
        return formatGuardError(`Epoch ${epoch} has not completed yet (current epoch is ${currentEpoch}) — rewards are set for completed epochs only`);
      }
      if (epochNum < currentEpoch - 2) {
        return formatGuardError(`Epoch ${epoch} is stale (current epoch is ${currentEpoch}); refusing to set rewards this far back — if intentional, run the CLI manually`);
      }

      // Best-effort: event history catches edge states epochRewards alone can miss.
      let setAmountEventCount: number | null = null;
      const eventsResult = await runCli(
        ['rewards', 'get-amount-set-events', rewardsAddress, epoch, '--middleware', middlewareAddress],
        { ...opts, timeout: 180_000 },
      );
      if (eventsResult.success) {
        const ev = extractData(eventsResult).rewardsAmountSetEvents as Record<string, unknown> | undefined;
        setAmountEventCount = Number(ev?.eventCount ?? 0);
        if (setAmountEventCount > 0) {
          return formatGuardError(`${setAmountEventCount} set-amount event(s) already exist for epoch ${epoch} — refusing (accumulation guard)`);
        }
      } else {
        warnings.push(`set-amount event history unavailable (${eventsResult.error ?? 'no data'}) — pre-check relied on epochRewards only`);
      }

      // Advisory: a matching proposal already sitting unsigned in the Safe queue.
      const pending = await checkPendingSafeQueue(network, SET_REWARDS_AMOUNT_SELECTOR, rewardsAddress);
      if (pending.blocked) {
        return formatGuardError(
          `A pending Safe proposal already contains setRewardsAmountForEpochs for this rewards contract (${pending.matches.join(', ')}). ` +
          'Sign or delete it in the Safe before proposing again.',
        );
      }
      if (pending.warning) warnings.push(pending.warning);

      const preCheckAt = new Date().toISOString();
      const proposeResult = await runCli(
        ['rewards', 'set-amount', rewardsAddress, epoch, '1', rewardsAmount, '--safe-propose'],
        { network, rpcUrl, privateKey: true, bypassSuggest: true, timeout: 180_000 },
      );
      if (!proposeResult.success) return formatResult(proposeResult);
      const data = extractData(proposeResult);

      return formatResult({
        success: true,
        data: {
          proposed: true,
          safeTxHash: data.safeTxHash ?? null,
          safeQueueUrl: data.safeQueueUrl ?? null,
          proposal: {
            rewardsContract: rewardsAddress,
            batch: ['ERC20.approve(rewardsContract, amount)', `setRewardsAmountForEpochs(${epochNum}, 1, amount)`],
            epoch: epochNum,
            numberOfEpochs: 1,
            amountHuman: rewardsAmount,
            amountNote: 'wei value is computed by the CLI from on-chain token decimals — verify it in the decoded Safe calldata',
          },
          preCheck: {
            at: preCheckAt,
            epochRewardsWei,
            setAmountEventCount,
            currentEpoch,
            note: 'point-in-time — on-chain state may have changed since',
          },
          verifyBeforeSigning: [
            `In the Safe UI, decode the batch and check it is exactly: approve(${rewardsAddress}, amount) + setRewardsAmountForEpochs(${epochNum}, 1, amount) with amount = ${rewardsAmount} tokens in wei`,
            `Re-run rewards_epoch_diagnosis for epoch ${epochNum} immediately before signing — the pre-check above is from ${preCheckAt} and may be stale`,
            `rewards_get_epoch_rewards(${epochNum}) must still be 0 at signing time`,
            'Do not sign on the bot\'s say-so — the decoded calldata in the Safe UI is the source of truth',
          ],
          ...(warnings.length > 0 ? { _warnings: warnings } : {}),
        },
      });
    },
  );

  server.tool(
    'rewards_distribute_propose',
    'Propose (never execute) a rewards distribution batch for an epoch to the Safe queue. ' +
    'Refuses if the epoch has no rewards set; returns early if distribution is already complete; refuses if a matching distribute proposal is already queued. ' +
    'Requires SUZAKU_SAFE_ADDRESS and a Safe DELEGATE key. Humans must verify the decoded calldata in the Safe UI before signing.',
    {
      epoch: z.string().describe('Epoch to distribute rewards for'),
      batchSize: z.string().describe('Positive integer — number of operators to process in this distribution batch'),
      rewardsAddress: Address.optional().describe('Rewards contract address (defaults to SUZAKU_REWARDS_ADDRESS)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ epoch, batchSize, rewardsAddress: rewardsParam, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      if (!process.env.SUZAKU_SAFE_ADDRESS) {
        return formatGuardError('rewards_distribute_propose requires SUZAKU_SAFE_ADDRESS — this tool only proposes to a Safe queue, it never sends transactions');
      }
      const rewardsAddress = resolveAddress(rewardsParam, 'SUZAKU_REWARDS_ADDRESS');
      if (!rewardsAddress) return formatGuardError('No rewards contract address: pass rewardsAddress or set SUZAKU_REWARDS_ADDRESS');

      const guardErr = await guardWriteOperation('rewards_distribute_propose', { rewardsAddress, epoch, batchSize, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);

      const epochNum = Number(epoch);
      if (!Number.isInteger(epochNum) || epochNum < 0) return formatGuardError(`epoch must be a non-negative integer, got "${epoch}"`);
      if (!/^[1-9]\d*$/.test(batchSize)) return formatGuardError(`batchSize must be a positive integer, got "${batchSize}"`);

      const warnings: string[] = [];
      // Skip dedup so the completeness/funded gates read fresh on-chain state.
      const opts: RunCliOptions = { network, rpcUrl, skipLimiter: true, skipDedup: true };

      // Fail-closed: rewards must be set before distribution can be proposed.
      const epochRewardsResult = await runCli(['rewards', 'get-epoch-rewards', rewardsAddress, epoch], opts);
      if (!epochRewardsResult.success) {
        return formatGuardError(`Pre-check failed (get-epoch-rewards): ${epochRewardsResult.error ?? 'no data'} — refusing to propose without verifying on-chain state`);
      }
      const epochRewardsWei = String(extractData(epochRewardsResult).epochRewards ?? '0');
      if (/^0+$/.test(epochRewardsWei)) {
        return formatGuardError(`Epoch ${epoch} has no rewards set (epochRewards=0) — run rewards_set_amount_propose first; distributing now would be a no-op`);
      }

      // Early return: nothing left to distribute.
      const batchResult = await runCli(['rewards', 'get-distribution-batch', rewardsAddress, epoch], opts);
      const batch = extractData(batchResult, 'get-distribution-batch', warnings).distributionBatch as Record<string, unknown> | undefined;
      if (batch?.isComplete === true || batch?.isComplete === 'true') {
        return formatResult({
          success: true,
          data: { proposed: false, reason: `Distribution for epoch ${epoch} is already complete — nothing to propose`, distributionBatch: batch },
        });
      }

      const pending = await checkPendingSafeQueue(network, DISTRIBUTE_REWARDS_SELECTOR, rewardsAddress);
      if (pending.blocked) {
        return formatGuardError(
          `A pending Safe proposal already contains distributeRewards for this rewards contract (${pending.matches.join(', ')}). ` +
          'Sign or delete it in the Safe before proposing again.',
        );
      }
      if (pending.warning) warnings.push(pending.warning);

      const preCheckAt = new Date().toISOString();
      const proposeResult = await runCli(
        ['rewards', 'distribute', rewardsAddress, epoch, batchSize, '--safe-propose'],
        { network, rpcUrl, privateKey: true, bypassSuggest: true, timeout: 180_000 },
      );
      if (!proposeResult.success) return formatResult(proposeResult);
      const data = extractData(proposeResult);

      return formatResult({
        success: true,
        data: {
          proposed: true,
          safeTxHash: data.safeTxHash ?? null,
          safeQueueUrl: data.safeQueueUrl ?? null,
          proposal: {
            rewardsContract: rewardsAddress,
            function: `distributeRewards(${epochNum}, ${batchSize})`,
            epoch: epochNum,
            batchSize: Number(batchSize),
          },
          preCheck: {
            at: preCheckAt,
            epochRewardsWei,
            distributionBatch: batch ?? null,
            note: 'point-in-time — on-chain state may have changed since',
          },
          verifyBeforeSigning: [
            `In the Safe UI, decode the call and check it is exactly distributeRewards(${epochNum}, ${batchSize}) on ${rewardsAddress}`,
            `Re-run rewards_epoch_diagnosis for epoch ${epochNum} immediately before signing — the pre-check above is from ${preCheckAt} and may be stale`,
            'Do not sign on the bot\'s say-so — the decoded calldata in the Safe UI is the source of truth',
          ],
          ...(warnings.length > 0 ? { _warnings: warnings } : {}),
        },
      });
    },
  );
}
