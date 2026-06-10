import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, CliResult, RunCliOptions } from '../cli-runner.js';
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

// ── Types ──

export interface EpochTiming {
  currentEpoch: number;
  currentEpochStartTs: number;
  epochDuration: number;
  updateWindow: number;
}

export interface RewardsConstants {
  fundingDeadlineOffset: number;
  distributionEarliestOffset: number;
  claimGracePeriodEpochs: number;
}

export interface EpochStatusRow {
  epoch: number;
  epochRewards: string;
  funded: boolean;
  distributionComplete: boolean;
}

export interface DistributionProgress {
  processed: number;
  isComplete: boolean;
}

export interface HeartbeatEvent {
  eventName: string;
  blockNumber: string;
  transactionHash: string;
  timestamp?: string;
  address?: string;
  args: Record<string, unknown>;
}

export interface AlertCheck {
  name: string;
  epoch?: number;
  status: 'ok' | 'warn' | 'alert';
  detail: string;
  human: string;
}

export interface ClaimabilityRow extends EpochStatusRow {
  setAlot: string;
  setTxCount: number | null;
  status: string;
  statusHuman: string;
}

// ── Humanizers (pure, exported for tests) ──

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Unix seconds → "Jun 16 14:00 UTC" */
export function tsToUtc(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${hh}:${mm} UTC`;
}

/** Wei string → human token amount with thousands separators and up to 2 decimals ("35,120.55"). */
export function weiToToken(wei: string, decimals = 18): string {
  let v: bigint;
  try {
    v = BigInt(wei);
  } catch {
    return wei;
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = ((v % base) * 100n) / base; // 2 decimal digits, truncated
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fracStr = frac > 0n ? `.${frac.toString().padStart(2, '0').replace(/0+$/, '')}` : '';
  return `${neg ? '-' : ''}${wholeStr}${fracStr}`;
}

/** totalAssets/totalSupply at 4 decimals; '—' when supply is zero. */
export function exchangeRate(totalAssets: string, totalSupply: string): string {
  try {
    const supply = BigInt(totalSupply);
    if (supply === 0n) return '—';
    const scaled = (BigInt(totalAssets) * 10000n) / supply;
    return (Number(scaled) / 10000).toFixed(4);
  } catch {
    return '—';
  }
}

export function shortHex(value: string, head = 6, tail = 4): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

/** Epoch start timestamp interpolated from the current epoch's start (epochs are fixed-duration). */
export function epochStartOf(timing: EpochTiming, epoch: number): number {
  return timing.currentEpochStartTs - (timing.currentEpoch - epoch) * timing.epochDuration;
}

// ── Claimability derivation (pure, exported for tests) ──

/**
 * Derives the plain-language lifecycle status of one epoch's rewards.
 * setTxCount counts RewardsAmountSet events covering the epoch within the scanned
 * window (null = no event scan ran, e.g. alerts mode — accumulation is then not assessed).
 */
export function deriveClaimabilityStatus(
  row: EpochStatusRow,
  timing: EpochTiming,
  constants: RewardsConstants,
  distribution: DistributionProgress | null,
  operatorsTotal: number,
  setTxCount: number | null,
  now: number,
): { status: string; human: string } {
  const isSet = row.epochRewards !== '0';
  const fundingDeadlineTs = epochStartOf(timing, row.epoch) + constants.fundingDeadlineOffset * timing.epochDuration;

  if (setTxCount !== null && setTxCount > 1) {
    return { status: 'accumulation_warning', human: `⚠ ${setTxCount} set-amount txs (accumulated)` };
  }
  if (row.epoch >= timing.currentEpoch) {
    return { status: 'current_epoch', human: 'running' };
  }

  const distributable = row.epoch <= timing.currentEpoch - constants.distributionEarliestOffset;
  if (!distributable) {
    if (!isSet) return { status: 'not_set', human: `not set yet · fund by ${tsToUtc(fundingDeadlineTs)}` };
    return { status: 'waiting_uptime', human: 'waiting uptime' };
  }

  if (!row.funded) {
    if (now > fundingDeadlineTs) {
      return isSet
        ? { status: 'funding_closed', human: `⚠ set but never funded · funding closed ${tsToUtc(fundingDeadlineTs)}` }
        : { status: 'not_set_closed', human: `not set · funding closed ${tsToUtc(fundingDeadlineTs)}` };
    }
    return isSet
      ? { status: 'not_funded', human: `set · not funded · closes ${tsToUtc(fundingDeadlineTs)}` }
      : { status: 'not_set', human: `not set · funding closes ${tsToUtc(fundingDeadlineTs)}` };
  }

  if (!row.distributionComplete) {
    if (distribution && distribution.processed > 0) {
      return { status: 'distributing', human: `distributing ${distribution.processed}/${operatorsTotal} ops` };
    }
    return { status: 'waiting_uptime', human: 'funded · waiting uptime to distribute' };
  }

  // Approximation of the contract's EpochStillClaimable boundary — no view exposes it.
  const reclaimAfterTs = epochStartOf(timing, row.epoch)
    + (constants.distributionEarliestOffset + constants.claimGracePeriodEpochs + 1) * timing.epochDuration;
  if (now > reclaimAfterTs) {
    return { status: 'reclaimable', human: `claimable · undistributed reclaimable since ~${tsToUtc(reclaimAfterTs)}` };
  }
  return { status: 'claimable', human: 'claimable now' };
}

/** Counts RewardsAmountSet events covering each epoch (an event covers startEpoch..startEpoch+numberOfEpochs-1). */
export function countSetAmountTxs(events: HeartbeatEvent[], epoch: number): number {
  return events.filter((e) => {
    if (e.eventName !== 'RewardsAmountSet') return false;
    const start = Number(e.args.startEpoch);
    const n = Number(e.args.numberOfEpochs ?? 1);
    return start <= epoch && epoch < start + n;
  }).length;
}

// ── Two-phase stuck detection (pure, exported for tests) ──

const TWO_PHASE_PAIRS: Record<string, string> = {
  InitiatedValidatorRegistration: 'CompletedValidatorRegistration',
  InitiatedValidatorRemoval: 'CompletedValidatorRemoval',
  InitiatedValidatorWeightUpdate: 'CompletedValidatorWeightUpdate',
};

/** Finds balancer Initiated* events without a matching Completed* (by validationID) in the window. */
export function detectStuckTwoPhase(
  events: HeartbeatEvent[],
): Array<{ validationID: string; initiated: string; transactionHash: string }> {
  const completed = new Set<string>();
  for (const e of events) {
    if (Object.values(TWO_PHASE_PAIRS).includes(e.eventName)) {
      completed.add(`${e.eventName}:${String(e.args.validationID ?? '')}`);
    }
  }
  const stuck: Array<{ validationID: string; initiated: string; transactionHash: string }> = [];
  for (const e of events) {
    const pair = TWO_PHASE_PAIRS[e.eventName];
    if (!pair) continue;
    const validationID = String(e.args.validationID ?? '');
    if (!completed.has(`${pair}:${validationID}`)) {
      stuck.push({ validationID, initiated: e.eventName, transactionHash: e.transactionHash });
    }
  }
  return stuck;
}

/** One human line per node/stake/validator change event. */
export function summarizeChangedEvents(events: HeartbeatEvent[]): string[] {
  return events.map((e) => {
    const a = e.args;
    const node = a.nodeId ? shortHex(String(a.nodeId)) : a.nodeID ? shortHex(String(a.nodeID)) : undefined;
    const op = a.operator ? shortHex(String(a.operator)) : undefined;
    const tx = shortHex(e.transactionHash, 6, 4);
    switch (e.eventName) {
      case 'NodeAdded':
        return `+ node ${node} (operator ${op}, stake ${weiToToken(String(a.stake ?? '0'))})  ${tx}`;
      case 'NodeRemoved':
        return `- node ${node} (operator ${op})  ${tx}`;
      case 'NodeStakeUpdated':
        return `~ stake ${node} → ${weiToToken(String(a.newStake ?? '0'))}  ${tx}`;
      case 'AllNodeStakesUpdated':
        return `~ all node stakes (operator ${op}) → ${weiToToken(String(a.newStake ?? '0'))}  ${tx}`;
      case 'OperatorHasLeftoverStake':
        return `⚠ leftover stake ${weiToToken(String(a.leftoverStake ?? '0'))} (operator ${op})  ${tx}`;
      case 'InitiatedValidatorRegistration':
        return `… validator registration initiated ${node ?? shortHex(String(a.validationID ?? ''))}  ${tx}`;
      case 'CompletedValidatorRegistration':
        return `✓ validator registration completed ${shortHex(String(a.validationID ?? ''))}  ${tx}`;
      case 'InitiatedValidatorRemoval':
        return `… validator removal initiated ${shortHex(String(a.validationID ?? ''))}  ${tx}`;
      case 'CompletedValidatorRemoval':
        return `✓ validator removal completed ${shortHex(String(a.validationID ?? ''))}  ${tx}`;
      case 'InitiatedValidatorWeightUpdate':
        return `… weight update initiated ${shortHex(String(a.validationID ?? ''))} → ${String(a.weight ?? '?')}  ${tx}`;
      case 'CompletedValidatorWeightUpdate':
        return `✓ weight update completed ${shortHex(String(a.validationID ?? ''))} → ${String(a.weight ?? '?')}  ${tx}`;
      case 'SecurityModuleWeightUpdated':
        return `~ security module ${shortHex(String(a.securityModule ?? ''))} weight ${String(a.oldWeight ?? '?')} → ${String(a.newWeight ?? '?')}  ${tx}`;
      case 'RegisteredInitialValidator':
        return `+ initial validator ${node ?? shortHex(String(a.validationID ?? ''))}  ${tx}`;
      default:
        return `· ${e.eventName}  ${tx}`;
    }
  });
}

/** Compact rewards-activity summary line from windowed lifecycle event counts. */
export function summarizeRewardsActivity(countsByType: Record<string, number>): string {
  const parts: string[] = [];
  if (countsByType.RewardsAmountSet) parts.push(`${countsByType.RewardsAmountSet} set-amount`);
  if (countsByType.RewardsDistributed) parts.push(`${countsByType.RewardsDistributed} distributed`);
  if (countsByType.RewardsClaimed) parts.push(`${countsByType.RewardsClaimed} staker claims`);
  if (countsByType.UndistributedRewardsClaimed) parts.push(`${countsByType.UndistributedRewardsClaimed} undistributed reclaimed`);
  const fees = (countsByType.OperatorFeeClaimed ?? 0) + (countsByType.CuratorFeeClaimed ?? 0) + (countsByType.ProtocolFeeClaimed ?? 0);
  if (fees) parts.push(`${fees} fee claims`);
  if (countsByType.ZeroRewardsClaim) parts.push(`${countsByType.ZeroRewardsClaim} zero-claim ⚠`);
  return parts.length > 0 ? parts.join(' · ') : 'no rewards activity';
}

// ── Alert checks (pure, exported for tests) ──

export interface AlertCheckInput {
  timing: EpochTiming;
  constants: RewardsConstants;
  allClassesCached: boolean;
  claimability: ClaimabilityRow[];
  uptimeSetByOperator: Record<string, boolean | null>;
  lstPaused: boolean | null;
  validatorBalances: Array<{ nodeID: string; balanceAVAX: string; operator?: string }>;
  stuckTwoPhase: Array<{ validationID: string; initiated: string }>;
  thresholds: { pChainMinAVAX: number; cacheLateDays: number; uptimeMissingEpochFraction: number };
  now: number;
}

export function runAlertChecks(input: AlertCheckInput): AlertCheck[] {
  const checks: AlertCheck[] = [];
  const { timing, thresholds, now } = input;
  const windowDeadlineTs = timing.currentEpochStartTs + timing.updateWindow;

  // 1. Stake cache late in (or past) the update window
  if (!input.allClassesCached) {
    const secondsLeft = windowDeadlineTs - now;
    if (secondsLeft < 0) {
      checks.push({ name: 'stake_cache', status: 'alert', detail: `update window closed ${tsToUtc(windowDeadlineTs)}, cache incomplete`, human: `🔴 stake cache incomplete and update window closed ${tsToUtc(windowDeadlineTs)}` });
    } else if (secondsLeft < thresholds.cacheLateDays * 86_400) {
      checks.push({ name: 'stake_cache', status: 'warn', detail: `cache incomplete, window closes ${tsToUtc(windowDeadlineTs)}`, human: `⚠️ stake cache not ready — update window closes ${tsToUtc(windowDeadlineTs)}` });
    } else {
      checks.push({ name: 'stake_cache', status: 'ok', detail: 'cache incomplete, window has time left', human: 'stake cache pending (window open)' });
    }
  } else {
    checks.push({ name: 'stake_cache', status: 'ok', detail: 'all classes cached', human: 'stake cache ✅' });
  }

  // 2. Uptime not reported for last epoch past the threshold fraction of the current epoch
  const epochElapsedFraction = (now - timing.currentEpochStartTs) / timing.epochDuration;
  for (const [operator, isSet] of Object.entries(input.uptimeSetByOperator)) {
    if (isSet === false && epochElapsedFraction > thresholds.uptimeMissingEpochFraction) {
      checks.push({ name: 'uptime_missing', epoch: timing.currentEpoch - 1, status: 'warn', detail: `operator ${operator} uptime not set for epoch ${timing.currentEpoch - 1}`, human: `⚠️ uptime for epoch ${timing.currentEpoch - 1} not computed for ${shortHex(operator)}` });
    }
  }

  // 3 + 4 + 5. Funding deadlines, accumulation, stalled distribution from claimability statuses
  for (const row of input.claimability) {
    switch (row.status) {
      case 'accumulation_warning':
        checks.push({ name: 'set_amount_accumulation', epoch: row.epoch, status: 'warn', detail: `${row.setTxCount} RewardsAmountSet txs cover epoch ${row.epoch} — amounts accumulate`, human: `⚠️ epoch ${row.epoch}: ${row.setTxCount} set-amount txs — totals accumulated` });
        break;
      case 'funding_closed':
        checks.push({ name: 'funding_deadline', epoch: row.epoch, status: 'alert', detail: `epoch ${row.epoch} set but never funded; funding window closed`, human: `🔴 epoch ${row.epoch} rewards set but never funded — funding window closed` });
        break;
      case 'not_funded':
      case 'not_set': {
        // warn when less than one epoch remains to the funding deadline
        const fundingDeadlineTs = epochStartOf(timing, row.epoch) + input.constants.fundingDeadlineOffset * timing.epochDuration;
        if (fundingDeadlineTs - now < timing.epochDuration && fundingDeadlineTs > now) {
          checks.push({ name: 'funding_deadline', epoch: row.epoch, status: 'warn', detail: `epoch ${row.epoch} ${row.status === 'not_set' ? 'has no rewards set' : 'is set but not funded'}; funding closes ${tsToUtc(fundingDeadlineTs)}`, human: `⚠️ epoch ${row.epoch} ${row.status === 'not_set' ? 'rewards not set' : 'not funded'} — funding closes ${tsToUtc(fundingDeadlineTs)}` });
        }
        break;
      }
      case 'distributing':
        if (row.epoch < timing.currentEpoch - 2) {
          checks.push({ name: 'distribution_stalled', epoch: row.epoch, status: 'warn', detail: `distribution for epoch ${row.epoch} incomplete past its earliest window`, human: `⚠️ epoch ${row.epoch} distribution started but incomplete` });
        }
        break;
      default:
        break;
    }
  }

  // 6. P-Chain continuous-fee balances
  for (const v of input.validatorBalances) {
    const bal = Number(v.balanceAVAX);
    if (Number.isFinite(bal) && bal < thresholds.pChainMinAVAX) {
      checks.push({ name: 'pchain_balance_low', status: 'alert', detail: `${v.nodeID} balance ${v.balanceAVAX} AVAX below ${thresholds.pChainMinAVAX}`, human: `🔴 ${v.nodeID} P-Chain balance ${v.balanceAVAX} AVAX — top up or validator deactivates` });
    }
  }
  if (input.validatorBalances.length === 0) {
    checks.push({ name: 'pchain_validators', status: 'warn', detail: 'no current validators returned for the subnet', human: '⚠️ P-Chain returned no current validators for the subnet' });
  }

  // 7. Stuck two-phase operations
  for (const s of input.stuckTwoPhase) {
    checks.push({ name: 'stuck_two_phase', status: 'warn', detail: `${s.initiated} without completion for ${s.validationID}`, human: `⚠️ ${s.initiated} for ${shortHex(s.validationID)} has no matching completion — two-phase op may be stuck` });
  }

  // 8. LST wrapper paused
  if (input.lstPaused === true) {
    checks.push({ name: 'lst_paused', status: 'alert', detail: 'LST wrapper deposits paused', human: '🔴 LST wrapper deposits are paused' });
  }

  return checks;
}

// ── Digest text assembly (pure, exported for tests) ──

export function buildClaimabilityLines(rows: ClaimabilityRow[]): string[] {
  const lines = ['ep     set          txs  fund dist  status'];
  for (const row of [...rows].sort((a, b) => b.epoch - a.epoch)) {
    const ep = String(row.epoch).padEnd(5);
    const set = (row.epochRewards === '0' ? '—' : row.setAlot).padEnd(12);
    const txs = (row.setTxCount === null ? '·' : String(row.setTxCount)).padEnd(4);
    const fund = (row.funded ? '✅' : '—').padEnd(4);
    const dist = (row.distributionComplete ? '✅' : row.status === 'distributing' ? '▰' : '—').padEnd(5);
    lines.push(`${ep}${set}${txs}${fund}${dist}${row.statusHuman}`);
  }
  return lines;
}

export function buildHumanLines(args: {
  mode: 'digest' | 'alerts';
  timing: EpochTiming;
  cacheOk: boolean;
  changedLines: string[];
  validatorSummary: string | null;
  tvlLine: string | null;
  activityLine: string | null;
  claimability: ClaimabilityRow[];
  checks: AlertCheck[];
}): string[] {
  const { timing } = args;
  const nonOk = args.checks.filter((c) => c.status !== 'ok');

  if (args.mode === 'alerts') {
    // Quiet mode: nothing to post when everything is ok.
    if (nonOk.length === 0) return [];
    return [
      `⚠️ Suzaku heartbeat — epoch ${timing.currentEpoch} · ${nonOk.length} check(s) need attention`,
      ...nonOk.map((c) => `  ${c.human}`),
    ];
  }

  const headIcon = nonOk.some((c) => c.status === 'alert') ? '🔴' : nonOk.length > 0 ? '⚠️' : '🟢';
  const lines: string[] = [
    `${headIcon} Suzaku heartbeat — epoch ${timing.currentEpoch} started ${tsToUtc(timing.currentEpochStartTs)}`,
    `   update window closes ${tsToUtc(timing.currentEpochStartTs + timing.updateWindow)} · cache ${args.cacheOk ? '✅' : '⚠️ pending'}`,
    '',
    `CHANGED since epoch ${timing.currentEpoch - 1} start`,
  ];
  if (args.changedLines.length === 0) {
    lines.push('  no node/stake/validator changes');
  } else {
    lines.push(...args.changedLines.map((l) => `  ${l}`));
  }
  if (args.validatorSummary) lines.push(`  ${args.validatorSummary}`);
  if (args.tvlLine) lines.push(`  ${args.tvlLine}`);
  lines.push('', 'REWARDS');
  lines.push(...buildClaimabilityLines(args.claimability).map((l) => `  ${l}`));
  if (args.activityLine) lines.push(`  activity: ${args.activityLine}`);
  if (nonOk.length > 0) {
    lines.push('', ...nonOk.map((c) => c.human));
  }
  return lines;
}

// ── Tool registration ──

export function registerHeartbeatTools(server: McpServer) {
  server.tool(
    'deployment_heartbeat',
    'Composite deployment monitor for a Suzaku L1 (middleware + rewards + LST wrapper). ' +
    'mode=alerts (default): fast state checks, returns only warn/alert findings in humanLines — empty humanLines means all good, post nothing. ' +
    'mode=digest: full epoch digest with event scans — what changed (nodes/stakes/validators), rewards activity, and a per-epoch claimability table; run once per epoch rollover (compare the returned epoch to the last reported one). ' +
    'All checks are computed deterministically; humanLines are ready to post verbatim in a Telegram monospace block. ' +
    'Digest mode scans events over the elapsed epoch (~30-60s; prefer a dedicated RPC); accumulation detection covers that window — use rewards_epoch_diagnosis for historical epochs.',
    {
      middlewareAddress: Address.describe('L1Middleware contract address'),
      rewardsAddress: Address.describe('Rewards contract address'),
      lstWrapperAddress: Address.optional().describe('LSTWrapper address (enables TVL/rate/paused checks)'),
      uptimeTrackerAddress: Address.optional().describe('UptimeTracker address (enables uptime-missing checks)'),
      mode: z.enum(['digest', 'alerts']).default('alerts').describe('digest = full epoch report with event scans; alerts = quick checks, non-OK findings only'),
      windowEpochs: z.number().int().min(1).max(8).default(6).describe('How many past epochs the claimability table covers (table = N-windowEpochs..N)'),
      pChainMinAVAX: z.number().default(0.05).describe('Alert when a validator P-Chain continuous-fee balance falls below this (AVAX)'),
      cacheLateDays: z.number().default(1).describe('Warn when stake cache is incomplete and the update window closes within this many days'),
      uptimeMissingEpochFraction: z.number().default(0.5).describe('Warn when last-epoch uptime is missing past this fraction of the current epoch'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ middlewareAddress, rewardsAddress, lstWrapperAddress, uptimeTrackerAddress, mode, windowEpochs, pChainMinAVAX, cacheLateDays, uptimeMissingEpochFraction, network, rpcUrl }) => {
      const opts: RunCliOptions = { network, rpcUrl, skipLimiter: true };
      const scanOpts: RunCliOptions = { ...opts, timeout: 180_000 };
      const _warnings: string[] = [];
      const now = Math.floor(Date.now() / 1000);

      // Phase 0: epoch config (includes current epoch)
      const epochConfigResult = await runCli(['middleware', 'get-epoch-config', middlewareAddress], opts);
      const epochConfig = extractData(epochConfigResult, 'get-epoch-config', _warnings).epochConfig as {
        epoch: number; epochDuration: number; updateWindow: number; lastNodeStakeUpdateEpoch: number;
      } | undefined;
      if (!epochConfig) {
        return formatResult(epochConfigResult.success
          ? { success: false, data: null, error: 'get-epoch-config returned no epochConfig data' }
          : epochConfigResult);
      }
      const currentEpoch = epochConfig.epoch;
      const fromEpoch = Math.max(0, currentEpoch - windowEpochs);

      // Phase 1: timing, cache, operators, claimability window, LST info (≤6 parallel)
      const phase1 = await Promise.all([
        runCli(['middleware', 'get-epoch-start-ts', middlewareAddress, String(currentEpoch)], opts),
        runCli(['middleware', 'get-cache-status', middlewareAddress, '--epoch', String(currentEpoch)], opts),
        runCli(['middleware', 'get-all-operators', middlewareAddress], opts),
        runCli(['rewards', 'get-epoch-status', rewardsAddress, String(fromEpoch), '--to-epoch', String(currentEpoch)], opts),
        ...(lstWrapperAddress ? [runCli(['lst-wrapper', 'info', lstWrapperAddress], opts)] : []),
      ]);
      const [epochStartResult, cacheStatusResult, operatorsResult, epochStatusResult, lstInfoResult] = phase1;

      const epochStartTs = Number(extractData(epochStartResult, 'get-epoch-start-ts', _warnings).epochStartTs ?? 0);
      const cacheStatus = extractData(cacheStatusResult, 'get-cache-status', _warnings).cacheStatus as { allClassesCached?: boolean } | undefined;
      const operators = (extractData(operatorsResult, 'get-all-operators', _warnings).operators ?? []) as string[];
      const epochStatusTable = extractData(epochStatusResult, 'get-epoch-status', _warnings).epochStatusTable as {
        constants: RewardsConstants;
        epochs: EpochStatusRow[];
      } | undefined;
      const lstInfo = lstInfoResult
        ? extractData(lstInfoResult, 'lst-wrapper-info', _warnings).lstWrapperInfo as { totalAssets?: string; totalSupply?: string; paused?: boolean; symbol?: string } | undefined
        : undefined;

      const timing: EpochTiming = {
        currentEpoch,
        currentEpochStartTs: epochStartTs,
        epochDuration: epochConfig.epochDuration,
        updateWindow: epochConfig.updateWindow,
      };
      const constants: RewardsConstants = epochStatusTable?.constants ?? {
        fundingDeadlineOffset: 4, distributionEarliestOffset: 2, claimGracePeriodEpochs: 1,
      };
      const statusRows: EpochStatusRow[] = epochStatusTable?.epochs ?? [];

      // Phase 2: validator balances always; event scans in digest mode (≤4 parallel)
      const isDigest = mode === 'digest';
      const phase2 = await Promise.all([
        runCli(['middleware', 'get-validator-balances', middlewareAddress], opts),
        ...(isDigest ? [
          runCli(['middleware', 'node-logs', middlewareAddress, '--from-epoch', String(Math.max(0, currentEpoch - 1))], scanOpts),
          runCli(['rewards', 'get-events', rewardsAddress, '--middleware', middlewareAddress, '--from-epoch', String(Math.max(0, currentEpoch - 1))], scanOpts),
        ] : []),
      ]);
      const validatorBalancesData = extractData(phase2[0], 'get-validator-balances', _warnings).validatorBalances as {
        validators: Array<{ nodeID: string; validationID?: string; operator?: string; balanceNAvax: string; balanceAVAX: string; weight: string }>;
      } | undefined;
      const nodeLogs = isDigest
        ? (extractData(phase2[1], 'node-logs', _warnings).nodeLogs ?? []) as HeartbeatEvent[]
        : [];
      const rewardsEvents = isDigest
        ? extractData(phase2[2], 'rewards-get-events', _warnings).rewardsLifecycleEvents as { countsByType: Record<string, number>; events: HeartbeatEvent[] } | undefined
        : undefined;

      // Phase 3: distribution batches for funded-but-incomplete distributable epochs + uptime flags (≤8 parallel)
      const distributionEpochs = statusRows
        .filter((r) => r.funded && !r.distributionComplete && r.epoch <= currentEpoch - constants.distributionEarliestOffset)
        .map((r) => r.epoch)
        .slice(0, 5);
      const uptimeOperators = uptimeTrackerAddress ? operators.slice(0, 2) : [];
      const phase3 = await Promise.all([
        ...distributionEpochs.map((ep) => runCli(['rewards', 'get-distribution-batch', rewardsAddress, String(ep)], opts)),
        ...uptimeOperators.map((op) => runCli(['uptime', 'check-operator-uptime-set', uptimeTrackerAddress!, op, String(Math.max(0, currentEpoch - 1))], opts)),
      ]);

      const distributionByEpoch: Record<number, DistributionProgress> = {};
      distributionEpochs.forEach((ep, i) => {
        const d = extractData(phase3[i], `get-distribution-batch-${ep}`, _warnings).distributionBatch as { lastProcessedOperator?: string; isComplete?: boolean } | undefined;
        if (d) distributionByEpoch[ep] = { processed: Number(d.lastProcessedOperator ?? 0), isComplete: d.isComplete ?? false };
      });
      const uptimeSetByOperator: Record<string, boolean | null> = {};
      uptimeOperators.forEach((op, i) => {
        const u = extractData(phase3[distributionEpochs.length + i], `uptime-set-${op}`, _warnings);
        uptimeSetByOperator[op] = typeof u.isOperatorUptimeSet === 'boolean' ? u.isOperatorUptimeSet : null;
      });

      // ── Derivations (no I/O below this point) ──
      const claimability: ClaimabilityRow[] = statusRows.map((row) => {
        const setTxCount = isDigest && rewardsEvents ? countSetAmountTxs(rewardsEvents.events, row.epoch) : null;
        const derived = deriveClaimabilityStatus(
          row, timing, constants, distributionByEpoch[row.epoch] ?? null, operators.length, setTxCount, now,
        );
        return { ...row, setAlot: weiToToken(row.epochRewards), setTxCount, status: derived.status, statusHuman: derived.human };
      });

      const stuckTwoPhase = detectStuckTwoPhase(nodeLogs);
      const changedLines = summarizeChangedEvents(nodeLogs);

      const validators = validatorBalancesData?.validators ?? [];
      const minBalance = validators.length > 0
        ? validators.reduce((min, v) => Number(v.balanceAVAX) < Number(min.balanceAVAX) ? v : min)
        : null;
      const validatorSummary = validators.length > 0
        ? `validators ${validators.length} · P-Chain min balance ${minBalance!.balanceAVAX} AVAX (${minBalance!.nodeID})`
        : null;
      const tvlLine = lstInfo?.totalAssets && lstInfo?.totalSupply
        ? `wrapper assets ${weiToToken(lstInfo.totalAssets)} · rate ${exchangeRate(lstInfo.totalAssets, lstInfo.totalSupply)} per ${lstInfo.symbol ?? 'share'} · deposits ${lstInfo.paused ? '🔴 PAUSED' : 'open'}`
        : null;
      const activityLine = rewardsEvents ? summarizeRewardsActivity(rewardsEvents.countsByType) : null;

      const checks = runAlertChecks({
        timing,
        constants,
        allClassesCached: cacheStatus?.allClassesCached ?? false,
        claimability,
        uptimeSetByOperator,
        lstPaused: lstInfo?.paused ?? null,
        validatorBalances: validators,
        stuckTwoPhase,
        thresholds: { pChainMinAVAX, cacheLateDays, uptimeMissingEpochFraction },
        now,
      });

      const humanLines = buildHumanLines({
        mode, timing,
        cacheOk: cacheStatus?.allClassesCached ?? false,
        changedLines, validatorSummary, tvlLine, activityLine,
        claimability, checks,
      });

      const result = {
        mode,
        epoch: currentEpoch,
        epochStartTs,
        windowStartEpoch: fromEpoch,
        ...(isDigest ? {
          changed: {
            events: nodeLogs,
            stuckTwoPhase,
            quietEpoch: nodeLogs.length === 0,
          },
        } : {}),
        rewards: {
          ...(rewardsEvents ? { activity: { countsByType: rewardsEvents.countsByType, events: rewardsEvents.events } } : {}),
          claimability,
        },
        validators: { count: validators.length, balances: validators },
        checks,
        humanLines,
        ...(_warnings.length > 0 ? { _warnings } : {}),
      };

      return formatResult({ success: true, data: result });
    },
  );
}
