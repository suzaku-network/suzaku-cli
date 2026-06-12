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
  eventCount: number;
  isComplete: boolean | string;
}

/** Dispatching runCli mock that simulates the CLI reads + the propose call */
function mockChain(state: ChainState) {
  (runCli as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
    const cmd = args.slice(0, 2).join(' ');
    switch (cmd) {
      case 'rewards get-epoch-rewards':
        return { success: true, data: { epochRewards: state.epochRewards } };
      case 'middleware get-current-epoch':
        return { success: true, data: { epoch: state.currentEpoch } };
      case 'rewards get-amount-set-events':
        return { success: true, data: { rewardsAmountSetEvents: { eventCount: state.eventCount } } };
      case 'rewards get-distribution-batch':
        return { success: true, data: { distributionBatch: { isComplete: state.isComplete, lastProcessedOperator: '3' } } };
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
  };
}

const HEALTHY: ChainState = { epochRewards: '0', currentEpoch: 47, eventCount: 0, isComplete: false };

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

describe('rewards_set_amount_propose', () => {
  it('proposes with numberOfEpochs hardcoded to 1 and returns the verification echo', async () => {
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
