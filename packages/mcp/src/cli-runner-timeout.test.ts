import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';

const originalCliPath = process.env.SUZAKU_CLI_PATH;

afterEach(() => {
  if (originalCliPath === undefined) delete process.env.SUZAKU_CLI_PATH;
  else process.env.SUZAKU_CLI_PATH = originalCliPath;
  vi.resetModules();
});

describe('CLI subprocess timeout', () => {
  it('terminates a stuck child and returns a timeout error', async () => {
    process.env.SUZAKU_CLI_PATH = resolve('eval/fixtures/hanging-cli.mjs');
    vi.resetModules();
    const { runCli } = await import('./cli-runner.js');

    const started = Date.now();
    const result = await runCli([], { timeout: 50 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out after 50ms');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('rejects valid JSON printed by a child that never exits', async () => {
    process.env.SUZAKU_CLI_PATH = resolve('eval/fixtures/hanging-cli.mjs');
    vi.resetModules();
    const { runCli } = await import('./cli-runner.js');

    const result = await runCli(['--emit-json'], { timeout: 200 });

    expect(result).toMatchObject({ success: false, data: null });
    expect(result.error).toContain('timed out after 200ms');
    const pid = Number(result.error?.match(/"pid":(\d+)/)?.[1]);
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it('uses SIGKILL when a timed-out child ignores SIGTERM', async () => {
    process.env.SUZAKU_CLI_PATH = resolve('eval/fixtures/hanging-cli.mjs');
    vi.resetModules();
    const { runCli } = await import('./cli-runner.js');

    const started = Date.now();
    const result = await runCli(['--emit-json', '--ignore-term'], {
      timeout: 200,
      killGraceMs: 25,
    });

    expect(result).toMatchObject({ success: false, data: null });
    expect(result.error).toContain('timed out after 200ms');
    expect(Date.now() - started).toBeLessThan(1_000);
    const pid = Number(result.error?.match(/"pid":(\d+)/)?.[1]);
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
