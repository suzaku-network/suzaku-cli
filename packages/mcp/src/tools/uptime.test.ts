import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('../cli-runner.js', () => ({
  runCli: vi.fn(async () => ({ success: true, data: { ok: true } })),
  formatResult: (r: { success: boolean; data: unknown; error?: string }) =>
    r.success
      ? { content: [{ type: 'text', text: JSON.stringify(r.data) }], structuredContent: r.data }
      : { content: [{ type: 'text', text: `Error: ${r.error ?? 'Unknown error'}` }], isError: true },
  formatGuardError: (err: string) => ({ content: [{ type: 'text', text: `Error: ${err}` }], isError: true }),
  requireSigner: () => null,
  WARP_TIMEOUT: 300_000,
}));

import { runCli } from '../cli-runner.js';
import { registerUptimeTools } from './uptime.js';

function uptimeReadHandler() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerUptimeTools(server, true); // read-only profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tool = (server as any)._registeredTools['uptime_get_validation_uptime_message'];
  expect(tool).toBeDefined();
  return (params: Record<string, unknown>) => tool.handler(params, {});
}

const BASE = { blockchainId: 'cb58id', nodeId: 'NodeID-7RWEjNGnEWz9uzbKKqpX8kxSrjPf2CCq8', network: 'mainnet' };

describe('uptime_get_validation_uptime_message SSRF guard (public read tool)', () => {
  beforeEach(() => { (runCli as ReturnType<typeof vi.fn>).mockClear(); });

  it('rejects loopback / link-local / private L1 RPC hosts without spawning the CLI', async () => {
    const handler = uptimeReadHandler();
    for (const url of [
      'http://127.0.0.1/rpc',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.5:9650',
      'http://localhost:8545',
      'http://[::1]/rpc',
    ]) {
      const res = await handler({ ...BASE, l1RpcUrl: url });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('private, loopback, or link-local');
    }
    expect(runCli).not.toHaveBeenCalled();
  });

  it('allows a public L1 RPC host', async () => {
    const handler = uptimeReadHandler();
    const res = await handler({ ...BASE, l1RpcUrl: 'https://my-l1-rpc.example.com' });
    expect(res.isError).toBeUndefined();
    expect(runCli).toHaveBeenCalledOnce();
  });

  it('rejects an unparseable l1RpcUrl', async () => {
    const handler = uptimeReadHandler();
    const res = await handler({ ...BASE, l1RpcUrl: 'http://' });
    expect(res.isError).toBe(true);
    expect(runCli).not.toHaveBeenCalled();
  });
});
