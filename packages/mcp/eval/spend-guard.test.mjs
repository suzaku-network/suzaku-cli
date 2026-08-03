import { describe, expect, it } from 'vitest';
import { createSpendGuard } from './spend-guard.mjs';

describe('createSpendGuard', () => {
  it('ignores subscription targets', () => {
    const guard = createSpendGuard(null);
    expect(guard.beforeCall('codex')).toBeNull();
    expect(guard.record('codex', null)).toBeNull();
    expect(guard.spentUsd).toBe(0);
  });

  it('fails closed when metered pricing or usage is unavailable', () => {
    expect(createSpendGuard(null).beforeCall('anthropic'))
      .toContain('no valid --max-cost-usd');
    const guard = createSpendGuard(1);
    expect(guard.record('anthropic', null)).toContain('cannot be enforced');
    expect(guard.record('kimi', null)).toContain('cannot be enforced');
    expect(guard.spentUsd).toBe(0);
  });

  it('tracks spend and blocks the next call at the ceiling', () => {
    const guard = createSpendGuard(1);
    expect(guard.beforeCall('anthropic')).toBeNull();
    expect(guard.record('anthropic', 0.4)).toBeNull();
    expect(guard.record('anthropic', 0.6)).toBeNull();
    expect(guard.spentUsd).toBe(1);
    expect(guard.beforeCall('anthropic')).toContain('ceiling reached before call');
  });

  it('reports an unavoidable in-flight overshoot and keeps the actual spend', () => {
    const guard = createSpendGuard(0.5);
    expect(guard.record('kimi', 0.6)).toContain('ceiling exceeded after in-flight call');
    expect(guard.spentUsd).toBe(0.6);
  });
});
