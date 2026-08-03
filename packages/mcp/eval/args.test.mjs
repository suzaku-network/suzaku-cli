import { describe, expect, it } from 'vitest';
import { EvalArgumentError, parseEvalArgs } from './args.mjs';

const questionIds = ['operators', 'weekly-todo'];
const parse = (args) => parseEvalArgs(args, { questionIds });

describe('parseEvalArgs', () => {
  it('accepts the pnpm separator and a free tier-1 run', () => {
    expect(parse(['--', '--tier', '1', '--only', 'operators'])).toMatchObject({
      tier: 1,
      only: ['operators'],
      repeat: 1,
      metered: false,
    });
  });

  it('rejects unknown, duplicate, positional, missing, and flag-eats-flag input', () => {
    const cases = [
      [['--fastt'], 'unknown flag: --fastt'],
      [['--fast', '--fast'], 'duplicate flag: --fast'],
      [['operators'], 'unexpected positional argument: operators'],
      [['--model'], '--model requires a value'],
      [['--model', '--benchmark'], '--model requires a value'],
      [['--tier', '2', '--', '--fast'], "separator is only valid as the first token"],
    ];
    for (const [args, message] of cases) {
      expect(() => parse(args)).toThrow(message);
    }
  });

  it('rejects duplicate or incompatible model and engine selections', () => {
    expect(() => parse(['--engine', 'codex', '--model', 'x']))
      .toThrow('--model/--models require one metered API engine');
    expect(() => parse(['--engine', 'anthropic', '--engines', 'anthropic']))
      .toThrow('--engine and --engines are mutually exclusive');
    expect(() => parse(['--model', 'a', '--models', 'b']))
      .toThrow('--model and --models are mutually exclusive');
    expect(() => parse(['--engines', 'anthropic,anthropic']))
      .toThrow('--engines contains duplicate values');
    expect(() => parse(['--engine', 'kimi', '--anthropic-models', 'x']))
      .toThrow('--anthropic-models requires the anthropic engine');
  });

  it('requires canaries for benchmark runs', () => {
    expect(() => parse([
      '--tier', '2', '--benchmark', '--confirm-paid', '--max-cost-usd', '1',
    ])).toThrow('--benchmark requires --canary');
  });

  it('requires confirmation and a positive ceiling for metered execution', () => {
    expect(() => parse(['--tier', '2', '--only', 'operators']))
      .toThrow('metered API runs require --confirm-paid');
    expect(() => parse(['--tier', '2', '--confirm-paid', '--only', 'operators']))
      .toThrow('metered API runs require --max-cost-usd');
    expect(() => parse([
      '--tier', '2', '--confirm-paid', '--max-cost-usd', '0', '--only', 'operators',
    ])).toThrow('--max-cost-usd must be a positive number');
  });

  it('allows a metered dry-run without a key, confirmation, or ceiling', () => {
    expect(parse(['--tier', '2', '--dry-run', '--only', 'operators'])).toMatchObject({
      tier: 2,
      dryRun: true,
      metered: true,
      confirmPaid: false,
      maxCostUsd: null,
    });
  });

  it('allows subscription Codex execution without paid confirmation', () => {
    expect(parse(['--tier', '2', '--engine', 'codex', '--only', 'operators']))
      .toMatchObject({ engines: ['codex'], metered: false });
  });

  it('supports Kimi as a separately metered API engine', () => {
    expect(parse([
      '--tier', '2', '--engine', 'kimi', '--model', 'kimi-k3',
      '--confirm-paid', '--max-cost-usd', '2', '--only', 'operators',
    ])).toMatchObject({
      engines: ['kimi'],
      kimiModels: ['kimi-k3'],
      metered: true,
    });
  });

  it('reports unknown question IDs before side effects', () => {
    expect(() => parse(['--only', 'missing'])).toThrow('--only references unknown question: missing');
  });

  it('uses a typed argument error with exit code 2', () => {
    try {
      parse(['--bad']);
      throw new Error('expected parse to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(EvalArgumentError);
      expect(error.exitCode).toBe(2);
    }
  });
});
