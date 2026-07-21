import { describe, expect, it } from 'vitest';
import {
  aggregateRunSets, hasCompleteUsage, interleavedSchedule, isValidRunSet,
} from './reproducibility.mjs';

const USAGE = { input_tokens: 100, output_tokens: 20 };

describe('interleavedSchedule', () => {
  it('orders repeat → question → target', () => {
    expect(interleavedSchedule(2, ['q1', 'q2'], ['a', 'b'])).toEqual([
      { repeat: 1, question: 'q1', target: 'a' },
      { repeat: 1, question: 'q1', target: 'b' },
      { repeat: 1, question: 'q2', target: 'a' },
      { repeat: 1, question: 'q2', target: 'b' },
      { repeat: 2, question: 'q1', target: 'a' },
      { repeat: 2, question: 'q1', target: 'b' },
      { repeat: 2, question: 'q2', target: 'a' },
      { repeat: 2, question: 'q2', target: 'b' },
    ]);
  });
});

describe('generic run validity', () => {
  const complete = {
    aborted: false,
    invalidReason: null,
    results: [
      { verdict: 'PASS', usage: USAGE },
      { verdict: 'FAIL', usage: USAGE },
    ],
  };

  it('requires terminal input/output usage', () => {
    expect(hasCompleteUsage(USAGE)).toBe(true);
    expect(hasCompleteUsage({ input_tokens: 1 })).toBe(false);
    expect(hasCompleteUsage({})).toBe(false);
    expect(hasCompleteUsage(null)).toBe(false);
  });

  it('uses infrastructure completeness rather than quality verdicts', () => {
    expect(isValidRunSet(complete, 2)).toBe(true);
    expect(isValidRunSet({ ...complete, aborted: true }, 2)).toBe(false);
    expect(isValidRunSet({ ...complete, invalidReason: 'epoch drift' }, 2)).toBe(false);
    expect(isValidRunSet({ ...complete, results: complete.results.slice(0, 1) }, 2)).toBe(false);
    expect(isValidRunSet({
      ...complete,
      results: [{ ...complete.results[0], runError: 'timeout' }, complete.results[1]],
    }, 2)).toBe(false);
    expect(isValidRunSet({
      ...complete,
      results: [{ ...complete.results[0], usage: {} }, complete.results[1]],
    }, 2)).toBe(false);
  });
});

describe('aggregateRunSets', () => {
  it('excludes invalid runs and keeps generic validity/latency/cost aggregates', () => {
    const complete = {
      aborted: false,
      invalidReason: null,
      results: [
        { verdict: 'PASS', wallMs: 100, cost: 0.1, usage: USAGE },
        { verdict: 'FAIL', wallMs: 200, cost: 0.2, usage: USAGE },
      ],
    };
    const errored = {
      aborted: false,
      invalidReason: null,
      results: [{ verdict: 'FAIL', runError: 'timeout', usage: null }, { verdict: 'PASS', usage: USAGE }],
    };
    const summary = aggregateRunSets([complete, { aborted: true, results: [] }, errored], 2);
    expect(summary).toMatchObject({
      attemptedRuns: 3,
      validRuns: 1,
      validRunRate: 1 / 3,
      passed: 1,
      questions: 2,
      medianWallMs: 100,
      p95WallMs: 200,
    });
    expect(summary.cost).toBeCloseTo(0.3, 12);
    expect(summary.costPerPass).toBeCloseTo(0.3, 12);
  });
});
