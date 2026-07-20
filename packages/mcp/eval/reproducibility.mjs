// Pure helpers for repeat scheduling, aggregate summaries, and Cursor price calibration.

export function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))];
}

/** Repeat → question → engine/model is the least drift-biased paid execution order. */
export function interleavedSchedule(repeats, questionIds, targetIds) {
  const schedule = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    for (const question of questionIds) {
      for (const target of targetIds) schedule.push({ repeat, question, target });
    }
  }
  return schedule;
}

function predictedCursorCost(usage, rateCard) {
  const input = Number(usage.input_tokens ?? 0)
    + Number(usage.cache_creation_input_tokens ?? 0) * Number(rateCard.cacheInputMultiplier ?? 1)
    + Number(usage.cache_read_input_tokens ?? 0) * Number(rateCard.cacheInputMultiplier ?? 1);
  const output = Number(usage.output_tokens ?? 0);
  return (input * Number(rateCard.inputPerMTok) + output * Number(rateCard.outputPerMTok)) / 1e6;
}

function sameModelIdentity(actual, expected) {
  const canonical = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return canonical(actual).length > 0 && canonical(actual) === canonical(expected);
}

/** Reject ambiguous Cursor model selections before any paid inference starts. */
export function validateCursorVariantConfig(config, requestedModels) {
  const errors = [];
  for (const requestedModel of requestedModels ?? []) {
    const entry = config?.models?.[requestedModel];
    if (!entry) {
      errors.push(`${requestedModel}: missing variant config`);
      continue;
    }
    if (typeof entry.cliModel !== 'string' || entry.cliModel.length === 0) {
      errors.push(`${requestedModel}: missing explicit cliModel`);
    }
    if (typeof entry.resolvedModel !== 'string' || entry.resolvedModel.length === 0) {
      errors.push(`${requestedModel}: missing resolvedModel display identity`);
    }
    if (!['standard', 'fast'].includes(entry.serviceTier)) {
      errors.push(`${requestedModel}: serviceTier must be standard or fast`);
    }
    const fastParameter = /(?:\[|,)\s*fast=(true|false)(?:,|\])/i.exec(entry.cliModel ?? '')?.[1]?.toLowerCase();
    const expectedFast = entry.serviceTier === 'fast' ? 'true' : 'false';
    if (fastParameter !== expectedFast) {
      errors.push(`${requestedModel}: cliModel must explicitly set fast=${expectedFast}`);
    }
    if (!entry.rateCard || ![
      entry.rateCard.inputPerMTok,
      entry.rateCard.outputPerMTok,
      entry.rateCard.cacheInputMultiplier,
    ].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) {
      errors.push(`${requestedModel}: invalid rateCard`);
    }
  }
  return errors;
}

/**
 * Price data is usable only after either dashboard category rates are confirmed, or
 * two token-diverse per-run dashboard samples reproduce the declared card within 5%.
 */
export function validateCursorCalibration(entry) {
  if (!entry?.rateCard) return { verified: false, reason: 'missing-rate-card' };
  const card = entry.rateCard;
  if (![card.inputPerMTok, card.outputPerMTok, card.cacheInputMultiplier]
    .every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) {
    return { verified: false, reason: 'invalid-rate-card' };
  }
  const category = entry.dashboardCategoryRates;
  if (category?.verifiedAgainstDashboard === true) {
    const inputError = Math.abs(Number(category.inputPerMTok) - Number(card.inputPerMTok))
      / Math.max(Number(card.inputPerMTok), 1e-12);
    const outputError = Math.abs(Number(category.outputPerMTok) - Number(card.outputPerMTok))
      / Math.max(Number(card.outputPerMTok), 1e-12);
    if (inputError <= 0.05 && outputError <= 0.05) {
      return { verified: true, method: 'dashboard-category-rates', maxRelativeError: Math.max(inputError, outputError) };
    }
    return { verified: false, reason: 'dashboard-category-rate-mismatch' };
  }

  const samples = (entry.samples ?? []).filter((sample) => Number(sample.dashboardCostUsd) > 0
    && sameModelIdentity(sample.resolvedModel, entry.resolvedModel)
    && sample.serviceTier === entry.serviceTier);
  if (samples.length < 2) return { verified: false, reason: 'need-two-dashboard-samples' };
  const totals = samples.map((sample) => (
    Number(sample.usage?.input_tokens ?? 0)
    + Number(sample.usage?.cache_creation_input_tokens ?? 0)
    + Number(sample.usage?.cache_read_input_tokens ?? 0)
    + Number(sample.usage?.output_tokens ?? 0)
  ));
  const positive = totals.filter((total) => total > 0);
  if (positive.length < 2 || Math.max(...positive) / Math.min(...positive) < 1.25) {
    return { verified: false, reason: 'samples-not-token-diverse' };
  }
  const errors = samples.map((sample) => {
    const predicted = predictedCursorCost(sample.usage ?? {}, card);
    return Math.abs(predicted - Number(sample.dashboardCostUsd)) / Number(sample.dashboardCostUsd);
  });
  const maxRelativeError = Math.max(...errors);
  return maxRelativeError <= 0.05
    ? { verified: true, method: 'dashboard-run-samples', maxRelativeError }
    : { verified: false, reason: 'dashboard-sample-mismatch', maxRelativeError };
}

export function priceCursorRun(config, requestedModel, resolvedModel, serviceTier, usage) {
  const entry = config?.models?.[requestedModel];
  if (!entry) return {
    cost: null, estimatedCost: null, status: 'unverified', reason: 'missing-rate-card', rateCard: null,
  };
  if (!resolvedModel || !sameModelIdentity(resolvedModel, entry.resolvedModel)) {
    return {
      cost: null, estimatedCost: null, status: 'unverified', reason: 'resolved-model-mismatch', rateCard: entry.rateCard,
    };
  }
  if (!serviceTier || serviceTier !== entry.serviceTier) {
    return {
      cost: null, estimatedCost: null, status: 'unverified', reason: 'service-tier-unobserved-or-mismatched', rateCard: entry.rateCard,
    };
  }
  const calibration = validateCursorCalibration(entry);
  const estimatedCost = calibration.reason === 'invalid-rate-card' || calibration.reason === 'missing-rate-card'
    ? null
    : predictedCursorCost(usage ?? {}, entry.rateCard);
  if (!calibration.verified) {
    return {
      cost: null, estimatedCost, status: 'unverified', reason: calibration.reason, rateCard: entry.rateCard,
    };
  }
  return {
    cost: predictedCursorCost(usage ?? {}, entry.rateCard),
    estimatedCost,
    status: 'verified',
    reason: calibration.method,
    rateCard: entry.rateCard,
  };
}

export function assessCursorEligibility(config, requestedModel, resolvedModel, serviceTier, {
  boundaryViolation = false, needsToolEvidence = false, argsVisible = null, requestedCliModel = null,
} = {}) {
  if (boundaryViolation) return { eligible: false, reason: 'mcp-boundary-violation' };
  const expected = config?.models?.[requestedModel];
  if (!expected) return { eligible: false, reason: 'missing-requested-variant-config' };
  if (!sameModelIdentity(resolvedModel, expected.resolvedModel)) {
    return { eligible: false, reason: 'resolved-model-mismatch' };
  }
  if (serviceTier != null && serviceTier !== expected.serviceTier) {
    return { eligible: false, reason: 'resolved-service-tier-unobserved-or-mismatched' };
  }
  const exactCliVariant = typeof expected.cliModel === 'string'
    && requestedCliModel === expected.cliModel;
  if (serviceTier == null && !exactCliVariant) {
    return { eligible: false, reason: 'resolved-service-tier-unobserved-or-variant-not-pinned' };
  }
  if (needsToolEvidence && argsVisible !== true) {
    return { eligible: false, reason: 'mcp-tool-arguments-unobserved' };
  }
  return {
    eligible: true,
    reason: null,
    effectiveServiceTier: serviceTier ?? expected.serviceTier,
    serviceTierEvidence: serviceTier != null ? 'stream' : 'exact-cli-model-parameter',
  };
}

export function isValidRunSet(run, expectedQuestions) {
  return !run.aborted
    && !run.invalidReason
    && run.results.length === expectedQuestions
    && !run.results.some((result) => result.runError
      || result.boundaryViolation
      || result.benchmarkEligible === false);
}

export function aggregateRunSets(runSets, expectedQuestions) {
  const boundaryRuns = runSets.filter((run) => run.results.some((result) => result.boundaryViolation));
  const valid = runSets.filter((run) => isValidRunSet(run, expectedQuestions));
  const results = valid.flatMap((run) => run.results);
  const passed = results.filter((result) => result.verdict === 'PASS').length;
  const walls = results.map((result) => result.wallMs).filter(Number.isFinite);
  const verifiedCosts = results.filter((result) => result.costStatus !== 'unverified' && Number.isFinite(result.cost));
  const estimatedCosts = results.filter((result) => Number.isFinite(result.estimatedCost));
  const totalCost = verifiedCosts.reduce((sum, result) => sum + result.cost, 0);
  const totalEstimatedCost = estimatedCosts.reduce((sum, result) => sum + result.estimatedCost, 0);
  return {
    attemptedRuns: runSets.length,
    validRuns: valid.length,
    validRunRate: runSets.length === 0 ? 0 : valid.length / runSets.length,
    boundaryRuns: boundaryRuns.length,
    boundaryRunRate: runSets.length === 0 ? 0 : boundaryRuns.length / runSets.length,
    passed,
    questions: results.length,
    medianWallMs: percentile(walls, 0.5),
    p95WallMs: percentile(walls, 0.95),
    cost: verifiedCosts.length === results.length ? totalCost : null,
    costPerPass: verifiedCosts.length === results.length && passed > 0 ? totalCost / passed : null,
    estimatedCost: estimatedCosts.length === results.length ? totalEstimatedCost : null,
    estimatedCostPerPass: estimatedCosts.length === results.length && passed > 0
      ? totalEstimatedCost / passed
      : null,
  };
}
