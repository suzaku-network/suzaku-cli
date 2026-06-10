import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../cli-runner.js', () => ({
  runCli: vi.fn(),
  formatResult: (r: { success: boolean; data: unknown; error?: string }) =>
    r.success
      ? { content: [{ type: 'text', text: JSON.stringify(r.data) }], structuredContent: r.data }
      : { content: [{ type: 'text', text: `Error: ${r.error ?? 'Unknown error'}` }], isError: true },
}));

import { runCli } from '../cli-runner.js';
import {
  tsToUtc, weiToToken, exchangeRate, epochStartOf, shortHex,
  deriveClaimabilityStatus, countSetAmountTxs, detectStuckTwoPhase,
  runAlertChecks, summarizeRewardsActivity, buildHumanLines,
  registerHeartbeatTools,
  EpochTiming, RewardsConstants, EpochStatusRow, HeartbeatEvent, ClaimabilityRow,
} from './heartbeat.js';

// Dexalot-like fixture: epoch 38 started at a fixed timestamp
const TIMING: EpochTiming = {
  currentEpoch: 38,
  currentEpochStartTs: 1_781_013_600,
  epochDuration: 302_400,
  updateWindow: 259_200,
};
const CONSTANTS: RewardsConstants = {
  fundingDeadlineOffset: 4,
  distributionEarliestOffset: 2,
  claimGracePeriodEpochs: 1,
};
const NOW = TIMING.currentEpochStartTs + 100_000; // mid-epoch 38

function row(epoch: number, rewards: string, funded: boolean, complete: boolean): EpochStatusRow {
  return { epoch, epochRewards: rewards, funded, distributionComplete: complete };
}

describe('humanizers', () => {
  it('tsToUtc formats unix seconds as "Mon D HH:MM UTC"', () => {
    expect(tsToUtc(1_781_013_600)).toMatch(/^[A-Z][a-z]{2} \d{1,2} \d{2}:\d{2} UTC$/);
  });

  it('weiToToken adds thousands separators and trims decimals', () => {
    expect(weiToToken('35120550000000000000000')).toBe('35,120.55');
    expect(weiToToken('9059200000000000000000')).toBe('9,059.2');
    expect(weiToToken('0')).toBe('0');
    expect(weiToToken('1000000000000000000')).toBe('1');
  });

  it('weiToToken survives non-numeric input', () => {
    expect(weiToToken('not-a-number')).toBe('not-a-number');
  });

  it('exchangeRate divides at 4 decimals and handles zero supply', () => {
    expect(exchangeRate('1001500000000000000', '1000000000000000000')).toBe('1.0015');
    expect(exchangeRate('1000', '0')).toBe('—');
  });

  it('shortHex shortens long values and keeps short ones', () => {
    expect(shortHex('0x9411307279456450ABF9B5181aA7a02271f0DC34')).toBe('0x9411…DC34');
    expect(shortHex('0xabc')).toBe('0xabc');
  });

  it('epochStartOf interpolates from the current epoch start', () => {
    expect(epochStartOf(TIMING, 38)).toBe(TIMING.currentEpochStartTs);
    expect(epochStartOf(TIMING, 37)).toBe(TIMING.currentEpochStartTs - 302_400);
    expect(epochStartOf(TIMING, 0)).toBe(TIMING.currentEpochStartTs - 38 * 302_400);
  });
});

describe('deriveClaimabilityStatus', () => {
  const derive = (
    r: EpochStatusRow,
    opts?: { distribution?: { processed: number; isComplete: boolean } | null; setTxCount?: number | null; now?: number },
  ) => deriveClaimabilityStatus(r, TIMING, CONSTANTS, opts?.distribution ?? null, 2, opts?.setTxCount ?? null, opts?.now ?? NOW);

  it('current epoch is "running"', () => {
    expect(derive(row(38, '0', false, false)).status).toBe('current_epoch');
  });

  it('epoch 0 when current epoch is 0 is "running" (clamp edge)', () => {
    const t0: EpochTiming = { ...TIMING, currentEpoch: 0 };
    const res = deriveClaimabilityStatus(row(0, '0', false, false), t0, CONSTANTS, null, 1, null, NOW);
    expect(res.status).toBe('current_epoch');
  });

  it('N-1 set but not yet distributable waits for uptime', () => {
    expect(derive(row(37, '35120550000000000000000', true, false)).status).toBe('waiting_uptime');
  });

  it('N-1 unset shows funding deadline', () => {
    const res = derive(row(37, '0', false, false));
    expect(res.status).toBe('not_set');
    expect(res.human).toContain('fund by');
  });

  it('N-2 IS distributable (boundary): funded but not started waits for uptime', () => {
    expect(derive(row(36, '100', true, false)).status).toBe('waiting_uptime');
  });

  it('distributable epoch mid-distribution reports progress k/n', () => {
    const res = derive(row(36, '100', true, false), { distribution: { processed: 1, isComplete: false } });
    expect(res.status).toBe('distributing');
    expect(res.human).toBe('distributing 1/2 ops');
  });

  it('set but unfunded past the deadline is an alertable funding_closed', () => {
    const lateNow = epochStartOf(TIMING, 30) + 5 * TIMING.epochDuration;
    expect(derive(row(30, '100', false, false), { now: lateNow }).status).toBe('funding_closed');
  });

  it('never-set epoch past the deadline is not_set_closed', () => {
    const lateNow = epochStartOf(TIMING, 30) + 5 * TIMING.epochDuration;
    expect(derive(row(30, '0', false, false), { now: lateNow }).status).toBe('not_set_closed');
  });

  it('distributed epoch within grace is claimable now', () => {
    const justAfterStart = epochStartOf(TIMING, 36) + (CONSTANTS.distributionEarliestOffset) * TIMING.epochDuration;
    expect(derive(row(36, '100', true, true), { now: justAfterStart }).status).toBe('claimable');
  });

  it('distributed epoch past grace becomes reclaimable', () => {
    const farFuture = epochStartOf(TIMING, 32) + 10 * TIMING.epochDuration;
    expect(derive(row(32, '100', true, true), { now: farFuture }).status).toBe('reclaimable');
  });

  it('accumulation warning wins over everything', () => {
    expect(derive(row(35, '100', true, true), { setTxCount: 3 }).status).toBe('accumulation_warning');
    expect(derive(row(35, '100', true, true), { setTxCount: 3 }).human).toContain('3 set-amount txs');
  });

  it('setTxCount null (alerts mode, no scan) skips accumulation assessment', () => {
    expect(derive(row(35, '100', true, true), { setTxCount: null }).status).not.toBe('accumulation_warning');
  });
});

describe('countSetAmountTxs', () => {
  const ev = (startEpoch: number, numberOfEpochs: number): HeartbeatEvent => ({
    eventName: 'RewardsAmountSet',
    blockNumber: '1', transactionHash: '0x1',
    args: { startEpoch, numberOfEpochs: String(numberOfEpochs) },
  });

  it('counts events whose epoch span covers the target epoch', () => {
    const events = [ev(35, 1), ev(35, 1), ev(34, 3)]; // 34-36 span covers 35 too
    expect(countSetAmountTxs(events, 35)).toBe(3);
    expect(countSetAmountTxs(events, 36)).toBe(1);
    expect(countSetAmountTxs(events, 37)).toBe(0);
  });

  it('ignores other event types', () => {
    const events: HeartbeatEvent[] = [{ eventName: 'RewardsDistributed', blockNumber: '1', transactionHash: '0x1', args: { epoch: 35 } }];
    expect(countSetAmountTxs(events, 35)).toBe(0);
  });
});

describe('detectStuckTwoPhase', () => {
  const ev = (eventName: string, validationID: string): HeartbeatEvent => ({
    eventName, blockNumber: '1', transactionHash: `0x-${eventName}`, args: { validationID },
  });

  it('returns empty for matched Initiated+Completed pairs', () => {
    expect(detectStuckTwoPhase([
      ev('InitiatedValidatorRegistration', '0xv1'),
      ev('CompletedValidatorRegistration', '0xv1'),
    ])).toEqual([]);
  });

  it('flags Initiated without a matching Completed', () => {
    const stuck = detectStuckTwoPhase([
      ev('InitiatedValidatorWeightUpdate', '0xv2'),
      ev('CompletedValidatorRegistration', '0xv2'), // different pair — must not satisfy weight update
    ]);
    expect(stuck).toHaveLength(1);
    expect(stuck[0]).toMatchObject({ validationID: '0xv2', initiated: 'InitiatedValidatorWeightUpdate' });
  });
});

describe('runAlertChecks', () => {
  const baseInput = () => ({
    timing: TIMING,
    constants: CONSTANTS,
    allClassesCached: true,
    claimability: [] as ClaimabilityRow[],
    uptimeSetByOperator: {} as Record<string, boolean | null>,
    lstPaused: false as boolean | null,
    validatorBalances: [{ nodeID: 'NodeID-x', balanceAVAX: '2.5' }],
    stuckTwoPhase: [] as Array<{ validationID: string; initiated: string }>,
    thresholds: { pChainMinAVAX: 0.05, cacheLateDays: 1, uptimeMissingEpochFraction: 0.5 },
    now: NOW,
  });

  it('all-good input yields only ok checks', () => {
    const checks = runAlertChecks(baseInput());
    expect(checks.filter((c) => c.status !== 'ok')).toEqual([]);
  });

  it('warns when cache incomplete and window closes within a day', () => {
    const input = baseInput();
    input.allClassesCached = false;
    input.now = TIMING.currentEpochStartTs + TIMING.updateWindow - 3600; // 1h before close
    const cache = runAlertChecks(input).find((c) => c.name === 'stake_cache');
    expect(cache?.status).toBe('warn');
  });

  it('alerts when cache incomplete and window already closed', () => {
    const input = baseInput();
    input.allClassesCached = false;
    input.now = TIMING.currentEpochStartTs + TIMING.updateWindow + 3600;
    expect(runAlertChecks(input).find((c) => c.name === 'stake_cache')?.status).toBe('alert');
  });

  it('warns on missing uptime past half the epoch', () => {
    const input = baseInput();
    input.uptimeSetByOperator = { '0xop': false };
    input.now = TIMING.currentEpochStartTs + 0.6 * TIMING.epochDuration;
    expect(runAlertChecks(input).find((c) => c.name === 'uptime_missing')?.status).toBe('warn');
  });

  it('alerts on low P-Chain balance', () => {
    const input = baseInput();
    input.validatorBalances = [{ nodeID: 'NodeID-low', balanceAVAX: '0.01' }];
    expect(runAlertChecks(input).find((c) => c.name === 'pchain_balance_low')?.status).toBe('alert');
  });

  it('alerts on paused LST wrapper and warns on stuck two-phase', () => {
    const input = baseInput();
    input.lstPaused = true;
    input.stuckTwoPhase = [{ validationID: '0xv', initiated: 'InitiatedValidatorRemoval' }];
    const checks = runAlertChecks(input);
    expect(checks.find((c) => c.name === 'lst_paused')?.status).toBe('alert');
    expect(checks.find((c) => c.name === 'stuck_two_phase')?.status).toBe('warn');
  });

  it('warns on stalled distribution only past the earliest-offset boundary (constant-driven)', () => {
    const input = baseInput();
    input.claimability = [
      // N-2 = first distributable epoch: distributing is normal, no warning yet
      { ...row(36, '100', true, false), setAlot: '100', setTxCount: 1, status: 'distributing', statusHuman: '' },
      // N-3: distributable for over an epoch and still incomplete → stalled
      { ...row(35, '100', true, false), setAlot: '100', setTxCount: 1, status: 'distributing', statusHuman: '' },
    ];
    const stalled = runAlertChecks(input).filter((c) => c.name === 'distribution_stalled');
    expect(stalled).toHaveLength(1);
    expect(stalled[0].epoch).toBe(35);
  });

  it('escalates accumulation and funding_closed rows from the claimability table', () => {
    const input = baseInput();
    input.claimability = [
      { ...row(35, '100', true, true), setAlot: '100', setTxCount: 3, status: 'accumulation_warning', statusHuman: '' },
      { ...row(33, '100', false, false), setAlot: '100', setTxCount: 1, status: 'funding_closed', statusHuman: '' },
    ];
    const checks = runAlertChecks(input);
    expect(checks.find((c) => c.name === 'set_amount_accumulation')?.epoch).toBe(35);
    expect(checks.find((c) => c.name === 'funding_deadline')?.status).toBe('alert');
  });
});

describe('summarizeRewardsActivity', () => {
  it('joins non-zero counts and flags zero-claims', () => {
    const line = summarizeRewardsActivity({ RewardsAmountSet: 5, RewardsDistributed: 2, RewardsClaimed: 0, UndistributedRewardsClaimed: 4, OperatorFeeClaimed: 1, CuratorFeeClaimed: 0, ProtocolFeeClaimed: 0, ZeroRewardsClaim: 1 });
    expect(line).toBe('5 set-amount · 2 distributed · 4 undistributed reclaimed · 1 fee claims · 1 zero-claim ⚠');
  });

  it('reports quiet windows', () => {
    expect(summarizeRewardsActivity({})).toBe('no rewards activity');
  });
});

describe('buildHumanLines', () => {
  const okCheck = { name: 'x', status: 'ok' as const, detail: '', human: 'fine' };
  const warnCheck = { name: 'y', status: 'warn' as const, detail: '', human: '⚠️ something' };

  it('alerts mode returns empty lines when all checks pass (post nothing)', () => {
    const lines = buildHumanLines({ mode: 'alerts', timing: TIMING, cacheOk: true, changedLines: [], validatorSummary: null, tvlLine: null, activityLine: null, claimability: [], checks: [okCheck] });
    expect(lines).toEqual([]);
  });

  it('alerts mode lists only non-ok checks', () => {
    const lines = buildHumanLines({ mode: 'alerts', timing: TIMING, cacheOk: true, changedLines: [], validatorSummary: null, tvlLine: null, activityLine: null, claimability: [], checks: [okCheck, warnCheck] });
    expect(lines[0]).toContain('epoch 38');
    expect(lines.some((l) => l.includes('⚠️ something'))).toBe(true);
  });

  it('digest mode renders header, quiet CHANGED section and REWARDS table', () => {
    const claimability: ClaimabilityRow[] = [
      { ...row(37, '35120550000000000000000', true, false), setAlot: '35,120.55', setTxCount: 1, status: 'waiting_uptime', statusHuman: 'waiting uptime' },
    ];
    const lines = buildHumanLines({ mode: 'digest', timing: TIMING, cacheOk: true, changedLines: [], validatorSummary: 'validators 10', tvlLine: null, activityLine: 'no rewards activity', claimability, checks: [okCheck] });
    expect(lines[0]).toContain('epoch 38 started');
    expect(lines).toContain('  no node/stake/validator changes');
    expect(lines.some((l) => l.includes('35,120.55'))).toBe(true);
    expect(lines.some((l) => l.includes('waiting uptime'))).toBe(true);
  });
});

// ── Behavioral test: full tool handler with mocked runCli ──

type MockResponses = Record<string, unknown>;

/** Routes a runCli args array to a canned response by matching the subcommand. */
function mockRunCli(responses: MockResponses) {
  (runCli as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
    const key = Object.keys(responses).find((k) => args.join(' ').includes(k));
    if (!key) return { success: false, data: null, error: `unmocked call: ${args.join(' ')}` };
    return { success: true, data: responses[key] };
  });
}

function getHandler(): (params: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; structuredContent?: unknown; isError?: boolean }> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerHeartbeatTools(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tool = (server as any)._registeredTools['deployment_heartbeat'];
  expect(tool).toBeDefined();
  return (params) => tool.handler(params, {});
}

const MOCK_BASE: MockResponses = {
  'get-epoch-config': { epochConfig: { epoch: 38, epochDuration: 302_400, updateWindow: 259_200, lastNodeStakeUpdateEpoch: 38 } },
  'get-epoch-start-ts': { epochStartTs: Math.floor(Date.now() / 1000) - 100_000 },
  'get-cache-status': { cacheStatus: { allClassesCached: true } },
  'get-all-operators': { operators: ['0x853323787b0F515d2C2b1c64994BA7D312B6e655'] },
  'get-epoch-status': {
    epochStatusTable: {
      fromEpoch: 32, toEpoch: 38,
      constants: { fundingDeadlineOffset: 4, distributionEarliestOffset: 2, claimGracePeriodEpochs: 1 },
      epochs: [
        { epoch: 36, epochRewards: '19402800000000000000000', funded: true, distributionComplete: false },
        { epoch: 37, epochRewards: '35120550000000000000000', funded: true, distributionComplete: false },
        { epoch: 38, epochRewards: '0', funded: false, distributionComplete: false },
      ],
    },
  },
  'lst-wrapper info': { lstWrapperInfo: { totalAssets: '5820354000000000000000000', totalSupply: '5811634000000000000000000', paused: false, symbol: 'wsALOT' } },
  'get-validator-balances': { validatorBalances: { subnetId: 'x', totalValidators: 1, validators: [{ nodeID: 'NodeID-x', validationID: 'v', operator: '0x8533', balanceNAvax: '2400000000', balanceAVAX: '2.4', weight: '500000' }] } },
  'get-distribution-batch': { distributionBatch: { lastProcessedOperator: '1', isComplete: false } },
};

const ADDRS = {
  middlewareAddress: '0x9411307279456450ABF9B5181aA7a02271f0DC34',
  rewardsAddress: '0x0f388C7c6201014Ad836400e9e2ebD211BDBcB00',
  lstWrapperAddress: '0xDc1c4428F3145286f262980d36C640285c0DA403',
  network: 'mainnet',
};

describe('deployment_heartbeat handler', () => {
  beforeEach(() => {
    (runCli as ReturnType<typeof vi.fn>).mockReset();
  });

  it('alerts mode assembles checks without event scans and returns empty humanLines when ok', async () => {
    mockRunCli(MOCK_BASE);
    const res = await getHandler()({ ...ADDRS, mode: 'alerts', windowEpochs: 6, pChainMinAVAX: 0.05, cacheLateDays: 1, uptimeMissingEpochFraction: 0.5 });
    const data = JSON.parse(res.content[0].text);

    expect(data.epoch).toBe(38);
    expect(data.rewards.claimability).toHaveLength(3);
    // epoch 37 is funded but not yet distributable (offset 2); epoch 36 is mid-distribution
    expect(data.rewards.claimability.find((r: ClaimabilityRow) => r.epoch === 37).status).toBe('waiting_uptime');
    expect(data.rewards.claimability.find((r: ClaimabilityRow) => r.epoch === 36).status).toBe('distributing');
    expect(data.humanLines).toEqual([]);
    expect(data.changed).toBeUndefined();

    // no event scans in alerts mode
    const calls = (runCli as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as string[]).join(' '));
    expect(calls.some((c) => c.includes('node-logs'))).toBe(false);
    expect(calls.some((c) => c.includes('get-events'))).toBe(false);
    // claimability window requested in one ranged call
    expect(calls.some((c) => c.includes('get-epoch-status') && c.includes('--to-epoch 38'))).toBe(true);
  });

  it('digest mode scans events, counts set-amount accumulation, and renders the digest', async () => {
    mockRunCli({
      ...MOCK_BASE,
      'node-logs': { nodeLogs: [] },
      'get-events': {
        rewardsLifecycleEvents: {
          fromBlock: '1', toBlock: '2', totalEventCount: 3,
          countsByType: { RewardsAmountSet: 2, RewardsDistributed: 1 },
          events: [
            { eventName: 'RewardsAmountSet', blockNumber: '1', transactionHash: '0xa', args: { startEpoch: 36, numberOfEpochs: '1' } },
            { eventName: 'RewardsAmountSet', blockNumber: '2', transactionHash: '0xb', args: { startEpoch: 36, numberOfEpochs: '1' } },
            { eventName: 'RewardsDistributed', blockNumber: '3', transactionHash: '0xc', args: { epoch: 36 } },
          ],
        },
      },
    });
    const res = await getHandler()({ ...ADDRS, mode: 'digest', windowEpochs: 6, pChainMinAVAX: 0.05, cacheLateDays: 1, uptimeMissingEpochFraction: 0.5 });
    const data = JSON.parse(res.content[0].text);

    expect(data.changed.quietEpoch).toBe(true);
    expect(data.rewards.claimability.find((r: ClaimabilityRow) => r.epoch === 36).status).toBe('accumulation_warning');
    expect(data.checks.some((c: { name: string }) => c.name === 'set_amount_accumulation')).toBe(true);
    expect(data.humanLines.length).toBeGreaterThan(5);
    expect(data.humanLines[0]).toContain('epoch 38 started');
    expect(data.humanLines.some((l: string) => l.includes('2 set-amount'))).toBe(true);
  });

  it('degrades gracefully when a sub-call fails, surfacing _warnings', async () => {
    const partial = { ...MOCK_BASE } as MockResponses;
    delete partial['get-validator-balances'];
    mockRunCli(partial);
    const res = await getHandler()({ ...ADDRS, mode: 'alerts', windowEpochs: 6, pChainMinAVAX: 0.05, cacheLateDays: 1, uptimeMissingEpochFraction: 0.5 });
    const data = JSON.parse(res.content[0].text);

    expect(data._warnings?.some((w: string) => w.includes('get-validator-balances'))).toBe(true);
    expect(data.checks.some((c: { name: string }) => c.name === 'pchain_validators')).toBe(true);
  });

  it('fails cleanly when epoch config is unavailable', async () => {
    mockRunCli({});
    const res = await getHandler()({ ...ADDRS, mode: 'alerts', windowEpochs: 6, pChainMinAVAX: 0.05, cacheLateDays: 1, uptimeMissingEpochFraction: 0.5 });
    expect(res.isError).toBe(true);
  });
});
