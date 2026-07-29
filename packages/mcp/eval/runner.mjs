import {
  canaryAllowsScheduling, epochTransitionFailure, hasCompleteUsage,
  hasExactTargetSetup, interleavedSchedule,
} from './reproducibility.mjs';

function failureMessage(result) {
  if (result.infrastructureError) return result.infrastructureError;
  if (result.runError) return result.runError;
  if (result.timedOut) return 'model call timed out';
  if (result.authError) return 'model authentication failed';
  if (!hasCompleteUsage(result.usage)) return 'terminal usage is unavailable';
  return null;
}

/**
 * Normalize failures that make subsequent model calls unsafe or incomparable.
 * Quality failures (a clean hard-gate FAIL) remain results and do not abort the
 * batch; infrastructure, timeout, auth, oracle, and missing-usage failures do.
 */
export function normalizeRunnerResult(result) {
  const infrastructureError = failureMessage(result);
  if (!infrastructureError) return result;
  return {
    ...result,
    verdict: 'FAIL',
    gateVerdict: 'FAIL',
    infrastructureError,
  };
}

function markRunSetsInvalid(runSets, message) {
  for (const runSet of runSets.values()) {
    runSet.aborted = true;
    runSet.abortReason = message;
    runSet.invalidReason = message;
  }
}

function canaryRecord(target, question, result, formatUsageCost) {
  return {
    targetId: target.id,
    engine: target.engine,
    model: target.model,
    question: question.id,
    verdict: result.verdict,
    gateVerdict: result.gateVerdict,
    semanticVerdict: result.semanticVerdict,
    traceInformational: result.traceScore?.informational === true,
    runError: result.runError ?? null,
    infrastructureError: result.infrastructureError ?? null,
    timedOut: result.timedOut === true,
    authError: result.authError === true,
    usage: result.usage ?? null,
    cost: result.cost ?? null,
    costDisplay: formatUsageCost?.(result, target.engine) ?? null,
  };
}

/**
 * Importable tier-2 state machine. Provider/MCP construction and question
 * execution are injected, so tests run the same scheduling and abort logic with
 * zero network or model calls.
 */
export async function runEval(config, dependencies) {
  const {
    requestedTargetIds,
    targets,
    questions,
    canaryQuestions = [],
    repeats = 1,
    runCanary = false,
    canaryOnly = false,
    benchmark = false,
    initialEpoch = null,
    setupFailures: initialSetupFailures = [],
  } = config;
  const {
    executeQuestion,
    refreshEpoch,
    onEvent = () => {},
    onResult = () => {},
    formatUsageCost = null,
  } = dependencies;

  const setupFailures = [...initialSetupFailures];
  const canaries = [];
  const runSets = [];
  let setupComplete = setupFailures.length === 0
    && hasExactTargetSetup(requestedTargetIds, targets.map((target) => target.id));
  let batchAborted = false;
  let batchAbortReason = null;
  let epochDriftAbort = false;

  for (const failure of setupFailures) onEvent({ type: 'setup-failure', failure });
  if (!setupComplete) {
    const runnable = new Set(targets.map((target) => target.id));
    const missing = requestedTargetIds.filter((targetId) => !runnable.has(targetId));
    batchAborted = true;
    batchAbortReason = `target setup incomplete${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}`;
    if (!setupFailures.some((failure) => failure.stage === 'engine-setup')) {
      setupFailures.push({ stage: 'engine-setup', engine: 'runner', error: batchAbortReason });
    }
    onEvent({ type: 'abort', stage: 'engine-setup', message: batchAbortReason });
    return {
      stopBeforeReports: true,
      exitCode: 1,
      failure: { stage: 'engine-setup', error: batchAbortReason },
      targets, runSets, canaries, setupFailures, setupComplete,
      batchAborted, batchAbortReason, epochDriftAbort,
    };
  }

  if (targets.length === 0) {
    setupComplete = false;
    batchAborted = true;
    batchAbortReason = 'no runnable targets';
    setupFailures.push({ stage: 'engine-setup', engine: 'runner', error: batchAbortReason });
    return {
      stopBeforeReports: true,
      exitCode: 1,
      failure: { stage: 'engine-setup', error: batchAbortReason },
      targets, runSets, canaries, setupFailures, setupComplete,
      batchAborted, batchAbortReason, epochDriftAbort,
    };
  }

  if (runCanary) {
    for (const target of targets) {
      onEvent({ type: 'canary-start', target });
      for (const question of canaryQuestions) {
        const result = normalizeRunnerResult(
          await executeQuestion(target, question, { repeat: 0, canary: true }),
        );
        await onResult(target, question, result, { repeat: 0, canary: true });
        const record = canaryRecord(target, question, result, formatUsageCost);
        canaries.push(record);
        if (!canaryAllowsScheduling(record)) {
          if (result.infrastructureError) {
            setupFailures.push({
              stage: result.budgetError ? 'budget' : 'canary',
              engine: result.budgetError ? target.engine : 'runner',
              question: question.id,
              error: result.infrastructureError,
            });
          }
          batchAborted = true;
          const reason = result.infrastructureError ?? result.runError;
          batchAbortReason = `canary gate ${result.gateVerdict} on ${target.label}/${question.id}${reason ? `: ${reason}` : ''}`;
          onEvent({ type: 'abort', stage: 'canary', message: batchAbortReason });
          return {
            stopBeforeReports: true,
            exitCode: 1,
            failure: { stage: 'canary', error: batchAbortReason },
            targets, runSets, canaries, setupFailures, setupComplete,
            batchAborted, batchAbortReason, epochDriftAbort,
          };
        }
      }
    }
    if (canaryOnly) {
      return {
        stopBeforeReports: true,
        exitCode: 0,
        failure: null,
        targets, runSets, canaries, setupFailures, setupComplete,
        batchAborted, batchAbortReason, epochDriftAbort,
      };
    }
  }

  const schedule = interleavedSchedule(
    repeats,
    questions.map((question) => question.id),
    targets.map((target) => target.id),
  );
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const targetById = new Map(targets.map((target) => [target.id, target]));

  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    let epochAtRun;
    try {
      epochAtRun = await refreshEpoch({ repeat, phase: 'before' });
    } catch (error) {
      const message = `repeat ${repeat} context: ${error.message}`;
      setupFailures.push({ stage: 'repeat-context', engine: 'ground-truth', error: message });
      batchAborted = true;
      batchAbortReason = message;
      onEvent({ type: 'abort', stage: 'repeat-context', message });
      break;
    }

    const currentRunSets = new Map();
    for (const target of targets) {
      const runSet = {
        targetId: target.id,
        label: target.label,
        engine: target.engine,
        model: target.model,
        repeat,
        epochAtRun,
        results: [],
        aborted: false,
        abortReason: null,
        invalidReason: null,
      };
      currentRunSets.set(target.id, runSet);
      runSets.push(runSet);
    }

    if (epochAtRun !== initialEpoch) {
      batchAborted = true;
      epochDriftAbort = true;
      batchAbortReason = `epoch drift before repeat ${repeat}: batch=${initialEpoch}, now=${epochAtRun}`;
      markRunSetsInvalid(currentRunSets, batchAbortReason);
      onEvent({ type: 'drift', message: batchAbortReason, benchmark });
      break;
    }

    onEvent({ type: 'repeat-start', repeat, repeats, epoch: epochAtRun });
    for (const entry of schedule.filter((item) => item.repeat === repeat)) {
      const question = questionById.get(entry.question);
      const target = targetById.get(entry.target);
      const runSet = currentRunSets.get(entry.target);
      const result = normalizeRunnerResult(
        await executeQuestion(target, question, { repeat, canary: false }),
      );
      await onResult(target, question, result, { repeat, canary: false });
      runSet.results.push(result);
      if (result.infrastructureError) {
        batchAborted = true;
        batchAbortReason = `${question.id}: ${result.infrastructureError}`;
        setupFailures.push({
          stage: result.budgetError ? 'budget' : 'run',
          engine: result.budgetError ? target.engine : 'runner',
          question: question.id,
          error: result.infrastructureError,
        });
        markRunSetsInvalid(currentRunSets, batchAbortReason);
        onEvent({ type: 'abort', stage: 'run', message: batchAbortReason });
        break;
      }
    }
    if (batchAborted) break;

    let epochAfterRun;
    try {
      epochAfterRun = await refreshEpoch({ repeat, phase: 'after' });
    } catch (error) {
      batchAborted = true;
      batchAbortReason = `post-repeat ${repeat} context: ${error.message}`;
      setupFailures.push({
        stage: 'post-repeat-context', engine: 'ground-truth', error: batchAbortReason,
      });
      markRunSetsInvalid(currentRunSets, batchAbortReason);
      onEvent({ type: 'abort', stage: 'post-repeat-context', message: batchAbortReason });
      break;
    }
    const drift = epochTransitionFailure(repeat, epochAtRun, epochAfterRun);
    if (drift) {
      batchAborted = true;
      epochDriftAbort = true;
      batchAbortReason = drift;
      markRunSetsInvalid(currentRunSets, drift);
      onEvent({ type: 'drift', message: drift, benchmark });
      break;
    }
  }

  return {
    stopBeforeReports: false,
    exitCode: null,
    failure: null,
    targets, runSets, canaries, setupFailures, setupComplete,
    batchAborted, batchAbortReason, epochDriftAbort,
  };
}
