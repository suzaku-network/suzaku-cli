import { createHash } from 'node:crypto';
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

export interface HeartbeatTimingSummary {
  observedAtTs: number;
  observedAtUtc: string;
  currentEpochStartTs: number;
  currentEpochStartUtc: string;
  currentEpochEndTs: number;
  currentEpochEndUtc: string;
  currentEpochSecondsRemaining: number;
  currentEpochTimeRemaining: string;
  updateWindowCloseTs: number;
  updateWindowCloseUtc: string;
  updateWindowSecondsRemaining: number;
  updateWindowTimeRemaining: string;
}

export interface UptimeSummary {
  epoch: number;
  trackerConfigured: boolean;
  operatorListAvailable: boolean;
  status: 'complete' | 'missing' | 'unknown' | 'not_checked';
  allOperatorsSet: boolean | null;
  operatorCount: number;
  reportedOperators: string[];
  missingOperators: string[];
  unknownOperators: string[];
  byOperator: Record<string, boolean | null>;
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
  distributionOpenEpoch?: number;
  distributionOpenTs?: number;
  setAmountActionDeadlineTs?: number;
  contractFundingDeadlineTs?: number;
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

/** Signed seconds from the observation time -> compact, deterministic relative text. */
export function timeRemaining(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'unknown';
  if (seconds === 0) return 'due now';
  const absolute = Math.abs(Math.trunc(seconds));
  if (absolute < 60) return seconds > 0 ? 'less than 1m remaining' : 'less than 1m ago';
  const totalMinutes = Math.floor(absolute / 60);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const parts = days > 0
    ? [`${days}d`, ...(hours > 0 ? [`${hours}h`] : [])]
    : hours > 0
      ? [`${hours}h`, ...(minutes > 0 ? [`${minutes}m`] : [])]
      : [`${minutes}m`];
  return `${parts.join(' ')} ${seconds > 0 ? 'remaining' : 'ago'}`;
}

export function summarizeHeartbeatTiming(timing: EpochTiming, observedAtTs: number): HeartbeatTimingSummary {
  const currentEpochEndTs = timing.currentEpochStartTs + timing.epochDuration;
  const updateWindowCloseTs = timing.currentEpochStartTs + timing.updateWindow;
  const currentEpochSecondsRemaining = currentEpochEndTs - observedAtTs;
  const updateWindowSecondsRemaining = updateWindowCloseTs - observedAtTs;
  return {
    observedAtTs,
    observedAtUtc: tsToUtc(observedAtTs),
    currentEpochStartTs: timing.currentEpochStartTs,
    currentEpochStartUtc: tsToUtc(timing.currentEpochStartTs),
    currentEpochEndTs,
    currentEpochEndUtc: tsToUtc(currentEpochEndTs),
    currentEpochSecondsRemaining,
    currentEpochTimeRemaining: timeRemaining(currentEpochSecondsRemaining),
    updateWindowCloseTs,
    updateWindowCloseUtc: tsToUtc(updateWindowCloseTs),
    updateWindowSecondsRemaining,
    updateWindowTimeRemaining: timeRemaining(updateWindowSecondsRemaining),
  };
}

export function summarizeUptime(
  epoch: number,
  operators: string[],
  byOperator: Record<string, boolean | null>,
  trackerConfigured: boolean,
  operatorListAvailable = true,
): UptimeSummary {
  const snapshot = Object.fromEntries(operators.map((operator) => [operator, byOperator[operator] ?? null]));
  const reportedOperators = operators.filter((operator) => snapshot[operator] === true);
  const missingOperators = operators.filter((operator) => snapshot[operator] === false);
  const unknownOperators = operators.filter((operator) => snapshot[operator] === null);
  let status: UptimeSummary['status'];
  let allOperatorsSet: boolean | null;
  if (!trackerConfigured) {
    status = 'not_checked';
    allOperatorsSet = null;
  } else if (!operatorListAvailable) {
    // An empty, successfully-fetched deployment really can be complete (0/0).
    // A failed operator lookup cannot: without the population we do not know who
    // should have reported uptime, so fail closed as unknown.
    status = 'unknown';
    allOperatorsSet = null;
  } else if (missingOperators.length > 0) {
    status = 'missing';
    allOperatorsSet = false;
  } else if (unknownOperators.length > 0) {
    status = 'unknown';
    allOperatorsSet = null;
  } else {
    status = 'complete';
    allOperatorsSet = true;
  }
  return {
    epoch,
    trackerConfigured,
    operatorListAvailable,
    status,
    allOperatorsSet,
    operatorCount: operators.length,
    reportedOperators,
    missingOperators,
    unknownOperators,
    byOperator: snapshot,
  };
}

function uptimeHuman(summary: UptimeSummary): string {
  const prefix = `uptime epoch ${summary.epoch}`;
  if (summary.status === 'complete') {
    return `${prefix}: complete (${summary.reportedOperators.length}/${summary.operatorCount} operators)`;
  }
  if (summary.status === 'missing') {
    const unknown = summary.unknownOperators.length > 0 ? ` · ${summary.unknownOperators.length} unknown` : '';
    return `${prefix}: ${summary.missingOperators.length} missing${unknown}`;
  }
  if (summary.status === 'unknown') return `${prefix}: unknown (read failed for ${summary.unknownOperators.length} operators)`;
  return `${prefix}: not checked (no uptime tracker supplied)`;
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

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = BASE58_ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

/** Converts a 20-byte (or left-padded 32-byte) hex node ID to "NodeID-<CB58>"; returns the input unchanged when it is not one. */
export function hexToNodeId(value: string): string {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) return value;
  let h = value.slice(2);
  if (h.length === 64 && h.startsWith('0'.repeat(24))) h = h.slice(24); // bytes32 left-padding
  if (h.length !== 40) return value;
  const payload = Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
  const checksum = createHash('sha256').update(payload).digest().subarray(28); // CB58: last 4 bytes of sha256
  const full = new Uint8Array(payload.length + 4);
  full.set(payload);
  full.set(checksum, payload.length);
  return `NodeID-${base58Encode(full)}`;
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
): {
  status: string;
  human: string;
  distributionOpenEpoch?: number;
  distributionOpenTs?: number;
  setAmountActionDeadlineTs?: number;
  contractFundingDeadlineTs?: number;
} {
  const isSet = row.epochRewards !== '0';
  const fundingDeadlineTs = epochStartOf(timing, row.epoch) + constants.fundingDeadlineOffset * timing.epochDuration;
  // The monitor's operational policy permits setting N only while
  // currentEpoch - 2 <= N < currentEpoch, so N stops being settable when
  // epoch N+3 begins.  This can be earlier than the contract funding
  // deadline; operator-facing action text must use the earlier boundary.
  const botSetAmountDeadlineTs = epochStartOf(timing, row.epoch + 3);
  const setAmountDeadlineTs = Math.min(fundingDeadlineTs, botSetAmountDeadlineTs);
  const notSetDeadlines = {
    setAmountActionDeadlineTs: setAmountDeadlineTs,
    contractFundingDeadlineTs: fundingDeadlineTs,
  };
  const notSetDeadlineHuman = setAmountDeadlineTs < fundingDeadlineTs
    ? `set by ${tsToUtc(setAmountDeadlineTs)} (bot policy; contract funding closes ${tsToUtc(fundingDeadlineTs)})`
    : `fund by ${tsToUtc(fundingDeadlineTs)} (contract deadline)`;

  if (row.epoch >= timing.currentEpoch) {
    if (setTxCount !== null && setTxCount > 1) {
      return { status: 'accumulation_warning', human: `running · ⚠ ${setTxCount} set-amount txs (accumulated)` };
    }
    return { status: 'current_epoch', human: 'running' };
  }
  if (setTxCount !== null && setTxCount > 1) {
    return { status: 'accumulation_warning', human: `⚠ ${setTxCount} set-amount txs (accumulated)` };
  }

  const distributable = row.epoch <= timing.currentEpoch - constants.distributionEarliestOffset;
  if (!distributable) {
    if (!isSet) {
      return { status: 'not_set', human: `not set yet · ${notSetDeadlineHuman}`, ...notSetDeadlines };
    }
    const distributionOpenEpoch = row.epoch + constants.distributionEarliestOffset;
    const distributionOpenTs = epochStartOf(timing, distributionOpenEpoch);
    return {
      status: 'waiting_distribution_window',
      human: `funded · distribution opens epoch ${distributionOpenEpoch} · ${tsToUtc(distributionOpenTs)}`,
      distributionOpenEpoch,
      distributionOpenTs,
    };
  }

  if (!row.funded) {
    if (isSet && now > fundingDeadlineTs) {
      return { status: 'funding_closed', human: `⚠ set but never funded · funding closed ${tsToUtc(fundingDeadlineTs)}` };
    }
    if (!isSet && now >= setAmountDeadlineTs) {
      const human = now >= fundingDeadlineTs
        ? `not set · contract funding closed ${tsToUtc(fundingDeadlineTs)}`
        : `not set · bot set window closed ${tsToUtc(setAmountDeadlineTs)} · contract funding closes ${tsToUtc(fundingDeadlineTs)}`;
      return { status: 'not_set_closed', human, ...notSetDeadlines };
    }
    return isSet
      ? { status: 'not_funded', human: `set · not funded · closes ${tsToUtc(fundingDeadlineTs)}` }
      : { status: 'not_set', human: `not set · ${notSetDeadlineHuman}`, ...notSetDeadlines };
  }

  if (!row.distributionComplete) {
    if (distribution && distribution.processed !== 0) {
      // processed < 0 is the fetch-failed sentinel: distribution state unknown, keep the row visible
      const label = distribution.processed < 0 ? '?' : String(distribution.processed);
      return { status: 'distributing', human: `distributing ${label}/${operatorsTotal} ops` };
    }
    return {
      status: 'distribution_window_open',
      human: 'funded · distribution window open; verify uptime, then distribute',
    };
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
    const rawNode = a.nodeId ?? a.nodeID;
    const node = rawNode ? shortHex(hexToNodeId(String(rawNode)), 11, 3) : undefined;
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
  allClassesCached: boolean | null;
  claimability: ClaimabilityRow[];
  uptimeSetByOperator: Record<string, boolean | null>;
  lstPaused: boolean | null;
  validatorBalances: Array<{ nodeID: string; balanceAVAX: string | null; balanceKnown?: boolean; operator?: string }>;
  stuckTwoPhase: Array<{ validationID: string; initiated: string }>;
  thresholds: { pChainMinAVAX: number; cacheLateDays: number; uptimeMissingEpochFraction: number };
  now: number;
}

export function runAlertChecks(input: AlertCheckInput): AlertCheck[] {
  const checks: AlertCheck[] = [];
  const { timing, thresholds, now } = input;
  const windowDeadlineTs = timing.currentEpochStartTs + timing.updateWindow;

  // 1. Stake cache late in (or past) the update window
  if (input.allClassesCached === false) {
    const secondsLeft = windowDeadlineTs - now;
    if (secondsLeft < 0) {
      checks.push({ name: 'stake_cache', status: 'alert', detail: `update window closed ${tsToUtc(windowDeadlineTs)}, cache incomplete`, human: `🔴 stake cache incomplete and update window closed ${tsToUtc(windowDeadlineTs)}` });
    } else if (secondsLeft < thresholds.cacheLateDays * 86_400) {
      checks.push({ name: 'stake_cache', status: 'warn', detail: `cache incomplete, window closes ${tsToUtc(windowDeadlineTs)}`, human: `⚠️ stake cache not ready — update window closes ${tsToUtc(windowDeadlineTs)}` });
    } else {
      checks.push({ name: 'stake_cache', status: 'ok', detail: 'cache incomplete, window has time left', human: 'stake cache pending (window open)' });
    }
  } else if (input.allClassesCached === true) {
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
      case 'not_set_closed':
        checks.push({ name: 'funding_deadline', epoch: row.epoch, status: 'alert', detail: `epoch ${row.epoch} rewards never set; bot set-amount window closed`, human: `🔴 epoch ${row.epoch} rewards never set — bot set-amount window closed` });
        break;
      case 'not_funded':
      case 'not_set': {
        // For an unset epoch, the bot-policy set window can close before the
        // contract funding deadline.  Alert on the actionable earlier bound.
        const fundingDeadlineTs = epochStartOf(timing, row.epoch) + input.constants.fundingDeadlineOffset * timing.epochDuration;
        const actionDeadlineTs = row.status === 'not_set'
          ? Math.min(fundingDeadlineTs, epochStartOf(timing, row.epoch + 3))
          : fundingDeadlineTs;
        if (actionDeadlineTs - now < timing.epochDuration && actionDeadlineTs > now) {
          const deadlineLabel = row.status === 'not_set' ? 'bot set window closes' : 'funding closes';
          checks.push({ name: 'funding_deadline', epoch: row.epoch, status: 'warn', detail: `epoch ${row.epoch} ${row.status === 'not_set' ? 'has no rewards set' : 'is set but not funded'}; ${deadlineLabel} ${tsToUtc(actionDeadlineTs)}`, human: `⚠️ epoch ${row.epoch} ${row.status === 'not_set' ? 'rewards not set' : 'not funded'} — ${deadlineLabel} ${tsToUtc(actionDeadlineTs)}` });
        }
        break;
      }
      case 'distributing':
        if (row.epoch < timing.currentEpoch - input.constants.distributionEarliestOffset) {
          checks.push({ name: 'distribution_stalled', epoch: row.epoch, status: 'warn', detail: `distribution for epoch ${row.epoch} incomplete past its earliest window`, human: `⚠️ epoch ${row.epoch} distribution started but incomplete` });
        }
        break;
      default:
        break;
    }
  }

  // 6. P-Chain continuous-fee balances
  for (const v of input.validatorBalances) {
    if (v.balanceKnown === false || v.balanceAVAX === null) continue;
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
  timingSummary?: HeartbeatTimingSummary;
  uptime?: UptimeSummary;
  cacheOk: boolean | null;
  changedLines: string[];
  changedScanFailed?: boolean;
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
    `   update window closes ${args.timingSummary?.updateWindowCloseUtc ?? tsToUtc(timing.currentEpochStartTs + timing.updateWindow)}` +
      `${args.timingSummary ? ` (${args.timingSummary.updateWindowTimeRemaining})` : ''} · cache ${args.cacheOk === true ? '✅' : args.cacheOk === false ? '⚠️ pending' : 'unknown'}`,
    '',
    `CHANGED since epoch ${timing.currentEpoch - 1} start`,
  ];
  if (args.changedScanFailed) {
    lines.push('  ⚠ event scan failed — changes this epoch unknown');
  } else if (args.changedLines.length === 0) {
    lines.push('  no node/stake/validator changes');
  } else {
    lines.push(...args.changedLines.map((l) => `  ${l}`));
  }
  if (args.validatorSummary) lines.push(`  ${args.validatorSummary}`);
  if (args.tvlLine) lines.push(`  ${args.tvlLine}`);
  lines.push('', 'REWARDS');
  if (args.uptime) lines.push(`  ${uptimeHuman(args.uptime)}`);
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
    'The timing object contains server-calculated UTC deadlines and remaining seconds/text; quote it instead of recomputing. ' +
    'The uptime object explicitly reports complete/missing/unknown/not_checked for the previous epoch; never infer uptime from distribution state. ' +
    'Digest mode scans events over the elapsed epoch (~30-60s; prefer a dedicated RPC); accumulation detection covers that window — use rewards_epoch_diagnosis for historical epochs. ' +
    'Event scans use the server-configured explorer service when available (~5s per scan vs ~60s RPC-only).',
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
      const collectAttempt = async (epochRetry: number): Promise<ReturnType<typeof formatResult>> => {
      const opts: RunCliOptions = { network, rpcUrl, skipLimiter: true };
      const scanOpts: RunCliOptions = { ...opts, timeout: 180_000, eventScan: true };
      const _warnings: string[] = [];

      // Phase 0: epoch config (includes current epoch) — skipDedup so the whole run anchors on a fresh epoch
      const epochConfigResult = await runCli(['middleware', 'get-epoch-config', middlewareAddress], { ...opts, skipDedup: true });
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
      if (!epochStartTs || !Number.isFinite(epochStartTs)) {
        // Without the epoch start timestamp every deadline computation is garbage — fail loudly
        // rather than flooding the channel with false 1970-dated alerts.
        return formatResult(epochStartResult.success
          ? { success: false, data: null, error: 'get-epoch-start-ts returned no usable epochStartTs' }
          : epochStartResult);
      }
      const cacheStatus = extractData(cacheStatusResult, 'get-cache-status', _warnings).cacheStatus as { allClassesCached?: boolean } | undefined;
      const cacheStatusAvailable = typeof cacheStatus?.allClassesCached === 'boolean';
      const operatorsValue = extractData(operatorsResult, 'get-all-operators', _warnings).operators;
      const operatorListAvailable = Array.isArray(operatorsValue);
      const operators = operatorListAvailable ? operatorsValue as string[] : [];
      const epochStatusTable = extractData(epochStatusResult, 'get-epoch-status', _warnings).epochStatusTable as {
        constants: RewardsConstants;
        epochs: EpochStatusRow[];
      } | undefined;
      const lstInfo = lstInfoResult
        ? extractData(lstInfoResult, 'lst-wrapper-info', _warnings).lstWrapperInfo as { totalAssets?: string; totalSupply?: string; paused?: boolean; symbol?: string } | undefined
        : undefined;
      const lstInfoAvailable = !lstWrapperAddress || Boolean(lstInfo);

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
          runCli(['middleware', 'node-logs', middlewareAddress, '--from-epoch', String(Math.max(0, currentEpoch - 1)), '--include-global-stake-events'], scanOpts),
          runCli(['rewards', 'get-events', rewardsAddress, '--middleware', middlewareAddress, '--from-epoch', String(Math.max(0, currentEpoch - 1))], scanOpts),
        ] : []),
      ]);
      const validatorBalancesData = extractData(phase2[0], 'get-validator-balances', _warnings).validatorBalances as {
        knownBalanceCount?: number;
        unknownBalanceCount?: number;
        balanceStatus?: 'complete' | 'partial' | 'unknown';
        validators: Array<{ nodeID: string; validationID?: string; operator?: string; balanceKnown?: boolean; balanceNAvax: string | null; balanceAVAX: string | null; weight: string }>;
      } | undefined;
      const validatorBalancesAvailable = Array.isArray(validatorBalancesData?.validators);
      const nodeLogs = isDigest
        ? (extractData(phase2[1], 'node-logs', _warnings).nodeLogs ?? []) as HeartbeatEvent[]
        : [];
      const nodeLogsFailed = isDigest && !phase2[1]?.success;
      const rewardsEvents = isDigest
        ? extractData(phase2[2], 'rewards-get-events', _warnings).rewardsLifecycleEvents as { countsByType: Record<string, number>; events: HeartbeatEvent[] } | undefined
        : undefined;
      const rewardsEventsFailed = isDigest && !rewardsEvents;

      // Phase 3: distribution batches for funded-but-incomplete distributable epochs + uptime flags (≤8 parallel)
      const distributionEpochs = statusRows
        .filter((r) => r.funded && !r.distributionComplete && r.epoch <= currentEpoch - constants.distributionEarliestOffset)
        .map((r) => r.epoch)
        .slice(0, 5);
      const uptimeOperators = uptimeTrackerAddress ? operators : [];
      // Chunked to leave subprocess slots free for concurrent external tool calls
      const phase3Calls = [
        ...distributionEpochs.map((ep) => () => runCli(['rewards', 'get-distribution-batch', rewardsAddress, String(ep)], opts)),
        ...uptimeOperators.map((op) => () => runCli(['uptime', 'check-operator-uptime-set', uptimeTrackerAddress!, op, String(Math.max(0, currentEpoch - 1))], opts)),
      ];
      const phase3: CliResult[] = [];
      for (let i = 0; i < phase3Calls.length; i += 4) {
        phase3.push(...await Promise.all(phase3Calls.slice(i, i + 4).map((call) => call())));
      }

      const distributionByEpoch: Record<number, DistributionProgress> = {};
      distributionEpochs.forEach((ep, i) => {
        const d = extractData(phase3[i], `get-distribution-batch-${ep}`, _warnings).distributionBatch as { lastProcessedOperator?: string; isComplete?: boolean } | undefined;
        // processed: -1 = fetch failed; keeps the row in 'distributing' state instead of silently masking it
        distributionByEpoch[ep] = d
          ? { processed: Number(d.lastProcessedOperator ?? 0), isComplete: d.isComplete ?? false }
          : { processed: -1, isComplete: false };
      });
      const uptimeSetByOperator: Record<string, boolean | null> = {};
      uptimeOperators.forEach((op, i) => {
        const u = extractData(phase3[distributionEpochs.length + i], `uptime-set-${op}`, _warnings);
        uptimeSetByOperator[op] = typeof u.isOperatorUptimeSet === 'boolean' ? u.isOperatorUptimeSet : null;
      });

      // A heartbeat can straddle an epoch boundary because it performs several
      // independent reads. Retry the complete collection once rather than mixing
      // old-epoch deadlines with new-epoch state.
      const finalEpochResult = await runCli(
        ['middleware', 'get-epoch-config', middlewareAddress],
        { ...opts, skipDedup: true },
      );
      const finalEpochConfig = extractData(finalEpochResult, 'get-epoch-config-final', _warnings).epochConfig as {
        epoch?: number;
      } | undefined;
      if (!finalEpochConfig || !Number.isInteger(finalEpochConfig.epoch)) {
        return formatResult(finalEpochResult.success
          ? { success: false, data: null, error: 'final get-epoch-config returned no usable epoch' }
          : finalEpochResult);
      }
      if (finalEpochConfig.epoch !== currentEpoch) {
        if (epochRetry === 0) return collectAttempt(1);
        return formatResult({
          success: false,
          data: null,
          error: `epoch changed during heartbeat collection (${currentEpoch} → ${finalEpochConfig.epoch}) twice; retry later`,
        });
      }

      // All external reads are now complete. Use the completed-snapshot time for
      // deadlines and remaining-time text instead of the request-start time.
      const now = Math.floor(Date.now() / 1000);

      const timingSummary = summarizeHeartbeatTiming(timing, now);
      const uptime = summarizeUptime(
        Math.max(0, currentEpoch - 1),
        operators,
        uptimeSetByOperator,
        Boolean(uptimeTrackerAddress),
        operatorListAvailable,
      );

      // ── Derivations (no I/O below this point) ──
      const claimability: ClaimabilityRow[] = statusRows.map((row) => {
        // The event scan covers the elapsed epoch only: a positive count is a real in-window
        // detection for any epoch, but a zero is only conclusive for epochs the window fully covers.
        const windowCount = isDigest && rewardsEvents ? countSetAmountTxs(rewardsEvents.events, row.epoch) : null;
        const setTxCount = windowCount === null
          ? null
          : windowCount > 0 ? windowCount : (row.epoch >= currentEpoch - 1 ? 0 : null);
        const { human: statusHuman, ...derived } = deriveClaimabilityStatus(
          row, timing, constants, distributionByEpoch[row.epoch] ?? null, operators.length, setTxCount, now,
        );
        return { ...row, setAlot: weiToToken(row.epochRewards), setTxCount, ...derived, statusHuman };
      });

      const stuckTwoPhase = detectStuckTwoPhase(nodeLogs);
      const changedLines = summarizeChangedEvents(nodeLogs);

      const validators = validatorBalancesData?.validators ?? [];
      const validatorsWithKnownBalances = validators.filter((validator) => validator.balanceKnown !== false && validator.balanceAVAX !== null);
      const minBalance = validatorsWithKnownBalances.length > 0
        ? validatorsWithKnownBalances.reduce((min, v) => Number(v.balanceAVAX) < Number(min.balanceAVAX) ? v : min)
        : null;
      const validatorSummary = validators.length === 0
        ? null
        : minBalance
          ? `validators ${validators.length} · P-Chain min balance ${minBalance.balanceAVAX} AVAX (${minBalance.nodeID})${validatorsWithKnownBalances.length < validators.length ? ` · ${validators.length - validatorsWithKnownBalances.length} balance unknown` : ''}`
          : `validators ${validators.length} · P-Chain balances unknown`;
      const tvlLine = lstInfo?.totalAssets && lstInfo?.totalSupply
        ? `wrapper assets ${weiToToken(lstInfo.totalAssets)} · rate ${exchangeRate(lstInfo.totalAssets, lstInfo.totalSupply)} per ${lstInfo.symbol ?? 'share'} · deposits ${lstInfo.paused ? '🔴 PAUSED' : 'open'}`
        : null;
      const activityLine = rewardsEvents ? summarizeRewardsActivity(rewardsEvents.countsByType) : null;

      // Sub-call failures that blind a whole monitoring layer must surface as checks,
      // not just as _warnings the bot never shows.
      const dataChecks: AlertCheck[] = [];
      if (!epochStatusTable) {
        dataChecks.push({ name: 'rewards_data_unavailable', status: 'alert', detail: 'rewards get-epoch-status sub-call failed — claimability table empty', human: '🔴 rewards monitoring unavailable — epoch status reads failed (check CLI version / RPC)' });
      }
      if (!cacheStatusAvailable) {
        dataChecks.push({ name: 'cache_data_unavailable', status: 'alert', detail: 'middleware cache status read failed', human: '🔴 stake-cache monitoring unavailable — cache status could not be read' });
      }
      if (!operatorListAvailable) {
        dataChecks.push({ name: 'operator_data_unavailable', status: 'alert', detail: 'middleware operator list read failed', human: '🔴 operator monitoring unavailable — operator list could not be read' });
      }
      if (!validatorBalancesAvailable) {
        dataChecks.push({ name: 'validator_balance_data_unavailable', status: 'alert', detail: 'validator P-Chain balance read failed', human: '🔴 validator balance monitoring unavailable — P-Chain balances could not be read' });
      } else if (validatorsWithKnownBalances.length < validators.length) {
        const unknownCount = validators.length - validatorsWithKnownBalances.length;
        dataChecks.push({ name: 'validator_balance_data_partial', status: 'warn', detail: `${unknownCount} of ${validators.length} validator balance(s) unavailable`, human: `⚠️ ${unknownCount} validator P-Chain balance${unknownCount === 1 ? '' : 's'} unknown — low-balance coverage is incomplete` });
      }
      if (!lstInfoAvailable) {
        dataChecks.push({ name: 'lst_data_unavailable', status: 'alert', detail: 'configured LST wrapper read failed', human: '🔴 LST wrapper monitoring unavailable — wrapper state could not be read' });
      }
      if (nodeLogsFailed) {
        dataChecks.push({ name: 'event_scan_failed', status: 'warn', detail: 'middleware node-logs scan failed — node/stake changes unknown', human: '⚠️ node/stake event scan failed — CHANGED section incomplete' });
      }
      if (rewardsEventsFailed) {
        dataChecks.push({ name: 'event_scan_failed', status: 'warn', detail: 'rewards get-events scan failed — rewards activity and accumulation detection unavailable', human: '⚠️ rewards event scan failed — activity/accumulation not assessed' });
      }
      if (uptime.trackerConfigured && uptime.status === 'unknown') {
        const detail = uptime.operatorListAvailable
          ? `uptime state unknown for ${uptime.unknownOperators.length} operator(s)`
          : 'operator list unavailable, so uptime coverage cannot be established';
        dataChecks.push({
          name: 'uptime_data_unavailable',
          epoch: uptime.epoch,
          status: 'warn',
          detail,
          human: `⚠️ uptime for epoch ${uptime.epoch} could not be verified — do not infer whether reporting is needed`,
        });
      }

      const checks = [...dataChecks, ...runAlertChecks({
        timing,
        constants,
        allClassesCached: cacheStatus?.allClassesCached ?? null,
        claimability,
        uptimeSetByOperator,
        lstPaused: lstInfo?.paused ?? null,
        validatorBalances: validators,
        stuckTwoPhase,
        thresholds: { pChainMinAVAX, cacheLateDays, uptimeMissingEpochFraction },
        now,
      })];

      const humanLines = buildHumanLines({
        mode, timing, timingSummary, uptime,
        cacheOk: cacheStatus?.allClassesCached ?? null,
        changedLines, changedScanFailed: nodeLogsFailed,
        validatorSummary, tvlLine, activityLine,
        claimability, checks,
      });

      const result = {
        mode,
        epoch: currentEpoch,
        epochStartTs,
        timing: timingSummary,
        uptime,
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
      };

      return collectAttempt(0);
    },
  );
}
