import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { bridgedStdioCommand } from './stdio-bridge.mjs';

describe('eval stdio bridge', () => {
  it('passes the executable and arguments as positional parameters', () => {
    expect(bridgedStdioCommand('/path with spaces/node', ["server's path", '--read-only'])).toEqual({
      command: '/bin/sh',
      args: [
        '-c',
        'tee /dev/null | "$@" | tee /dev/null',
        'suzaku-mcp-stdio-bridge',
        '/path with spaces/node',
        "server's path",
        '--read-only',
      ],
    });
  });

  it('connects to the built server and lists its tools', async () => {
    const launch = bridgedStdioCommand(process.execPath, [
      new URL('../dist/server.js', import.meta.url).pathname,
      '--read-only',
    ]);
    const transport = new StdioClientTransport({
      ...launch,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    const client = new Client({ name: 'eval-stdio-regression', version: '0.0.1' });

    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.length).toBe(69);
    } finally {
      await client.close();
    }
  });
});
