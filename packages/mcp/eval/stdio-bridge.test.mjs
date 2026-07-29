import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { bridgedStdioCommand } from './stdio-bridge.mjs';

describe('eval stdio bridge', () => {
  it('passes the executable and arguments as positional parameters', () => {
    const launch = bridgedStdioCommand('/path with spaces/node', ["server's path", '--read-only']);
    expect(launch.command).toBe('/usr/bin/setsid');
    expect(launch.args[0]).toBe('/bin/bash');
    expect(launch.args[5]).toBe('suzaku-mcp-stdio-bridge');
    expect(launch.args.slice(6)).toEqual([
      process.execPath,
      expect.stringMatching(/stdio-relay\.mjs$/),
      '/path with spaces/node',
      "server's path",
      '--read-only',
    ]);
    expect(launch.args.slice(1, 4)).toEqual(['-o', 'pipefail', '-c']);
    expect(launch.args[4]).toContain('tee /dev/null <&0 | "$@" | tee /dev/null &');
  });

  it('preserves a child nonzero exit instead of reporting the shell pipeline status', async () => {
    const launch = bridgedStdioCommand(process.execPath, ['-e', 'process.exit(7)']);
    const outcome = await new Promise((resolve, reject) => {
      const relay = spawn(launch.command, launch.args, { stdio: 'ignore' });
      relay.once('error', reject);
      relay.once('close', (code, signal) => resolve({ code, signal }));
    });
    expect(outcome).toEqual({ code: 7, signal: null });
  });

  it('preserves a child signal and terminates the relay process group', async () => {
    const launch = bridgedStdioCommand(process.execPath, [
      '-e', 'process.kill(process.pid, "SIGTERM")',
    ]);
    const outcome = await new Promise((resolve, reject) => {
      const relay = spawn(launch.command, launch.args, { stdio: 'ignore' });
      relay.once('error', reject);
      relay.once('close', (code, signal) => resolve({ code, signal }));
    });
    expect(outcome).toEqual({ code: null, signal: 'SIGTERM' });
  });

  it('does not orphan the managed child when the transport process is terminated', async () => {
    const launch = bridgedStdioCommand(process.execPath, [
      '-e', 'process.stdout.write(`${process.pid}\\n`); setInterval(() => {}, 1000)',
    ]);
    const relay = spawn(launch.command, launch.args, { stdio: ['pipe', 'pipe', 'ignore'] });
    let childPid = null;
    try {
      childPid = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('child pid was not relayed')), 2_000);
        let output = '';
        relay.stdout.on('data', (chunk) => {
          output += chunk;
          const line = output.match(/^(\d+)\s*$/m);
          if (!line) return;
          clearTimeout(timer);
          resolve(Number(line[1]));
        });
        relay.once('error', reject);
      });
      relay.kill('SIGTERM');
      await new Promise((resolve) => relay.once('close', resolve));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(() => process.kill(childPid, 0)).toThrow();
    } finally {
      if (relay.exitCode == null && relay.signalCode == null) relay.kill('SIGKILL');
      if (childPid != null) {
        try { process.kill(childPid, 'SIGKILL'); } catch { /* already gone */ }
      }
    }
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
