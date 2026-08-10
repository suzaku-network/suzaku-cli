import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../cli-runner.js', () => ({
  runCli: vi.fn(),
  formatResult: (result: { success: boolean; data: unknown; error?: string }) => ({
    content: [{ type: 'text', text: JSON.stringify(result.data) }],
    structuredContent: result.data,
  }),
  formatGuardError: (error: string) => ({
    content: [{ type: 'text', text: `Error: ${error}` }],
    isError: true,
  }),
  requireSigner: vi.fn(() => null),
}));

vi.mock('../guard.js', () => ({
  guardWriteOperation: vi.fn(async () => null),
}));

import { runCli } from '../cli-runner.js';
import { registerMiddlewareTools } from './middleware.js';

const MIDDLEWARE = `0x${'1'.repeat(40)}`;

describe('middleware_epoch_status deterministic timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T16:27:49Z'));
    (runCli as ReturnType<typeof vi.fn>).mockImplementation(async (args: string[]) => {
      switch (args[1]) {
        case 'get-epoch-config':
          return {
            success: true,
            data: {
              epochConfig: {
                epochDuration: 302_400,
                updateWindow: 259_200,
                epoch: 55,
                lastNodeStakeUpdateEpoch: 55,
              },
            },
          };
        case 'get-epoch-start-ts':
          return { success: true, data: { epochStartTs: 1_786_154_400 } };
        case 'get-cache-status':
          return {
            success: true,
            data: {
              cacheStatus: {
                epoch: 55,
                cacheByClass: { '1': false },
                rebalanceByOperator: {},
                allClassesCached: false,
              },
            },
          };
        default:
          throw new Error(`unexpected CLI call: ${args.join(' ')}`);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns exact UTC and relative strings so the model performs no date arithmetic', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerMiddlewareTools(server, true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools.middleware_epoch_status;

    const response = await tool.handler({ middlewareAddress: MIDDLEWARE, network: 'mainnet' }, {});
    const data = response.structuredContent;

    expect(data).toMatchObject({
      observedAtUtc: '2026-08-10T16:27:49Z',
      epoch: {
        startUtc: '2026-08-08T02:00:00Z',
        endUtc: '2026-08-11T14:00:00Z',
        timeRemaining: '21h 32m remaining',
      },
      weightUpdateWindow: {
        opensAtUtc: '2026-08-11T02:00:00Z',
        closesAtUtc: '2026-08-11T14:00:00Z',
        active: false,
        opensIn: '9h 32m remaining',
        closesIn: '21h 32m remaining',
      },
      stakeSnapshot: {
        allClassesMaterialized: false,
        actionRequired: false,
      },
    });
  });

  it('marks the final weight-update window active only after its opening offset', async () => {
    vi.setSystemTime(new Date('2026-08-11T03:00:00Z'));
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerMiddlewareTools(server, true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tool = (server as any)._registeredTools.middleware_epoch_status;

    const response = await tool.handler({ middlewareAddress: MIDDLEWARE, network: 'mainnet' }, {});
    expect(response.structuredContent.weightUpdateWindow).toMatchObject({
      opensAtUtc: '2026-08-11T02:00:00Z',
      closesAtUtc: '2026-08-11T14:00:00Z',
      active: true,
      opensIn: null,
      closesIn: '11h remaining',
    });
  });
});
