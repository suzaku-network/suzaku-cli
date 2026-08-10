import { execFile } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const runner = new URL('./run-evals.mjs', import.meta.url).pathname;
const packageRoot = new URL('../', import.meta.url).pathname;

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [runner, ...args], {
      encoding: 'utf8',
      cwd: packageRoot,
      env: { ...process.env, ANTHROPIC_API_KEY: '', MOONSHOT_API_KEY: '' },
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    }, (error, stdout, stderr) => {
      resolve({
        status: error == null ? 0 : Number(error.code),
        error: error != null && !Number.isInteger(error.code) ? error : undefined,
        stdout,
        stderr,
      });
    });
  });
}

describe('run-evals CLI preflight', () => {
  it.each([
    [['--fastt'], 'unknown flag: --fastt'],
    [['--tier', '2', '--model', '--benchmark'], '--model requires a value'],
    [
      ['--tier', '2', '--benchmark', '--confirm-paid', '--max-cost-usd', '1'],
      '--benchmark requires --canary',
    ],
  ])('rejects %j before side effects', async (args, expected) => {
    const result = await run(args);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(expected);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('Building root CLI');
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('MCP server up');
    expect(`${result.stdout}\n${result.stderr}`).not.toContain('manifest');
  });

  it('prints a keyless dry-run with exact call counts and no side effects', async () => {
    const result = await run([
      '--tier', '2',
      '--engine', 'anthropic',
      '--only', 'operators,weekly-todo',
      '--repeat', '3',
      '--canary',
      '--dry-run',
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary).toMatchObject({
      dryRun: true,
      questions: ['operators', 'weekly-todo'],
      repeat: 3,
      canary: true,
      calls: {
        perTarget: 7,
        totalModelCalls: 7,
        meteredAnthropicCalls: 7,
      },
      spendCeilingUsd: null,
    });
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('Building root CLI');
    expect(result.stdout).not.toContain('MCP server up');
    expect(result.stdout).not.toContain('manifest');
  });

  it('previews a full Kimi run and current pricing without a key or side effects', async () => {
    const result = await run([
      '--tier', '2',
      '--engine', 'kimi',
      '--model', 'kimi-k3',
      '--repeat', '1',
      '--canary',
      '--dry-run',
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary).toMatchObject({
      engines: ['kimi'],
      targets: ['kimi:kimi-k3'],
      kimiModels: ['kimi-k3'],
      calls: {
        perTarget: 28,
        totalModelCalls: 28,
        meteredKimiCalls: 28,
      },
      kimiPricingPerMTok: {
        'kimi-k3': {
          rates: [3, 15],
          cacheRead: 0.1,
          reasoningEffort: 'max',
        },
      },
    });
    expect(result.stdout).not.toContain('Building root CLI');
    expect(result.stdout).not.toContain('MCP server up');
    expect(result.stdout).not.toContain('manifest');
  });
});
