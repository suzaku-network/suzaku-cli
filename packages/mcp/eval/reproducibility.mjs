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

/** Successful tier-2 runs must carry terminal input and output token counts. */
export function hasCompleteUsage(usage) {
  return usage != null
    && typeof usage === 'object'
    && ['input_tokens', 'output_tokens'].every((key) => (
      Number.isFinite(usage[key]) && usage[key] >= 0
    ));
}

export function isValidRunSet(run, expectedQuestions) {
  return !run.aborted
    && !run.invalidReason
    && Array.isArray(run.results)
    && run.results.length === expectedQuestions
    && !run.results.some((result) => result.runError || !hasCompleteUsage(result.usage));
}

export function aggregateRunSets(runSets, expectedQuestions) {
  const valid = runSets.filter((run) => isValidRunSet(run, expectedQuestions));
  const results = valid.flatMap((run) => run.results);
  const passed = results.filter((result) => result.verdict === 'PASS').length;
  const walls = results.map((result) => result.wallMs).filter(Number.isFinite);
  const costs = results.map((result) => result.cost).filter(Number.isFinite);
  const completeCost = results.length > 0 && costs.length === results.length;
  const totalCost = costs.reduce((sum, cost) => sum + cost, 0);
  return {
    attemptedRuns: runSets.length,
    validRuns: valid.length,
    validRunRate: runSets.length === 0 ? 0 : valid.length / runSets.length,
    passed,
    questions: results.length,
    medianWallMs: percentile(walls, 0.5),
    p95WallMs: percentile(walls, 0.95),
    cost: completeCost ? totalCost : null,
    costPerPass: completeCost && passed > 0 ? totalCost / passed : null,
  };
}
