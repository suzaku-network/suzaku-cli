import { describe, expect, it } from 'vitest';
import { normalizeRunnerResult, runEval } from './runner.mjs';

const USAGE = { input_tokens: 100, output_tokens: 20 };
const questions = [{ id: 'q1' }, { id: 'q2' }];
const canaryQuestions = [{ id: 'canary' }];

function target(id = 'anthropic:a') {
  return { id, label: id, engine: id.split(':')[0], model: id.split(':')[1] };
}

function result(id, overrides = {}) {
  return {
    id,
    verdict: 'PENDING_HUMAN',
    gateVerdict: 'PASS',
    semanticVerdict: 'PENDING_HUMAN',
    usage: USAGE,
    cost: 0.01,
    runError: null,
    infrastructureError: null,
    timedOut: false,
    authError: false,
    ...overrides,
  };
}

function config(overrides = {}) {
  const targets = overrides.targets ?? [target()];
  return {
    requestedTargetIds: targets.map((item) => item.id),
    targets,
    questions,
    canaryQuestions,
    repeats: 1,
    runCanary: true,
    canaryOnly: false,
    benchmark: true,
    initialEpoch: 49,
    setupFailures: [],
    ...overrides,
  };
}

function dependencies(executeQuestion, epochs = [49, 49]) {
  let epochIndex = 0;
  return {
    executeQuestion,
    refreshEpoch: async () => epochs[Math.min(epochIndex++, epochs.length - 1)],
    formatUsageCost: () => '$0.0100',
  };
}

describe('importable eval runner orchestration', () => {
  it('aborts partial target setup before any model call', async () => {
    let calls = 0;
    const outcome = await runEval(config({
      requestedTargetIds: ['anthropic:a', 'anthropic:b'],
      targets: [target('anthropic:a')],
    }), dependencies(async () => {
      calls += 1;
      return result('never');
    }));
    expect(calls).toBe(0);
    expect(outcome).toMatchObject({
      stopBeforeReports: true,
      exitCode: 1,
      setupComplete: false,
      batchAborted: true,
    });
    expect(outcome.batchAbortReason).toContain('anthropic:b');
  });

  it('runs one hard-gate canary then interleaved repetitions while semantic grading stays pending', async () => {
    const calls = [];
    const seenResults = [];
    const outcome = await runEval(config({ repeats: 2 }), {
      ...dependencies(async (modelTarget, question, options) => {
        calls.push(`${options.canary ? 'c' : `r${options.repeat}`}:${modelTarget.id}:${question.id}`);
        return result(question.id);
      }, [49, 49, 49, 49]),
      onResult: async (_target, _question, scored) => seenResults.push(scored.verdict),
    });
    expect(calls).toEqual([
      'c:anthropic:a:canary',
      'r1:anthropic:a:q1',
      'r1:anthropic:a:q2',
      'r2:anthropic:a:q1',
      'r2:anthropic:a:q2',
    ]);
    expect(seenResults).toEqual(Array(5).fill('PENDING_HUMAN'));
    expect(outcome.canaries[0]).toMatchObject({
      gateVerdict: 'PASS', verdict: 'PENDING_HUMAN',
    });
    expect(outcome.runSets).toHaveLength(2);
    expect(outcome.batchAborted).toBe(false);
  });

  it('canary-only executes exactly one canary and stops', async () => {
    let calls = 0;
    const outcome = await runEval(config({ canaryOnly: true }), dependencies(async (_target, question) => {
      calls += 1;
      return result(question.id);
    }));
    expect(calls).toBe(1);
    expect(outcome).toMatchObject({ stopBeforeReports: true, exitCode: 0, batchAborted: false });
    expect(outcome.runSets).toEqual([]);
  });

  it('aborts a failed canary before production', async () => {
    let calls = 0;
    const outcome = await runEval(config(), dependencies(async (_target, question) => {
      calls += 1;
      return result(question.id, { verdict: 'FAIL', gateVerdict: 'FAIL' });
    }));
    expect(calls).toBe(1);
    expect(outcome).toMatchObject({ stopBeforeReports: true, exitCode: 1, batchAborted: true });
    expect(outcome.batchAbortReason).toContain('canary gate FAIL');
  });

  for (const [name, failure] of [
    ['oracle failure', { infrastructureError: 'oracle failed' }],
    ['timeout', { runError: 'request timed out', timedOut: true }],
    ['child death', { runError: 'stdio child exited 7' }],
    ['auth failure', { runError: 'unauthorized', authError: true }],
    ['missing usage', { usage: null }],
  ]) {
    it(`stops immediately after a production ${name}`, async () => {
      let productionCalls = 0;
      const outcome = await runEval(config({ runCanary: false }), dependencies(async (_target, question) => {
        productionCalls += 1;
        return result(question.id, failure);
      }));
      expect(productionCalls).toBe(1);
      expect(outcome.batchAborted).toBe(true);
      expect(outcome.runSets[0].results).toHaveLength(1);
      expect(outcome.runSets[0].results[0]).toMatchObject({
        verdict: 'FAIL', gateVerdict: 'FAIL',
      });
    });
  }

  it('continues after a quality/policy FAIL with complete infrastructure', async () => {
    let calls = 0;
    const outcome = await runEval(config({ runCanary: false }), dependencies(async (_target, question) => {
      calls += 1;
      return result(question.id, { verdict: 'FAIL', gateVerdict: 'FAIL' });
    }));
    expect(calls).toBe(2);
    expect(outcome.batchAborted).toBe(false);
    expect(outcome.runSets[0].results.map((item) => item.verdict)).toEqual(['FAIL', 'FAIL']);
  });

  it('aborts before calls when the epoch already drifted', async () => {
    let calls = 0;
    const outcome = await runEval(config({ runCanary: false }), dependencies(async () => {
      calls += 1;
      return result('never');
    }, [50]));
    expect(calls).toBe(0);
    expect(outcome).toMatchObject({ batchAborted: true, epochDriftAbort: true });
    expect(outcome.runSets[0].invalidReason).toContain('drift before repeat');
  });

  it('invalidates the completed repeat when the final epoch check drifts', async () => {
    const outcome = await runEval(config({ runCanary: false }), dependencies(
      async (_target, question) => result(question.id),
      [49, 50],
    ));
    expect(outcome).toMatchObject({ batchAborted: true, epochDriftAbort: true });
    expect(outcome.runSets[0].results).toHaveLength(2);
    expect(outcome.runSets[0].invalidReason).toContain('drift during repeat');
  });
});

describe('runner failure normalization', () => {
  it('keeps semantic quality failures distinct from infrastructure failures', () => {
    const quality = result('q', { verdict: 'FAIL', gateVerdict: 'FAIL' });
    expect(normalizeRunnerResult(quality)).toBe(quality);
    expect(normalizeRunnerResult(result('q', { usage: null }))).toMatchObject({
      verdict: 'FAIL',
      gateVerdict: 'FAIL',
      infrastructureError: 'terminal usage is unavailable',
    });
  });
});
