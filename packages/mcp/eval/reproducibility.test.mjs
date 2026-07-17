import { describe, expect, it } from 'vitest';
import {
  aggregateRunSets, assessCursorEligibility, interleavedSchedule, isValidRunSet,
  priceCursorRun, validateCursorCalibration,
} from './reproducibility.mjs';

const RATE_CARD = { inputPerMTok: 0.5, outputPerMTok: 2.5, cacheInputMultiplier: 1 };

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

describe('Cursor calibration', () => {
  const entry = {
    resolvedModel: 'composer-2.5', serviceTier: 'standard', rateCard: RATE_CARD,
    samples: [
      {
        resolvedModel: 'composer-2.5', serviceTier: 'standard',
        usage: { input_tokens: 100_000, output_tokens: 10_000 }, dashboardCostUsd: 0.075,
      },
      {
        resolvedModel: 'composer-2.5', serviceTier: 'standard',
        usage: { input_tokens: 250_000, output_tokens: 30_000 }, dashboardCostUsd: 0.2,
      },
    ],
  };
  it('requires two token-diverse dashboard samples within 5 percent', () => {
    expect(validateCursorCalibration(entry)).toMatchObject({ verified: true, method: 'dashboard-run-samples' });
    expect(validateCursorCalibration({ ...entry, samples: entry.samples.slice(0, 1) })).toMatchObject({ verified: false });
    expect(validateCursorCalibration({ ...entry, samples: [entry.samples[0], { ...entry.samples[0] }] }))
      .toMatchObject({ verified: false, reason: 'samples-not-token-diverse' });
    expect(validateCursorCalibration({
      ...entry,
      samples: entry.samples.map((sample) => ({ ...sample, serviceTier: 'fast' })),
    })).toMatchObject({ verified: false, reason: 'need-two-dashboard-samples' });
  });
  it('stays unpriced until resolved model and service tier are observable', () => {
    const config = { models: { 'composer-2.5': entry } };
    expect(priceCursorRun(config, 'composer-2.5', 'composer-2.5', null, {}).status).toBe('unverified');
    expect(priceCursorRun(config, 'composer-2.5', 'composer-2.5', 'standard', { input_tokens: 100_000, output_tokens: 10_000 }))
      .toMatchObject({ status: 'verified', cost: 0.075 });
  });

  it('requires the requested variant and observable tool arguments for row eligibility', () => {
    const config = { models: { 'composer-2.5': entry } };
    const evidence = { needsToolEvidence: true, argsVisible: true };
    expect(assessCursorEligibility(config, 'composer-2.5', 'composer-2.5', 'standard', evidence))
      .toEqual({ eligible: true, reason: null });
    expect(assessCursorEligibility(config, 'composer-2.5', 'composer-2.5', null, evidence))
      .toMatchObject({ eligible: false, reason: 'resolved-service-tier-unobserved-or-mismatched' });
    expect(assessCursorEligibility(config, 'composer-2.5', 'composer-2.5', 'standard', {
      ...evidence, argsVisible: false,
    })).toMatchObject({ eligible: false, reason: 'mcp-tool-arguments-unobserved' });
    expect(assessCursorEligibility(config, 'composer-2.5', 'composer-2.5', 'standard', {
      ...evidence, boundaryViolation: true,
    })).toMatchObject({ eligible: false, reason: 'mcp-boundary-violation' });
  });
});

describe('aggregateRunSets', () => {
  it('excludes aborted/incomplete/errored/boundary-ineligible runs and reports boundary rate', () => {
    const complete = {
      aborted: false, invalidReason: null,
      results: [
        { verdict: 'PASS', wallMs: 100, cost: 0.1, costStatus: 'verified' },
        { verdict: 'FAIL', wallMs: 200, cost: 0.2, costStatus: 'verified' },
      ],
    };
    const boundary = {
      aborted: false, invalidReason: null,
      results: [
        { verdict: 'FAIL', wallMs: 50, boundaryViolation: true, benchmarkEligible: false },
        { verdict: 'PASS', wallMs: 60 },
      ],
    };
    const errored = {
      aborted: false, invalidReason: null,
      results: [{ verdict: 'FAIL', runError: 'timeout' }, { verdict: 'PASS' }],
    };
    const summary = aggregateRunSets([complete, { aborted: true, results: [] }, boundary, errored], 2);
    expect(summary).toMatchObject({
      attemptedRuns: 4, validRuns: 1, boundaryRuns: 1, boundaryRunRate: 0.25,
      passed: 1, questions: 2,
    });
    expect(summary.cost).toBeCloseTo(0.3, 12);
    expect(summary.costPerPass).toBeCloseTo(0.3, 12);
    expect(isValidRunSet({ ...complete, results: complete.results.slice(0, 1) }, 2)).toBe(false);
  });
});
