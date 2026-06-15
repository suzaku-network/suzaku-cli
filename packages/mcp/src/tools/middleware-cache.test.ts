import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../cli-runner.js', () => ({
  runCli: vi.fn(),
  runPublicCacheCli: vi.fn(),
  formatResult: (r: { success: boolean; data: unknown; error?: string }) =>
    r.success
      ? { content: [{ type: 'text', text: JSON.stringify(r.data) }], structuredContent: r.data }
      : { content: [{ type: 'text', text: `Error: ${r.error ?? 'Unknown error'}` }], isError: true },
  formatGuardError: (err: string) => ({ content: [{ type: 'text', text: `Error: ${err}` }], isError: true }),
  requireSigner: vi.fn(() => null),
  WARP_TIMEOUT: 300_000,
}));

vi.mock('../guard.js', () => ({
  guardWriteOperation: vi.fn(async () => null),
}));

import { runCli, runPublicCacheCli } from '../cli-runner.js';
import { registerMiddlewarePublicCacheTools } from './middleware.js';

const MIDDLEWARE = '0x' + 'a'.repeat(40);
const OTHER_MIDDLEWARE = '0x' + 'b'.repeat(40);

function getHandler() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerMiddlewarePublicCacheTools(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as any)._registeredTools.middleware_cache_stakes.handler as (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

function cacheStatus(cacheByClass: Record<string, boolean>) {
  return { success: true, data: { cacheStatus: { cacheByClass } } };
}

beforeEach(() => {
  process.env.SUZAKU_MIDDLEWARE_ADDRESS = MIDDLEWARE;
  process.env.SUZAKU_MIDDLEWARE_NETWORK = 'mainnet';
  (runCli as ReturnType<typeof vi.fn>).mockReset();
  (runPublicCacheCli as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(() => {
  delete process.env.SUZAKU_MIDDLEWARE_ADDRESS;
  delete process.env.SUZAKU_MIDDLEWARE_NETWORK;
});

describe('middleware_cache_stakes', () => {
  it('rejects non-pinned middleware, wrong network, and rpcUrl', async () => {
    const handler = getHandler();

    let res = await handler({ middlewareAddress: OTHER_MIDDLEWARE, epoch: '38', collateralClass: '1', network: 'mainnet' });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('pinned SUZAKU_MIDDLEWARE_ADDRESS');

    res = await handler({ middlewareAddress: MIDDLEWARE, epoch: '38', collateralClass: '1', network: 'fuji' });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('SUZAKU_MIDDLEWARE_NETWORK');

    res = await handler({ middlewareAddress: MIDDLEWARE, epoch: '38', collateralClass: '1', network: 'mainnet', rpcUrl: 'https://rpc.example.com' });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('rpcUrl is not accepted');
  });

  it('returns without execution when the target class is already cached', async () => {
    (runCli as ReturnType<typeof vi.fn>).mockResolvedValue(cacheStatus({ '1': true, '2': false }));
    const handler = getHandler();

    const res = await handler({ middlewareAddress: MIDDLEWARE, epoch: '38', collateralClass: '1', network: 'mainnet' });

    expect(res.isError).toBeUndefined();
    expect((res.structuredContent as Record<string, unknown>).executed).toBe(false);
    expect(runPublicCacheCli).not.toHaveBeenCalled();
    expect(runCli).toHaveBeenCalledWith(
      ['middleware', 'get-cache-status', MIDDLEWARE, '--epoch', '38'],
      { network: 'mainnet', skipDedup: true },
    );
  });

  it('executes the exact public cache CLI command when the target class is missing', async () => {
    (runCli as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(cacheStatus({ '1': false, '2': true }))
      .mockResolvedValueOnce(cacheStatus({ '1': true, '2': true }));
    (runPublicCacheCli as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: { txs: { hash: '0x' + '1'.repeat(64) } } });
    const handler = getHandler();

    const res = await handler({ middlewareAddress: MIDDLEWARE, epoch: '38', collateralClass: '1', network: 'mainnet' });

    expect(res.isError).toBeUndefined();
    expect((res.structuredContent as Record<string, unknown>).executed).toBe(true);
    expect((res.structuredContent as Record<string, unknown>).classCached).toBe(true);
    expect((res.structuredContent as Record<string, unknown>).transactionResult).toEqual({ txs: { hash: '0x' + '1'.repeat(64) } });
    expect(runPublicCacheCli).toHaveBeenCalledWith(
      ['middleware', 'calc-operator-cache', MIDDLEWARE, '38', '1', '--public-call'],
      { network: 'mainnet', timeout: 180_000 },
    );
    expect(runCli).toHaveBeenCalledTimes(2);
    expect((runCli as ReturnType<typeof vi.fn>).mock.calls[1]).toEqual([
      ['middleware', 'get-cache-status', MIDDLEWARE, '--epoch', '38'],
      { network: 'mainnet', skipDedup: true },
    ]);
  });

  it('surfaces pre-read failures without executing', async () => {
    (runCli as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, data: null, error: 'cache status read failed' });
    const handler = getHandler();

    const res = await handler({ middlewareAddress: MIDDLEWARE, epoch: '38', collateralClass: '1', network: 'mainnet' });

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('cache status read failed');
    expect(runPublicCacheCli).not.toHaveBeenCalled();
  });

  it('surfaces cache transaction failures and does not post-read as success', async () => {
    (runCli as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cacheStatus({ '1': false }));
    (runPublicCacheCli as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, data: null, error: 'CannotCacheFutureEpoch' });
    const handler = getHandler();

    const res = await handler({ middlewareAddress: MIDDLEWARE, epoch: '99', collateralClass: '1', network: 'mainnet' });

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('CannotCacheFutureEpoch');
    expect(runCli).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the target class is absent from cache status', async () => {
    (runCli as ReturnType<typeof vi.fn>).mockResolvedValue(cacheStatus({ '2': true }));
    const handler = getHandler();

    const res = await handler({ middlewareAddress: MIDDLEWARE, epoch: '38', collateralClass: '1', network: 'mainnet' });

    expect(res.isError).toBe(true);
    expect(JSON.stringify(res)).toContain('not present in cache status');
    expect(runPublicCacheCli).not.toHaveBeenCalled();
  });
});
