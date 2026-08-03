import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../cli-runner.js', () => ({
  runCli: vi.fn(),
  formatResult: (r: { success: boolean; data: unknown; error?: string }) =>
    r.success
      ? { content: [{ type: 'text', text: JSON.stringify(r.data) }], structuredContent: r.data }
      : { content: [{ type: 'text', text: `Error: ${r.error ?? 'Unknown error'}` }], isError: true },
  formatGuardError: (err: string) => ({ content: [{ type: 'text', text: `Error: ${err}` }], isError: true }),
  requireSigner: () => null,
  WARP_TIMEOUT: 300_000,
}));

vi.mock('../guard.js', () => ({
  guardWriteOperation: vi.fn(async () => null),
}));

import { runCli } from '../cli-runner.js';
import { registerRewardsTools } from './rewards.js';

const REWARDS = '0x' + 'a'.repeat(40);
const MIDDLEWARE = '0x' + 'b'.repeat(40);
const SAFE = '0x' + 'c'.repeat(40);
const SAFE_TX_HASH = '0x' + 'd'.repeat(64);

interface ChainState {
  epochRewards: string;
  currentEpoch: number;
  eventCount: number | null;
  isComplete: boolean | string;
  deadlineTs: number;
}

/** Dispatching runCli mock that simulates the CLI reads + the propose call */
function mockChain(state: ChainState) {
  (runCli as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
    const cmd = args.slice(0, 2).join(' ');
    switch (cmd) {
      case 'rewards get-epoch-rewards':
        return { success: true, data: { epochRewards: state.epochRewards } };
      case 'rewards get-fees-config':
        return { success: true, data: { protocolFee: '500', operatorFee: '0', curatorFee: '0' } };
      case 'rewards get-epoch-status':
        return {
          success: true,
          data: {
            epochStatusTable: {
              constants: { distributionEarliestOffset: 2 },
              epochs: [{
                epoch: Number(args[3]),
                epochRewards: state.epochRewards,
                funded: state.epochRewards !== '0',
                distributionComplete: state.isComplete,
              }],
            },
          },
        };
      case 'middleware get-current-epoch':
        return { success: true, data: { epoch: state.currentEpoch } };
      case 'middleware get-epoch-start-ts':
        return { success: true, data: { epochStartTs: state.deadlineTs } };
      case 'rewards get-amount-set-events':
        return state.eventCount === null
          ? { success: false, data: null, error: 'SNOWSCAN_API_KEY unavailable' }
          : {
            success: true,
            data: { rewardsAmountSetEvents: { eventCount: state.eventCount, totalAmount: state.epochRewards } },
          };
      case 'rewards get-distribution-batch':
        {
          const lastProcessedOperator =
            state.isComplete === true || state.isComplete === 'true' ? '3' : '0';
          return {
            success: true,
            data: {
              isComplete: state.isComplete,
              lastProcessedOperator,
              distributionBatch: { isComplete: state.isComplete, lastProcessedOperator },
            },
          };
        }
      case 'rewards get-min-uptime':
        return { success: true, data: { minRequiredUptime: '241200' } };
      case 'rewards set-amount':
      case 'rewards distribute':
        return { success: true, data: { safeTxHash: SAFE_TX_HASH, safeQueueUrl: `https://app.safe.global/transactions/queue?safe=avax:${SAFE}` } };
      default:
        return { success: false, data: null, error: `unexpected command: ${cmd}` };
    }
  });
}

function emptySafeQueue() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ results: [] }),
  })));
}

function getHandlers() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerRewardsTools(server, false, true); // propose-only profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools;
  return {
    tools,
    setAmount: (params: Record<string, unknown>) => tools['rewards_set_amount_propose'].handler(params, {}),
    distribute: (params: Record<string, unknown>) => tools['rewards_distribute_propose'].handler(params, {}),
    diagnosis: (params: Record<string, unknown>) => tools['rewards_epoch_diagnosis'].handler(params, {}),
    minUptime: (params: Record<string, unknown>) => tools['rewards_get_min_uptime'].handler(params, {}),
  };
}

const HEALTHY: ChainState = {
  epochRewards: '0',
  currentEpoch: 47,
  eventCount: 0,
  isComplete: false,
  deadlineTs: 1_900_000_000,
};

beforeEach(() => {
  (runCli as ReturnType<typeof vi.fn>).mockReset();
  process.env.SUZAKU_SAFE_ADDRESS = SAFE;
  process.env.SUZAKU_REWARDS_ADDRESS = REWARDS;
  process.env.SUZAKU_MIDDLEWARE_ADDRESS = MIDDLEWARE;
  process.env.SUZAKU_MAX_REWARDS_AMOUNT = '20000';
  emptySafeQueue();
});

afterEach(() => {
  delete process.env.SUZAKU_SAFE_ADDRESS;
  delete process.env.SUZAKU_REWARDS_ADDRESS;
  delete process.env.SUZAKU_MIDDLEWARE_ADDRESS;
  delete process.env.SUZAKU_MAX_REWARDS_AMOUNT;
  delete process.env.ETHERSCAN_API_KEY;
  vi.unstubAllGlobals();
});

describe('propose-only registration', () => {
  it('registers only the two propose tools as writes when proposeOnly is set', () => {
    const { tools } = getHandlers();
    expect(tools['rewards_set_amount_propose']).toBeDefined();
    expect(tools['rewards_distribute_propose']).toBeDefined();
    expect(tools['rewards_set_amount']).toBeUndefined();
    expect(tools['rewards_distribute']).toBeUndefined();
    expect(tools['rewards_claim']).toBeUndefined();
    expect(tools['rewards_claim_undistributed']).toBeUndefined();
    // reads still present
    expect(tools['rewards_get_epoch_rewards']).toBeDefined();
    expect(tools['rewards_epoch_diagnosis']).toBeDefined();
  });

  it('registers both direct writes and propose tools when neither flag is set', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerRewardsTools(server);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any)._registeredTools;
    expect(tools['rewards_set_amount']).toBeDefined();
    expect(tools['rewards_set_amount_propose']).toBeDefined();
  });

  it('registers no write or propose tools in read-only mode', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerRewardsTools(server, true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any)._registeredTools;
    expect(tools['rewards_set_amount']).toBeUndefined();
    expect(tools['rewards_set_amount_propose']).toBeUndefined();
    expect(tools['rewards_distribute_propose']).toBeUndefined();
  });
});

describe('read-only rewards decisions', () => {
  it.each([
    { targetEpoch: 20, currentEpoch: 21 },
    { targetEpoch: 100, currentEpoch: 102 },
  ])(
    'computes settability dynamically for target $targetEpoch at current $currentEpoch',
    async ({ targetEpoch, currentEpoch }) => {
      mockChain({
        ...HEALTHY,
        currentEpoch,
        epochRewards: '11429450000000000000000',
        eventCount: 1,
      });
      const { diagnosis } = getHandlers();
      const res = await diagnosis({
        rewardsAddress: REWARDS,
        middlewareAddress: MIDDLEWARE,
        epoch: String(targetEpoch),
        network: 'mainnet',
      });
      const readiness = (res.structuredContent as Record<string, any>).setAmountReadiness;
      expect(readiness).toMatchObject({
        targetEpoch,
        currentEpoch,
        withinBotOperationalWindow: true,
        alreadyFunded: true,
        additionalSetWouldAccumulate: true,
        botSettableThroughEpoch: targetEpoch + 2,
        botWindowClosesAtEpoch: targetEpoch + 3,
        recommendedAction: 'do_not_set_already_funded',
      });
      expect(readiness.human).toContain("inside the bot's operational window");
      expect(readiness.human).toContain('would add, not overwrite');
    },
  );

  it('distinguishes future, stale, and safe-to-set epochs', async () => {
    const cases = [
      {
        state: { ...HEALTHY, currentEpoch: 50 },
        targetEpoch: 50,
        action: 'wait_for_epoch_completion',
        canSet: false,
      },
      {
        state: { ...HEALTHY, currentEpoch: 53 },
        targetEpoch: 50,
        action: 'bot_set_amount_window_closed',
        canSet: false,
      },
      {
        state: { ...HEALTHY, currentEpoch: 51 },
        targetEpoch: 50,
        action: 'set_amount_before_deadline',
        canSet: true,
      },
    ];
    for (const testCase of cases) {
      mockChain(testCase.state);
      const { diagnosis } = getHandlers();
      const res = await diagnosis({
        rewardsAddress: REWARDS,
        middlewareAddress: MIDDLEWARE,
        epoch: String(testCase.targetEpoch),
        network: 'mainnet',
      });
      const readiness = (res.structuredContent as Record<string, any>).setAmountReadiness;
      expect(readiness.recommendedAction).toBe(testCase.action);
      expect(readiness.withinBotOperationalWindow).toBe(testCase.canSet);
    }
  });

  it('fails closed on an unavailable event scan when no funding is visible', async () => {
    mockChain({ ...HEALTHY, currentEpoch: 51, eventCount: null });
    const { diagnosis } = getHandlers();
    const res = await diagnosis({
      rewardsAddress: REWARDS,
      middlewareAddress: MIDDLEWARE,
      epoch: '50',
      network: 'mainnet',
    });
    const data = res.structuredContent as Record<string, any>;
    expect(data.setAmountReadiness).toMatchObject({
      withinBotOperationalWindow: true,
      alreadyFunded: false,
      eventHistoryAvailable: false,
      additionalSetWouldAccumulate: null,
      recommendedAction: 'verify_event_history_before_setting',
    });
    const historyCall = (runCli as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => (call[0] as string[])[1] === 'get-amount-set-events',
    );
    expect(historyCall?.[1]).toMatchObject({ timeout: 300_000, eventScan: true });
    expect(JSON.stringify(data)).not.toContain('SNOWSCAN_API_KEY');
  });

  it('separates source-proven contract capability from the bot policy window', async () => {
    mockChain({
      ...HEALTHY,
      currentEpoch: 51,
      epochRewards: '0',
      eventCount: 0,
    });
    const { diagnosis } = getHandlers();
    const res = await diagnosis({
      rewardsAddress: REWARDS,
      middlewareAddress: MIDDLEWARE,
      epoch: '50',
      network: 'mainnet',
    });
    expect((res.structuredContent as Record<string, any>).setAmountReadiness).toMatchObject({
      withinBotOperationalWindow: true,
      distributionOpenEpoch: 52,
      distributionStarted: false,
      distributionStartFullyObservable: false,
      contractCanAcceptValidSetAmount: true,
      recommendedAction: 'set_amount_before_deadline',
    });
  });

  it('marks the uptime getter as current-only evidence', async () => {
    mockChain(HEALTHY);
    const { minUptime } = getHandlers();
    const res = await minUptime({ rewardsAddress: REWARDS, network: 'mainnet' });
    expect(res.structuredContent).toMatchObject({
      minRequiredUptime: '241200',
      historyAvailable: false,
    });
    expect((res.structuredContent as Record<string, string>).historyNote).toContain('current value only');
  });
});

describe('rewards_set_amount_propose', () => {
  it('proposes with numberOfEpochs hardcoded to 1 and returns the verification echo', async () => {
    process.env.ETHERSCAN_API_KEY = 'must-not-appear-in-argv';
    mockChain(HEALTHY);
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBeUndefined();

    const proposeCall = (runCli as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[0] as string[]).join(' ').startsWith('rewards set-amount'),
    );
    expect(proposeCall).toBeDefined();
    expect(proposeCall![0]).toEqual(['rewards', 'set-amount', REWARDS, '46', '1', '10450', '--safe-propose']);
    expect(proposeCall![1]).toMatchObject({ privateKey: true, bypassSuggest: true });

    const data = res.structuredContent as Record<string, unknown>;
    expect(data.proposed).toBe(true);
    expect(data.safeTxHash).toBe(SAFE_TX_HASH);
    expect((data.proposal as Record<string, unknown>).numberOfEpochs).toBe(1);
    expect(Array.isArray(data.verifyBeforeSigning)).toBe(true);
    expect(JSON.stringify(data.verifyBeforeSigning)).toContain('rewards_epoch_diagnosis');
    expect((data.preCheck as Record<string, unknown>).at).toBeTruthy();

    const historyCall = (runCli as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[0] as string[])[1] === 'get-amount-set-events',
    );
    expect(historyCall).toBeDefined();
    expect(historyCall![0]).not.toContain('--snowscan-api-key');
    expect(historyCall![0]).not.toContain('must-not-appear-in-argv');
    expect(historyCall![1]).toMatchObject({ eventScan: true });
  });

  it('REFUSES when the epoch already has rewards set (accumulation guard)', async () => {
    mockChain({ ...HEALTHY, epochRewards: '9701400000000000000000' });
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('ACCUMULATES');
    expect((runCli as ReturnType<typeof vi.fn>).mock.calls.some(
      (c: unknown[]) => (c[0] as string[])[1] === 'set-amount',
    )).toBe(false);
  });

  it('REFUSES when set-amount events already exist even if epochRewards is 0', async () => {
    mockChain({ ...HEALTHY, eventCount: 2 });
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('accumulation guard');
  });

  it('REFUSES an epoch that has not completed', async () => {
    mockChain({ ...HEALTHY, currentEpoch: 46 });
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('not completed');
  });

  it('REFUSES a stale epoch more than two epochs back', async () => {
    mockChain({ ...HEALTHY, currentEpoch: 50 });
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('stale');
  });

  it('REFUSES zero, negative, malformed, and over-cap amounts', async () => {
    mockChain(HEALTHY);
    const { setAmount } = getHandlers();
    for (const rewardsAmount of ['0', '-5', 'abc', '1e5', '20000', '99999']) {
      const res = await setAmount({ epoch: '46', rewardsAmount, network: 'mainnet' });
      expect(res.isError, `amount "${rewardsAmount}" should be refused`).toBe(true);
    }
    expect((runCli as ReturnType<typeof vi.fn>).mock.calls.some(
      (c: unknown[]) => (c[0] as string[])[1] === 'set-amount',
    )).toBe(false);
  });

  it('REFUSES when a matching proposal is already pending in the Safe queue', async () => {
    mockChain(HEALTHY);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{
          safeTxHash: '0x' + 'e'.repeat(64),
          to: '0x' + 'f'.repeat(40), // MultiSend contract
          data: '0x8d80ff0a' + REWARDS.slice(2).toLowerCase() + 'bcad858a',
        }],
      }),
    })));
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('pending Safe proposal');
  });

  it('REFUSES when SUZAKU_MAX_REWARDS_AMOUNT is unconfigured (no silent uncapped propose)', async () => {
    mockChain(HEALTHY);
    delete process.env.SUZAKU_MAX_REWARDS_AMOUNT;
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('SUZAKU_MAX_REWARDS_AMOUNT is not configured');
    expect((runCli as ReturnType<typeof vi.fn>).mock.calls.some(
      (c: unknown[]) => (c[0] as string[])[1] === 'set-amount',
    )).toBe(false);
  });

  it('does NOT block on an UNRELATED pending tx (no false positive)', async () => {
    mockChain(HEALTHY);
    const otherContract = '0x' + '9'.repeat(40);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{
          safeTxHash: '0x' + 'e'.repeat(64),
          to: otherContract,                       // different contract
          data: '0xa9059cbb' + '0'.repeat(128),    // ERC20 transfer, not set-amount
        }],
      }),
    })));
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBeUndefined();
    expect((res.structuredContent as Record<string, unknown>).proposed).toBe(true);
  });

  it('proposes with a warning when the Safe queue check is unavailable (fail-open)', async () => {
    mockChain(HEALTHY);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBeUndefined();
    const data = res.structuredContent as Record<string, unknown>;
    expect(JSON.stringify(data._warnings)).toContain('verify the queue manually');
  });

  it('fails closed when the epoch-rewards pre-check read fails', async () => {
    (runCli as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, data: null, error: 'rpc down' });
    const { setAmount } = getHandlers();
    const res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Pre-check failed');
  });

  it('refuses without SUZAKU_SAFE_ADDRESS and without a rewards address', async () => {
    mockChain(HEALTHY);
    const { setAmount } = getHandlers();

    delete process.env.SUZAKU_SAFE_ADDRESS;
    let res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('SUZAKU_SAFE_ADDRESS');

    process.env.SUZAKU_SAFE_ADDRESS = SAFE;
    delete process.env.SUZAKU_REWARDS_ADDRESS;
    res = await setAmount({ epoch: '46', rewardsAmount: '10450', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('SUZAKU_REWARDS_ADDRESS');
  });
});

describe('rewards_distribute_propose', () => {
  it('proposes a distribution batch with bypassSuggest', async () => {
    mockChain({ ...HEALTHY, epochRewards: '9701400000000000000000' });
    const { distribute } = getHandlers();
    const res = await distribute({ epoch: '46', batchSize: '10', network: 'mainnet' });
    expect(res.isError).toBeUndefined();

    const proposeCall = (runCli as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => (c[0] as string[])[1] === 'distribute',
    );
    expect(proposeCall![0]).toEqual(['rewards', 'distribute', REWARDS, '46', '10', '--safe-propose']);
    expect(proposeCall![1]).toMatchObject({ privateKey: true, bypassSuggest: true });
    const data = res.structuredContent as Record<string, unknown>;
    expect(data.proposed).toBe(true);
    expect(JSON.stringify(data.verifyBeforeSigning)).toContain('uptime');
  });

  it('REFUSES when the epoch has no rewards set', async () => {
    mockChain(HEALTHY); // epochRewards '0'
    const { distribute } = getHandlers();
    const res = await distribute({ epoch: '46', batchSize: '10', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('no rewards set');
  });

  it('returns early without proposing when distribution is already complete', async () => {
    mockChain({ ...HEALTHY, epochRewards: '5000', isComplete: true });
    const { distribute } = getHandlers();
    const res = await distribute({ epoch: '46', batchSize: '10', network: 'mainnet' });
    expect(res.isError).toBeUndefined();
    expect((res.structuredContent as Record<string, unknown>).proposed).toBe(false);
    expect((runCli as ReturnType<typeof vi.fn>).mock.calls.some(
      (c: unknown[]) => (c[0] as string[])[1] === 'distribute',
    )).toBe(false);
  });

  it('REFUSES a non-positive batchSize', async () => {
    mockChain({ ...HEALTHY, epochRewards: '5000' });
    const { distribute } = getHandlers();
    for (const batchSize of ['0', '-1', 'abc', '1.5']) {
      const res = await distribute({ epoch: '46', batchSize, network: 'mainnet' });
      expect(res.isError, `batchSize "${batchSize}" should be refused`).toBe(true);
    }
  });

  it('REFUSES when a distribute proposal is already pending', async () => {
    mockChain({ ...HEALTHY, epochRewards: '5000' });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ safeTxHash: '0x' + 'e'.repeat(64), to: REWARDS, data: '0x733f44ae' + '0'.repeat(128) }],
      }),
    })));
    const { distribute } = getHandlers();
    const res = await distribute({ epoch: '46', batchSize: '10', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('pending Safe proposal');
  });
});
