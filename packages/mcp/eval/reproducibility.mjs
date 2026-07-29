// Pure helpers for repeat scheduling, infrastructure validity, and aggregate summaries.

export function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

/** Repeat → question → target is the least drift-biased paid execution order. */
export function interleavedSchedule(repeats, questionIds, targetIds) {
  const schedule = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    for (const question of questionIds) {
      for (const target of targetIds) schedule.push({ repeat, question, target });
    }
  }
  return schedule;
}

/** A comparison may start only when every requested target was constructed exactly once. */
export function hasExactTargetSetup(requestedTargetIds, runnableTargetIds) {
  if (!Array.isArray(requestedTargetIds) || !Array.isArray(runnableTargetIds)
    || requestedTargetIds.length !== runnableTargetIds.length) return false;
  const requested = new Set(requestedTargetIds);
  const runnable = new Set(runnableTargetIds);
  return requested.size === requestedTargetIds.length
    && runnable.size === runnableTargetIds.length
    && [...requested].every((targetId) => runnable.has(targetId));
}

/** Return a deterministic reason when MCP ground truth cannot be trusted. */
export function groundTruthTrustFailure(groups) {
  if (!Array.isArray(groups)) return 'ground truth result is not an array';
  for (const group of groups) {
    const tool = group?.tool ?? 'unknown-tool';
    if (group?.ok !== true) {
      return `ground-truth call failed (${tool}): ${group?.error ?? 'unknown error'}`;
    }
    if (group.parsed !== true) return `ground-truth JSON parse failed (${tool})`;
    if (!Array.isArray(group.facts)) return `ground-truth facts missing (${tool})`;
    for (const fact of group.facts) {
      const name = fact?.spec?.name ?? 'unnamed-fact';
      if (fact?.value === undefined) return `ground-truth fact unresolved (${tool}/${name})`;
      if (fact?.sane !== true) return `ground-truth fact insane (${tool}/${name})`;
      if (String(fact?.via ?? '').startsWith('deep-global')) {
        return `ground-truth fact used deep-global (${tool}/${name})`;
      }
    }
  }
  return null;
}

/** A repeat is comparable only when the live epoch is unchanged at its end. */
export function epochTransitionFailure(repeat, startedEpoch, endedEpoch) {
  if (startedEpoch === endedEpoch) return null;
  return `epoch drift during repeat ${repeat}: started=${startedEpoch}, ended=${endedEpoch}`;
}

export function validateCanaryPolicy({
  tier, canary = false, canaryOnly = false, benchmark = false,
  only = null, repeat = 1, repeatExplicit = false,
}) {
  const errors = [];
  if ((canary || canaryOnly) && tier !== 2) errors.push('canaries require --tier 2');
  if (canary && canaryOnly) errors.push('--canary and --canary-only are mutually exclusive');
  if (canaryOnly && benchmark) errors.push('--canary-only is incompatible with --benchmark');
  if (canaryOnly && Array.isArray(only)) errors.push('--canary-only is incompatible with --only');
  if (canaryOnly && repeatExplicit && repeat !== 1) {
    errors.push('--canary-only requires --repeat 1');
  }
  if (benchmark && tier !== 2) errors.push('--benchmark requires --tier 2');
  if (benchmark && !canary) errors.push('--benchmark requires --canary');
  return errors;
}

export function canaryAllowsScheduling(result) {
  return result?.gateVerdict === 'PASS'
    && !result.runError
    && !result.infrastructureError
    && result.timedOut !== true
    && result.authError !== true;
}

/** Successful tier-2 runs must carry terminal input and output token counts. */
export function hasCompleteUsage(usage) {
  return usage != null
    && typeof usage === 'object'
    && ['input_tokens', 'output_tokens'].every((key) => (
      Number.isFinite(usage[key]) && usage[key] >= 0
    ));
}

const USAGE_KEYS = [
  'input_tokens', 'output_tokens', 'cache_creation_input_tokens',
  'cache_read_input_tokens', 'total_tokens',
];

/** Missing terminal usage poisons the aggregate instead of becoming zero. */
export function aggregateUsage(results) {
  if (!Array.isArray(results) || results.length === 0
    || results.some((result) => !hasCompleteUsage(result.usage))) return null;
  return Object.fromEntries(USAGE_KEYS
    .filter((key) => results.every((result) => Number.isFinite(result.usage[key])))
    .map((key) => [key, results.reduce((sum, result) => sum + result.usage[key], 0)]));
}

/** Shared report/manifest totals: unknown values remain null. */
export function summarizeUsage(results) {
  const costs = Array.isArray(results)
    ? results.map((result) => result.cost).filter(Number.isFinite)
    : [];
  const completeCost = Array.isArray(results) && results.length > 0 && costs.length === results.length;
  return {
    usage: aggregateUsage(results),
    cost: completeCost ? costs.reduce((sum, cost) => sum + cost, 0) : null,
  };
}

export function usageTokenCount(usage) {
  if (!hasCompleteUsage(usage)) return null;
  if (Number.isFinite(usage.total_tokens)) return usage.total_tokens;
  return usage.input_tokens
    + usage.output_tokens
    + Number(usage.cache_read_input_tokens ?? 0)
    + Number(usage.cache_creation_input_tokens ?? 0);
}

export function formatUsageCost(result, engine) {
  const tokens = usageTokenCount(result?.usage);
  const usage = tokens == null ? 'usage unknown' : `${Math.round(tokens / 1000)}k tok`;
  if (engine === 'codex') return `sub (${usage})`;
  return Number.isFinite(result?.cost) ? `$${result.cost.toFixed(4)} (${usage})` : usage;
}

export function isValidRunSet(run, expectedQuestions) {
  return !run.aborted
    && !run.invalidReason
    && !run.driftWarning
    && Array.isArray(run.results)
    && run.results.length === expectedQuestions
    && !run.results.some((result) => (
      result.runError || result.infrastructureError || result.timedOut || result.authError
      || !hasCompleteUsage(result.usage)
    ));
}

/** Infrastructure-valid benchmark batches may contain any quality verdict. */
export function isCommitReadyBenchmark({
  benchmarkRequested = false,
  setupComplete = false,
  setupFailures = [],
  canaryRequested = false,
  canaries = [],
  epochDriftAbort = false,
  batchAborted = false,
  runSets = [],
  questionIds = [],
  targetIds = [],
  repeats = 1,
} = {}) {
  if (!benchmarkRequested || !setupComplete || setupFailures.length > 0
    || epochDriftAbort || batchAborted || questionIds.length === 0
    || targetIds.length === 0 || !Number.isInteger(repeats) || repeats < 1
    || !canaryRequested) return false;

  if (canaries.length !== targetIds.length) return false;
  const seenTargets = new Set();
  for (const result of canaries) {
    if (!targetIds.includes(result.targetId) || seenTargets.has(result.targetId)
      || !canaryAllowsScheduling(result) || result.verdict !== 'PASS'
      || !hasCompleteUsage(result.usage)) return false;
    seenTargets.add(result.targetId);
  }

  const expectedKeys = new Set();
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    for (const targetId of targetIds) expectedKeys.add(`${repeat}:${targetId}`);
  }
  if (runSets.length !== expectedKeys.size) return false;
  const seenRunSets = new Set();
  for (const run of runSets) {
    const key = `${run.repeat}:${run.targetId}`;
    if (!expectedKeys.has(key) || seenRunSets.has(key) || run.driftWarning
      || !isValidRunSet(run, questionIds.length)) return false;
    seenRunSets.add(key);
    const resultIds = run.results.map((result) => result.id);
    if (resultIds.length !== new Set(resultIds).size
      || questionIds.some((id) => !resultIds.includes(id))
      || run.results.some((result) => result.verdict === 'PENDING_HUMAN')) return false;
  }
  return seenRunSets.size === expectedKeys.size;
}

export function manifestDestinations({ tier, argsValid, commitReady }) {
  const local = tier === 2 && argsValid === true;
  return { local, canonical: local && commitReady === true };
}

export function aggregateRunSets(runSets, expectedQuestions) {
  const valid = runSets.filter((run) => isValidRunSet(run, expectedQuestions));
  const results = valid.flatMap((run) => run.results);
  const passed = results.filter((result) => result.verdict === 'PASS').length;
  const pending = results.filter((result) => result.verdict === 'PENDING_HUMAN').length;
  const walls = results.map((result) => result.wallMs).filter(Number.isFinite);
  const costs = results.map((result) => result.cost).filter(Number.isFinite);
  const completeCost = results.length > 0 && costs.length === results.length;
  const totalCost = costs.reduce((sum, cost) => sum + cost, 0);
  return {
    attemptedRuns: runSets.length,
    validRuns: valid.length,
    validRunRate: runSets.length === 0 ? 0 : valid.length / runSets.length,
    passed,
    pending,
    questions: results.length,
    medianWallMs: percentile(walls, 0.5),
    p95WallMs: percentile(walls, 0.95),
    usage: aggregateUsage(results),
    cost: completeCost ? totalCost : null,
    costPerPass: completeCost && passed > 0 ? totalCost / passed : null,
  };
}
