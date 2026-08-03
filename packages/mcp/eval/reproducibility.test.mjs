import { describe, expect, it } from 'vitest';
import {
  aggregateRunSets, aggregateUsage, canaryAllowsScheduling, formatUsageCost,
  epochTransitionFailure, groundTruthTrustFailure, hasCompleteUsage, hasExactTargetSetup,
  interleavedSchedule, isCommitReadyBenchmark, isValidRunSet, manifestDestinations,
  summarizeUsage, usageTokenCount, validateCanaryPolicy,
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

describe('infrastructure trust policy', () => {
  const trustedFact = {
    spec: { name: 'epoch' }, value: 49, sane: true, via: 'path',
  };
  const trusted = [{ tool: 'epoch_status', ok: true, parsed: true, facts: [trustedFact] }];

  it('requires the exact requested target set before scheduling', () => {
    expect(hasExactTargetSetup(['anthropic:a', 'codex:b'], ['codex:b', 'anthropic:a'])).toBe(true);
    expect(hasExactTargetSetup(['anthropic:a', 'codex:b'], ['anthropic:a'])).toBe(false);
    expect(hasExactTargetSetup(['anthropic:a'], ['anthropic:a', 'codex:b'])).toBe(false);
    expect(hasExactTargetSetup(['anthropic:a', 'anthropic:a'], ['anthropic:a', 'anthropic:a'])).toBe(false);
  });

  it('accepts only parsed, resolved, sane, scoped ground truth', () => {
    expect(groundTruthTrustFailure([])).toBeNull();
    expect(groundTruthTrustFailure(trusted)).toBeNull();
    expect(groundTruthTrustFailure([{ ...trusted[0], ok: false, error: 'RPC down' }]))
      .toBe('ground-truth call failed (epoch_status): RPC down');
    expect(groundTruthTrustFailure([{ ...trusted[0], parsed: false }]))
      .toBe('ground-truth JSON parse failed (epoch_status)');
    expect(groundTruthTrustFailure([{ ...trusted[0], facts: [{ ...trustedFact, value: undefined }] }]))
      .toBe('ground-truth fact unresolved (epoch_status/epoch)');
    expect(groundTruthTrustFailure([{ ...trusted[0], facts: [{ ...trustedFact, sane: false }] }]))
      .toBe('ground-truth fact insane (epoch_status/epoch)');
    expect(groundTruthTrustFailure([{ ...trusted[0], facts: [{ ...trustedFact, via: 'deep-global' }] }]))
      .toBe('ground-truth fact used deep-global (epoch_status/epoch)');
    expect(groundTruthTrustFailure([{
      ...trusted[0], facts: [{ ...trustedFact, via: 'deep-global+derive:count' }],
    }])).toBe('ground-truth fact used deep-global (epoch_status/epoch)');
  });

  it('detects drift after the final repeat instead of relying on a later refresh', () => {
    expect(epochTransitionFailure(1, 49, 49)).toBeNull();
    expect(epochTransitionFailure(1, 49, 50))
      .toBe('epoch drift during repeat 1: started=49, ended=50');
  });
});

describe('canary policy', () => {
  it('accepts a normal tier-2 canary-only invocation', () => {
    expect(validateCanaryPolicy({ tier: 2, canaryOnly: true, repeat: 1 })).toEqual([]);
    expect(validateCanaryPolicy({ tier: 2, canaryOnly: true, repeat: 1, repeatExplicit: true })).toEqual([]);
  });

  it('rejects incompatible flags and tier-1 canaries', () => {
    expect(validateCanaryPolicy({ tier: 1, canary: true })).toContain('canaries require --tier 2');
    expect(validateCanaryPolicy({ tier: 2, canary: true, canaryOnly: true }))
      .toContain('--canary and --canary-only are mutually exclusive');
    expect(validateCanaryPolicy({ tier: 2, canaryOnly: true, benchmark: true }))
      .toContain('--canary-only is incompatible with --benchmark');
    expect(validateCanaryPolicy({ tier: 2, canaryOnly: true, only: ['operators'] }))
      .toContain('--canary-only is incompatible with --only');
    expect(validateCanaryPolicy({ tier: 2, canaryOnly: true, repeat: 2, repeatExplicit: true }))
      .toContain('--canary-only requires --repeat 1');
    expect(validateCanaryPolicy({ tier: 2, benchmark: true }))
      .toContain('--benchmark requires --canary');
    expect(validateCanaryPolicy({ tier: 1, benchmark: true }))
      .toContain('--benchmark requires --tier 2');
  });

  it('uses the hard gate for scheduling without converting semantic uncertainty to PASS', () => {
    expect(canaryAllowsScheduling({
      gateVerdict: 'PASS', verdict: 'PENDING_HUMAN', runError: null,
    })).toBe(true);
    expect(canaryAllowsScheduling({ gateVerdict: 'FAIL', verdict: 'PENDING_HUMAN' })).toBe(false);
    expect(canaryAllowsScheduling({ gateVerdict: 'PASS', runError: 'timeout' })).toBe(false);
    expect(canaryAllowsScheduling({
      gateVerdict: 'PASS', runError: null, infrastructureError: 'oracle failed',
    })).toBe(false);
    expect(canaryAllowsScheduling({ gateVerdict: 'PASS', runError: null, timedOut: true })).toBe(false);
    expect(canaryAllowsScheduling({ gateVerdict: 'PASS', runError: null, authError: true })).toBe(false);
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

  it('keeps unknown usage null through aggregation', () => {
    expect(aggregateUsage([{ usage: USAGE }, { usage: null }])).toBeNull();
    expect(aggregateUsage([{ usage: USAGE }, { usage: {} }])).toBeNull();
    expect(aggregateUsage([])).toBeNull();
    expect(aggregateUsage([
      { usage: { ...USAGE, total_tokens: 130 } },
      { usage: { input_tokens: 10, output_tokens: 2, total_tokens: 20 } },
    ])).toEqual({ input_tokens: 110, output_tokens: 22, total_tokens: 150 });
  });

  it('keeps unknown report and manifest totals null and labels them explicitly', () => {
    expect(summarizeUsage([{ usage: USAGE, cost: 0.1 }, { usage: null, cost: null }]))
      .toEqual({ usage: null, cost: null });
    expect(formatUsageCost({ usage: null, cost: null }, 'anthropic')).toBe('usage unknown');
    expect(formatUsageCost({ usage: null, cost: null }, 'codex')).toBe('sub (usage unknown)');
    expect(usageTokenCount(null)).toBeNull();
  });

  it('uses infrastructure completeness rather than quality verdicts', () => {
    expect(isValidRunSet(complete, 2)).toBe(true);
    expect(isValidRunSet({ ...complete, aborted: true }, 2)).toBe(false);
    expect(isValidRunSet({ ...complete, invalidReason: 'epoch drift' }, 2)).toBe(false);
    expect(isValidRunSet({ ...complete, driftWarning: 'epoch drift' }, 2)).toBe(false);
    expect(isValidRunSet({ ...complete, results: complete.results.slice(0, 1) }, 2)).toBe(false);
    expect(isValidRunSet({
      ...complete,
      results: [{ ...complete.results[0], runError: 'timeout' }, complete.results[1]],
    }, 2)).toBe(false);
    expect(isValidRunSet({
      ...complete,
      results: [{ ...complete.results[0], usage: {} }, complete.results[1]],
    }, 2)).toBe(false);
    expect(isValidRunSet({
      ...complete,
      results: [{ ...complete.results[0], infrastructureError: 'oracle failed' }, complete.results[1]],
    }, 2)).toBe(false);
  });
});

describe('commit-ready benchmark policy', () => {
  const questionIds = ['q1', 'q2'];
  const targetIds = ['anthropic:a', 'codex:b'];
  const result = (id, verdict = 'PASS') => ({ id, verdict, usage: USAGE, runError: null });
  const runSets = [1, 2].flatMap((repeat) => targetIds.map((targetId) => ({
    repeat,
    targetId,
    aborted: false,
    invalidReason: null,
    results: [result('q1'), result('q2', 'FAIL')],
  })));
  const ready = {
    benchmarkRequested: true,
    setupComplete: true,
    setupFailures: [],
    canaryRequested: true,
    canaries: targetIds.map((targetId) => ({
      targetId, gateVerdict: 'PASS', verdict: 'PASS', runError: null, usage: USAGE,
    })),
    epochDriftAbort: false,
    batchAborted: false,
    runSets,
    questionIds,
    targetIds,
    repeats: 2,
  };

  it('treats complete quality failures as commit-ready', () => {
    expect(isCommitReadyBenchmark(ready)).toBe(true);
    expect(isCommitReadyBenchmark({
      ...ready,
      runSets: runSets.map((run) => ({
        ...run,
        results: run.results.map((entry) => ({ ...entry, verdict: 'PARTIAL' })),
      })),
    })).toBe(true);
  });

  it('rejects unresolved semantic verdicts from canonical manifests', () => {
    expect(isCommitReadyBenchmark({
      ...ready,
      canaries: ready.canaries.map((canary) => ({ ...canary, verdict: 'PENDING_HUMAN' })),
    })).toBe(false);
    expect(isCommitReadyBenchmark({
      ...ready,
      runSets: runSets.map((run, index) => (index === 0
        ? { ...run, results: [{ ...run.results[0], verdict: 'PENDING_HUMAN' }, run.results[1]] }
        : run)),
    })).toBe(false);
    expect(isCommitReadyBenchmark({
      ...ready,
      canaries: ready.canaries.map((canary) => ({ ...canary, traceInformational: true })),
    })).toBe(false);
    expect(isCommitReadyBenchmark({
      ...ready,
      runSets: runSets.map((run, index) => (index === 0
        ? {
          ...run,
          results: [{ ...run.results[0], traceScore: { informational: true } }, run.results[1]],
        }
        : run)),
    })).toBe(false);
  });

  it('rejects setup, timeout, drift, abort, auth, usage, and completeness failures', () => {
    expect(isCommitReadyBenchmark({ ...ready, canaryRequested: false, canaries: [] })).toBe(false);
    expect(isCommitReadyBenchmark({ ...ready, setupComplete: false })).toBe(false);
    expect(isCommitReadyBenchmark({ ...ready, setupFailures: [{ error: 'setup' }] })).toBe(false);
    expect(isCommitReadyBenchmark({ ...ready, epochDriftAbort: true })).toBe(false);
    expect(isCommitReadyBenchmark({ ...ready, batchAborted: true })).toBe(false);
    expect(isCommitReadyBenchmark({ ...ready, runSets: runSets.slice(0, -1) })).toBe(false);
    expect(isCommitReadyBenchmark({
      ...ready,
      canaries: ready.canaries.map((canary, index) => (index === 0 ? { ...canary, usage: null } : canary)),
    })).toBe(false);
    expect(isCommitReadyBenchmark({
      ...ready,
      runSets: runSets.map((run, index) => index === 0
        ? { ...run, results: [{ ...run.results[0], timedOut: true }, run.results[1]] }
        : run),
    })).toBe(false);
    expect(isCommitReadyBenchmark({
      ...ready,
      runSets: runSets.map((run, index) => index === 0
        ? { ...run, results: [{ ...run.results[0], authError: true }, run.results[1]] }
        : run),
    })).toBe(false);
    expect(isCommitReadyBenchmark({
      ...ready,
      runSets: runSets.map((run, index) => index === 0
        ? { ...run, results: [{ ...run.results[0], usage: null }, run.results[1]] }
        : run),
    })).toBe(false);
    expect(isCommitReadyBenchmark({
      ...ready,
      runSets: runSets.map((run, index) => index === 0
        ? { ...run, results: [{ ...run.results[0], infrastructureError: 'oracle failed' }, run.results[1]] }
        : run),
    })).toBe(false);
  });
});

describe('manifest destinations', () => {
  it('selects local storage for every valid tier-2 attempt and canonical only when ready', () => {
    expect(manifestDestinations({ tier: 2, argsValid: true, commitReady: false }))
      .toEqual({ local: true, canonical: false });
    expect(manifestDestinations({ tier: 2, argsValid: true, commitReady: true }))
      .toEqual({ local: true, canonical: true });
    expect(manifestDestinations({ tier: 1, argsValid: true, commitReady: true }))
      .toEqual({ local: false, canonical: false });
    expect(manifestDestinations({ tier: 2, argsValid: false, commitReady: true }))
      .toEqual({ local: false, canonical: false });
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
    expect(summary.usage).toEqual({ input_tokens: 200, output_tokens: 40 });
  });

  it('keeps an aggregate with no valid contributing runs unknown', () => {
    const summary = aggregateRunSets([{
      aborted: false,
      invalidReason: null,
      results: [{ verdict: 'PASS', wallMs: 100, cost: null, usage: null }],
    }], 1);
    expect(summary.validRuns).toBe(0);
    expect(summary.usage).toBeNull();
    expect(summary.cost).toBeNull();
  });
});
