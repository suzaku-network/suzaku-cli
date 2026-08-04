import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../cli-runner.js', () => ({
  runCli: vi.fn(async () => ({ success: true, data: { ok: true } })),
  formatResult: (result: { success: boolean; data: unknown; error?: string }) => ({
    content: [{ type: 'text', text: JSON.stringify(result.data) }],
    structuredContent: result.data,
  }),
  formatGuardError: (error: string) => ({
    content: [{ type: 'text', text: `Error: ${error}` }],
    isError: true,
  }),
  requireSigner: vi.fn(() => null),
  WARP_TIMEOUT: 300_000,
}));

vi.mock('../guard.js', () => ({
  guardWriteOperation: vi.fn(async () => null),
}));

import { runCli } from '../cli-runner.js';
import { registerMiddlewareTools } from './middleware.js';
import { registerRewardsTools } from './rewards.js';

const MIDDLEWARE = `0x${'1'.repeat(40)}`;
const REWARDS = `0x${'2'.repeat(40)}`;
const SECRET = 'must-not-appear-in-argv';

function tools() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerMiddlewareTools(server, true);
  registerRewardsTools(server, true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as any)._registeredTools as Record<string, {
    handler: (params: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>;
  }>;
}

describe('event-scan credential transport', () => {
  beforeEach(() => {
    process.env.ETHERSCAN_API_KEY = SECRET;
    (runCli as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    delete process.env.ETHERSCAN_API_KEY;
  });

  it.each([
    ['middleware_get_node_logs', { middlewareAddress: MIDDLEWARE, fromEpoch: '50', network: 'mainnet' }],
    ['rewards_get_events', { rewardsAddress: REWARDS, middlewareAddress: MIDDLEWARE, fromEpoch: '50', network: 'mainnet' }],
  ])('%s keeps the explorer key out of argv and opts into scoped env forwarding', async (name, params) => {
    await tools()[name].handler(params, {});

    expect(runCli).toHaveBeenCalledOnce();
    const [args, options] = (runCli as ReturnType<typeof vi.fn>).mock.calls[0] as [string[], Record<string, unknown>];
    expect(args).not.toContain('--snowscan-api-key');
    expect(args).not.toContain(SECRET);
    expect(options).toMatchObject({ eventScan: true });
  });

  it('keeps global stake events opt-in at the MCP boundary', async () => {
    const handler = tools().middleware_get_node_logs.handler;
    await handler({ middlewareAddress: MIDDLEWARE, fromEpoch: '50', network: 'mainnet' }, {});
    expect((runCli as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toContain('--include-global-stake-events');

    (runCli as ReturnType<typeof vi.fn>).mockClear();
    await handler({
      middlewareAddress: MIDDLEWARE,
      fromEpoch: '50',
      includeGlobalStakeEvents: true,
      network: 'mainnet',
    }, {});
    expect((runCli as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('--include-global-stake-events');
  });
});
