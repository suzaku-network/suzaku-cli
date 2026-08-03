const GOLD_VERDICTS = new Set(['CORRECT', 'PARTIAL', 'WRONG']);
const SEMANTIC_VERDICTS = new Set(['PASS', 'PARTIAL', 'FAIL', 'PENDING_HUMAN']);
const DELIVERY_VERDICTS = new Set(['PASS', 'FAIL']);
const GOLD_TO_PREDICTED = {
  CORRECT: 'PASS',
  PARTIAL: 'PARTIAL',
  WRONG: 'FAIL',
};

function assertString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function assertStringArray(value, path) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new TypeError(`${path} must be an array of strings`);
  }
}

function uniqueBy(items, key, path) {
  const seen = new Set();
  for (const item of items) {
    const value = item?.[key];
    if (seen.has(value)) throw new TypeError(`${path} contains duplicate ${key}: ${String(value)}`);
    seen.add(value);
  }
}

export function validateCalibrationInputs({
  inventory,
  labelDocument,
  predictionDocument,
}) {
  if (!inventory || !Array.isArray(inventory.reviewCandidates)) {
    throw new TypeError('inventory.reviewCandidates must be an array');
  }
  if (labelDocument?.schemaVersion !== 1 || !Array.isArray(labelDocument.labels)) {
    throw new TypeError('labels must use schemaVersion 1 and contain a labels array');
  }
  if (predictionDocument?.schemaVersion !== 2 || !Array.isArray(predictionDocument.systems)) {
    throw new TypeError('predictions must use schemaVersion 2 and contain a systems array');
  }

  const candidates = new Map(inventory.reviewCandidates.map((sample) => [sample.sampleId, sample]));
  uniqueBy(labelDocument.labels, 'sampleId', 'labels');
  for (const [index, label] of labelDocument.labels.entries()) {
    const path = `labels[${index}]`;
    assertString(label?.sampleId, `${path}.sampleId`);
    if (!candidates.has(label.sampleId)) {
      throw new TypeError(`${path}.sampleId is not a review candidate: ${label.sampleId}`);
    }
    if (!GOLD_VERDICTS.has(label.verdict)) {
      throw new TypeError(`${path}.verdict must be CORRECT, PARTIAL, or WRONG`);
    }
    if (typeof label.critical !== 'boolean') {
      throw new TypeError(`${path}.critical must be boolean`);
    }
    assertStringArray(label.criteriaMet, `${path}.criteriaMet`);
    assertStringArray(label.criteriaMissed, `${path}.criteriaMissed`);
    assertString(label.reason, `${path}.reason`);
    assertString(label.labeler, `${path}.labeler`);
    if (label.adjudication !== 'CONFIRMED') {
      throw new TypeError(`${path}.adjudication must be CONFIRMED before calibration`);
    }
    const candidate = candidates.get(label.sampleId);
    if (candidate.eligibility?.status === 'REVIEW_REQUIRED'
      && label.evidenceReview !== 'SUFFICIENT') {
      throw new TypeError(
        `${path}.evidenceReview must be SUFFICIENT for a REVIEW_REQUIRED sample`,
      );
    }
  }

  uniqueBy(predictionDocument.systems, 'id', 'prediction systems');
  for (const [systemIndex, system] of predictionDocument.systems.entries()) {
    const path = `systems[${systemIndex}]`;
    assertString(system?.id, `${path}.id`);
    assertString(system?.evaluatorSha256, `${path}.evaluatorSha256`);
    if (!/^[a-f0-9]{64}$/i.test(system.evaluatorSha256)) {
      throw new TypeError(`${path}.evaluatorSha256 must be a SHA-256 hex digest`);
    }
    if (!Array.isArray(system.predictions)) {
      throw new TypeError(`${path}.predictions must be an array`);
    }
    uniqueBy(system.predictions, 'sampleId', `${path}.predictions`);
    for (const [predictionIndex, prediction] of system.predictions.entries()) {
      const predictionPath = `${path}.predictions[${predictionIndex}]`;
      assertString(prediction?.sampleId, `${predictionPath}.sampleId`);
      if (!candidates.has(prediction.sampleId)) {
        throw new TypeError(
          `${predictionPath}.sampleId is not a review candidate: ${prediction.sampleId}`,
        );
      }
      if (!SEMANTIC_VERDICTS.has(prediction.semanticVerdict)) {
        throw new TypeError(
          `${predictionPath}.semanticVerdict must be PASS, PARTIAL, FAIL, or PENDING_HUMAN`,
        );
      }
      if (!DELIVERY_VERDICTS.has(prediction.deliveryVerdict)) {
        throw new TypeError(`${predictionPath}.deliveryVerdict must be PASS or FAIL`);
      }
    }
  }
}

function emptyMatrix() {
  return Object.fromEntries([...GOLD_VERDICTS].map((gold) => [
    gold,
    Object.fromEntries([...SEMANTIC_VERDICTS].map((predicted) => [predicted, 0])),
  ]));
}

function systemReport(system, labels) {
  const predictionById = new Map(
    system.predictions.map((prediction) => [prediction.sampleId, prediction]),
  );
  const matrix = emptyMatrix();
  const missing = [];
  const disagreements = [];
  let exact = 0;
  let automated = 0;
  let falsePasses = 0;
  let criticalFalsePasses = 0;
  let correctSemanticFails = 0;
  let deliveryFailures = 0;
  let correctContentDeliveryFailures = 0;

  for (const label of labels) {
    const prediction = predictionById.get(label.sampleId);
    if (!prediction) {
      missing.push(label.sampleId);
      continue;
    }
    const predicted = prediction.semanticVerdict;
    matrix[label.verdict][predicted] += 1;
    if (predicted !== 'PENDING_HUMAN') automated += 1;
    const expected = GOLD_TO_PREDICTED[label.verdict];
    if (predicted === expected) exact += 1;
    else {
      disagreements.push({
        sampleId: label.sampleId,
        gold: label.verdict,
        predicted,
        critical: label.critical,
      });
    }
    if (label.verdict !== 'CORRECT' && predicted === 'PASS') falsePasses += 1;
    if (label.critical && label.verdict !== 'CORRECT' && predicted === 'PASS') {
      criticalFalsePasses += 1;
    }
    if (label.verdict === 'CORRECT' && predicted === 'FAIL') correctSemanticFails += 1;
    if (prediction.deliveryVerdict === 'FAIL') {
      deliveryFailures += 1;
      if (label.verdict === 'CORRECT') correctContentDeliveryFailures += 1;
    }
  }

  const complete = missing.length === 0;
  const denominator = labels.length;
  const nonCorrect = labels.filter((label) => label.verdict !== 'CORRECT').length;
  const correct = labels.filter((label) => label.verdict === 'CORRECT').length;
  return {
    id: system.id,
    evaluatorSha256: system.evaluatorSha256,
    complete,
    samples: denominator,
    missing,
    confusionMatrix: matrix,
    exactAgreement: denominator === 0 ? null : exact / denominator,
    automationCoverage: denominator === 0 ? null : automated / denominator,
    pendingHumanCoverage: denominator === 0 ? null : (denominator - automated) / denominator,
    falsePasses,
    falsePassRate: nonCorrect === 0 ? null : falsePasses / nonCorrect,
    criticalFalsePasses,
    correctSemanticFails,
    correctSemanticFailRate: correct === 0 ? null : correctSemanticFails / correct,
    deliveryFailures,
    deliveryFailureRate: denominator === 0 ? null : deliveryFailures / denominator,
    correctContentDeliveryFailures,
    disagreements,
    gate: complete && criticalFalsePasses === 0 && correctSemanticFails === 0 ? 'PASS' : 'FAIL',
  };
}

function changedVerdicts(systems, labels) {
  if (systems.length < 2 || labels.length === 0) return [];
  const maps = systems.map((system) => ({
    id: system.id,
    values: new Map(system.predictions.map((prediction) => [
      prediction.sampleId,
      prediction.semanticVerdict,
    ])),
  }));
  const changes = [];
  for (const label of labels) {
    const predictions = Object.fromEntries(
      maps.map(({ id, values }) => [id, values.get(label.sampleId) ?? 'MISSING']),
    );
    if (new Set(Object.values(predictions)).size > 1) {
      changes.push({
        sampleId: label.sampleId,
        gold: label.verdict,
        critical: label.critical,
        predictions,
      });
    }
  }
  return changes;
}

/**
 * Build an offline calibration report from human-confirmed labels and versioned
 * predictions. Old evaluator verdicts are never treated as gold.
 */
export function buildCalibrationReport({
  inventory,
  labelDocument,
  predictionDocument,
}) {
  validateCalibrationInputs({ inventory, labelDocument, predictionDocument });
  const labels = labelDocument.labels;
  const systems = predictionDocument.systems;
  const blockers = [];
  if (labels.length === 0) blockers.push('no human-confirmed gold labels');
  if (systems.length === 0) blockers.push('no versioned scorer/judge predictions');

  const reports = systems.map((system) => systemReport(system, labels));
  for (const report of reports) {
    if (!report.complete) {
      blockers.push(`${report.id} is missing ${report.missing.length} labelled predictions`);
    }
  }

  const status = blockers.length > 0
    ? 'BLOCKED'
    : reports.every((report) => report.gate === 'PASS') ? 'PASS' : 'FAIL';
  return {
    schemaVersion: 2,
    status,
    blockers,
    labelledSamples: labels.length,
    reviewCandidates: inventory.reviewCandidates.length,
    systems: reports,
    changedVerdicts: changedVerdicts(systems, labels),
    policy: {
      criticalFalsePassesAllowed: 0,
      correctSemanticFailsAllowed: 0,
      pendingHumanCountsAsAutomated: false,
      deliveryFailuresReportedSeparately: true,
    },
  };
}
