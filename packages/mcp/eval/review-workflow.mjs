import { createHash } from 'node:crypto';
import { hasCompleteUsage } from './reproducibility.mjs';

const HUMAN_VERDICTS = new Set(['CORRECT', 'PARTIAL', 'WRONG']);
const CRITERION_STATUSES = new Set(['MET', 'MISSED']);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function substitute(value, vars) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{(\w+)([+-]\d+)?\}\}/g, (_, name, delta) => {
    if (!(name in vars)) throw new TypeError(`missing template variable: ${name}`);
    if (!delta) return String(vars[name]);
    const base = Number(vars[name]);
    if (!Number.isFinite(base)) {
      throw new TypeError(`template variable is not numeric: ${name}`);
    }
    return String(base + Number(delta));
  });
}

function questionCriteria(contract) {
  return [
    ...(contract.required ?? []).map((text, index) => ({
      id: `required-${index + 1}`,
      category: 'required',
      text,
    })),
    ...(contract.prohibited ?? []).map((text, index) => ({
      id: `prohibited-${index + 1}`,
      category: 'prohibited',
      text: `Must not: ${text}`,
    })),
    ...(contract.semanticCriteria ?? []).map((text, index) => ({
      id: `semantic-${index + 1}`,
      category: 'semantic',
      text,
    })),
  ];
}

function sourceFailure(report) {
  if (report?.tier !== 2) return 'only Tier-2 result files can be reviewed';
  if (report.aborted) return 'the run was aborted';
  if (report.invalidReason) return `the run is invalid: ${report.invalidReason}`;
  if (report.driftWarning) return `the run has epoch drift: ${report.driftWarning}`;
  if (!Array.isArray(report.results) || report.results.length === 0) {
    return 'the result file has no answers';
  }
  for (const result of report.results) {
    if (result.runError) return `${result.id}: model run error: ${result.runError}`;
    if (result.infrastructureError) {
      return `${result.id}: infrastructure error: ${result.infrastructureError}`;
    }
    if (result.timedOut) return `${result.id}: model call timed out`;
    if (result.authError) return `${result.id}: model authentication failed`;
    if (!hasCompleteUsage(result.usage)) return `${result.id}: terminal usage is missing`;
    if (!Array.isArray(result.groundTruthEvidence)) {
      return `${result.id}: review ground truth is missing`;
    }
    for (const group of result.groundTruthEvidence) {
      if (group?.ok !== true) return `${result.id}: ground-truth call failed`;
      if (group?.parsed !== true) return `${result.id}: ground-truth payload was not parsed`;
      if (!Array.isArray(group.facts)) return `${result.id}: ground-truth facts are missing`;
      for (const fact of group.facts) {
        if (fact?.sane !== true || fact.value === undefined) {
          return `${result.id}: ground-truth fact is unresolved or invalid`;
        }
        if (String(fact.via ?? '').startsWith('deep-global')) {
          return `${result.id}: ground-truth fact used an untrusted global fallback`;
        }
      }
    }
  }
  return null;
}

function verifyInputs(report, questionSpec, contractSpec, expectedHashes) {
  if (report.suiteVersion !== questionSpec.suiteVersion
    || contractSpec.suiteVersion !== questionSpec.suiteVersion) {
    throw new TypeError('result, questions, and contracts must use the same suite version');
  }
  if (report.suiteStatus !== questionSpec.suiteStatus
    || contractSpec.suiteStatus !== questionSpec.suiteStatus) {
    throw new TypeError('result, questions, and contracts must use the same suite status');
  }
  for (const [name, expected] of Object.entries(expectedHashes)) {
    if (report.hashes?.[name] !== expected) {
      throw new TypeError(`${name} hash mismatch; review the exact files used by the run`);
    }
  }
  if (report.trackedDirty !== false) {
    throw new TypeError('review corpus requires a run from a clean tracked worktree');
  }
  assertString(report.gitSha, 'report.gitSha');
  if (!/^[a-f0-9]{40}$/i.test(report.gitSha)) {
    throw new TypeError('report.gitSha must be a full Git commit SHA');
  }
  const failure = sourceFailure(report);
  if (failure) throw new TypeError(`result is not reviewable: ${failure}`);
}

function evidenceFor(result) {
  return result.groundTruthEvidence.map((group) => ({
    tool: group.tool,
    args: group.args,
    facts: (group.facts ?? []).map((fact) => ({
      name: fact.name,
      value: fact.value,
      via: fact.via,
      sane: fact.sane,
    })),
  }));
}

function traceFor(result) {
  return (result.trace ?? []).map((call) => ({
    name: call.name ?? null,
    args: call.args ?? null,
    isError: call.isError === true,
  }));
}

function assertRequiredGroundTruth(result, contract) {
  const required = contract.requiredGroundTruth ?? [];
  const present = new Set((result.groundTruthEvidence ?? []).map((group) => group.tool));
  const missing = required.filter((tool) => !present.has(tool));
  if (missing.length > 0) {
    throw new TypeError(`${result.id}: required review ground truth missing: ${missing.join(', ')}`);
  }
}

/**
 * Convert one current, infrastructure-valid result file into an anonymous review
 * packet. This function copies evidence; it does not inspect answer wording or
 * assign a human verdict.
 */
export function buildReviewPacket({
  report,
  reportText,
  questionSpec,
  contractSpec,
  expectedHashes,
}) {
  verifyInputs(report, questionSpec, contractSpec, expectedHashes);
  const questionById = new Map(questionSpec.questions.map((question) => [question.id, question]));
  const contractById = new Map(contractSpec.contracts.map((contract) => [contract.id, contract]));
  const resultSha256 = sha256(reportText);
  const seen = new Set();
  const samples = report.results.map((result, index) => {
    if (seen.has(result.id)) throw new TypeError(`duplicate result question: ${result.id}`);
    seen.add(result.id);
    const question = questionById.get(result.id);
    const contract = contractById.get(result.id);
    if (!question || !contract) throw new TypeError(`missing current question contract: ${result.id}`);
    const answer = String(result.answer ?? '');
    if (answer.length === 0) throw new TypeError(`${result.id}: answer is empty`);
    assertRequiredGroundTruth(result, contract);
    return {
      sampleId: `sample-${sha256(`${resultSha256}:${index}:${result.id}`).slice(0, 12)}`,
      questionId: result.id,
      prompt: substitute(question.prompt, report.vars ?? {}),
      expectedOutcome: contract.expectedOutcome,
      authoritativeEvidence: contract.evidence ?? [],
      criteria: questionCriteria(contract),
      objectiveEvidence: evidenceFor(result),
      trace: traceFor(result),
      hardChecks: {
        verdict: result.verdict,
        gateVerdict: result.gateVerdict,
        semanticVerdict: result.semanticVerdict,
        traceInformational: result.traceScore?.informational === true,
        traceOk: result.traceScore?.ok === true,
        formatOk: result.format?.ok === true,
        policyOk: result.policy?.ok === true,
      },
      answer,
      hashes: {
        promptSha256: sha256(substitute(question.prompt, report.vars ?? {})),
        answerSha256: sha256(answer),
        evidenceSha256: sha256(JSON.stringify(evidenceFor(result))),
      },
    };
  });

  return {
    schemaVersion: 1,
    packetId: `review-${sha256(`${resultSha256}:${report.gitSha}`).slice(0, 16)}`,
    suiteVersion: report.suiteVersion,
    suiteStatus: report.suiteStatus,
    source: {
      runId: report.runId,
      repeat: report.repeat,
      epochAtRun: report.epochAtRun,
      gitSha: report.gitSha,
      resultSha256,
    },
    hashes: { ...expectedHashes },
    evaluator: {
      // The scoring-hash suffix versions the deterministic evaluator: a scorer
      // revision becomes a new prediction system instead of colliding with the
      // frozen hash recorded for the previous revision.
      id: `suite-v${report.suiteVersion}-deterministic@${expectedHashes.scoring.slice(0, 12)}`,
      sha256: expectedHashes.scoring,
    },
    samples,
  };
}

function markdownFence(value) {
  const fence = value.includes('```') ? '````' : '```';
  return `${fence}\n${value}\n${fence}`;
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

export function buildDecisionTemplate(packet) {
  return {
    schemaVersion: 1,
    packetId: packet.packetId,
    packetSha256: sha256(serializeJson(packet)),
    reviewer: null,
    sanitizationConfirmed: false,
    decisions: packet.samples.map((sample) => ({
      sampleId: sample.sampleId,
      criteria: sample.criteria.map((criterion) => ({
        id: criterion.id,
        status: null,
      })),
      verdict: null,
      critical: null,
      reason: null,
    })),
  };
}

export function renderReviewMarkdown(packet) {
  const lines = [
    '# Human review',
    '',
    'This page does not score language. It shows the frozen evidence and records no',
    'decision by itself. The model/provider identity is intentionally omitted.',
    '',
    `Packet: \`${packet.packetId}\``,
    `Suite: v${packet.suiteVersion}-${packet.suiteStatus}`,
    `Epoch: ${packet.source.epochAtRun}`,
    '',
  ];
  for (const sample of packet.samples) {
    lines.push(`## ${sample.sampleId}`);
    lines.push('');
    lines.push(`Question: ${sample.prompt}`);
    lines.push('');
    lines.push(`Expected outcome: ${sample.expectedOutcome}`);
    lines.push('');
    lines.push('Authoritative sources:');
    lines.push('');
    lines.push(markdownFence(pretty(sample.authoritativeEvidence)));
    lines.push('');
    lines.push('Review criteria:');
    lines.push('');
    for (const criterion of sample.criteria) {
      lines.push(`- \`${criterion.id}\` — ${criterion.text}`);
    }
    lines.push('');
    lines.push('Frozen tool/ground-truth evidence:');
    lines.push('');
    lines.push(markdownFence(pretty(sample.objectiveEvidence)));
    lines.push('');
    lines.push('Tool calls made by the model:');
    lines.push('');
    lines.push(markdownFence(pretty(sample.trace)));
    lines.push('');
    lines.push('Model answer:');
    lines.push('');
    lines.push(markdownFence(sample.answer));
    lines.push('');
    lines.push('Decision to record in the adjacent decisions JSON:');
    lines.push('');
    lines.push('- Mark every criterion `MET` or `MISSED`.');
    lines.push('- Choose `CORRECT`, `PARTIAL`, or `WRONG`.');
    lines.push('- State whether the error is critical and give one plain reason.');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function decisionMap(packet, decisions) {
  if (decisions?.schemaVersion !== 1 || decisions.packetId !== packet.packetId) {
    throw new TypeError('decisions do not belong to this review packet');
  }
  if (decisions.packetSha256 !== sha256(serializeJson(packet))) {
    throw new TypeError('review packet checksum changed after the decisions file was created');
  }
  assertString(decisions.reviewer, 'decisions.reviewer');
  if (decisions.sanitizationConfirmed !== true) {
    throw new TypeError('decisions.sanitizationConfirmed must be true');
  }
  if (!Array.isArray(decisions.decisions)) {
    throw new TypeError('decisions.decisions must be an array');
  }
  const byId = new Map();
  for (const decision of decisions.decisions) {
    if (byId.has(decision.sampleId)) {
      throw new TypeError(`duplicate human decision: ${decision.sampleId}`);
    }
    byId.set(decision.sampleId, decision);
  }
  if (byId.size !== packet.samples.length
    || packet.samples.some((sample) => !byId.has(sample.sampleId))) {
    throw new TypeError('human decisions must cover every packet sample exactly once');
  }
  return byId;
}

/**
 * Validate explicit human decisions and derive sanitized corpus records. No
 * verdict is inferred from answer text, facts, or criteria wording.
 */
export function finalizeHumanReview(packet, decisions) {
  const byId = decisionMap(packet, decisions);
  const labels = [];
  const samples = [];
  const predictions = [];

  for (const sample of packet.samples) {
    const decision = byId.get(sample.sampleId);
    if (!HUMAN_VERDICTS.has(decision.verdict)) {
      throw new TypeError(`${sample.sampleId}: verdict must be CORRECT, PARTIAL, or WRONG`);
    }
    if (typeof decision.critical !== 'boolean') {
      throw new TypeError(`${sample.sampleId}: critical must be boolean`);
    }
    if (decision.verdict === 'CORRECT' && decision.critical) {
      throw new TypeError(`${sample.sampleId}: a CORRECT answer cannot carry a critical error`);
    }
    assertString(decision.reason, `${sample.sampleId}.reason`);
    if (!Array.isArray(decision.criteria)) {
      throw new TypeError(`${sample.sampleId}: criteria must be an array`);
    }
    const criterionById = new Map(decision.criteria.map((criterion) => [
      criterion.id,
      criterion.status,
    ]));
    if (criterionById.size !== sample.criteria.length
      || sample.criteria.some((criterion) => !criterionById.has(criterion.id))) {
      throw new TypeError(`${sample.sampleId}: every review criterion must be decided exactly once`);
    }
    const met = [];
    const missed = [];
    for (const criterion of sample.criteria) {
      const status = criterionById.get(criterion.id);
      if (!CRITERION_STATUSES.has(status)) {
        throw new TypeError(`${sample.sampleId}/${criterion.id}: status must be MET or MISSED`);
      }
      (status === 'MET' ? met : missed).push(criterion.text);
    }
    if (decision.verdict === 'CORRECT' && missed.length > 0) {
      throw new TypeError(`${sample.sampleId}: CORRECT is inconsistent with missed criteria`);
    }
    if (decision.verdict !== 'CORRECT' && missed.length === 0) {
      throw new TypeError(`${sample.sampleId}: ${decision.verdict} requires a missed criterion`);
    }

    labels.push({
      sampleId: sample.sampleId,
      verdict: decision.verdict,
      critical: decision.critical,
      criteriaMet: met,
      criteriaMissed: missed,
      reason: decision.reason,
      labeler: decisions.reviewer,
      adjudication: 'CONFIRMED',
    });
    samples.push({
      sampleId: sample.sampleId,
      questionId: sample.questionId,
      suiteVersion: packet.suiteVersion,
      promptSha256: sample.hashes.promptSha256,
      answerSha256: sample.hashes.answerSha256,
      frozenEvidenceStatus: 'full-review-packet',
      source: {
        resultSha256: packet.source.resultSha256,
        gitSha: packet.source.gitSha,
        packetId: packet.packetId,
        packetSha256: decisions.packetSha256,
      },
      eligibility: {
        status: 'HUMAN_REVIEWED',
        reason: null,
      },
    });
    predictions.push({
      sampleId: sample.sampleId,
      // Suite-v5 packets created before this field was added are known to have
      // used PENDING_HUMAN for every unreviewed semantic answer.
      semanticVerdict: sample.hardChecks.semanticVerdict ?? 'PENDING_HUMAN',
      deliveryVerdict: sample.hardChecks.gateVerdict,
      deliveryChecks: {
        traceOk: sample.hardChecks.traceOk,
        formatOk: sample.hardChecks.formatOk,
        policyOk: sample.hardChecks.policyOk,
      },
    });
  }

  return {
    samples,
    labels,
    predictionSystem: {
      id: packet.evaluator.id,
      evaluatorSha256: packet.evaluator.sha256,
      predictions,
    },
  };
}

function mergeUnique(existing, additions, key, label) {
  const values = new Map(existing.map((entry) => [entry[key], entry]));
  for (const addition of additions) {
    const prior = values.get(addition[key]);
    if (prior && JSON.stringify(prior) !== JSON.stringify(addition)) {
      throw new TypeError(`${label} conflicts with existing ${key}: ${addition[key]}`);
    }
    values.set(addition[key], addition);
  }
  return [...values.values()].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

export function mergeReviewCorpus({
  reviewSampleDocument,
  labelDocument,
  predictionDocument,
  finalized,
}) {
  if (reviewSampleDocument?.schemaVersion !== 1
    || !Array.isArray(reviewSampleDocument.samples)) {
    throw new TypeError('review samples must use schemaVersion 1');
  }
  if (labelDocument?.schemaVersion !== 1 || !Array.isArray(labelDocument.labels)) {
    throw new TypeError('labels must use schemaVersion 1');
  }
  if (predictionDocument?.schemaVersion !== 2 || !Array.isArray(predictionDocument.systems)) {
    throw new TypeError('predictions must use schemaVersion 2');
  }

  const systems = [...predictionDocument.systems];
  const index = systems.findIndex((system) => system.id === finalized.predictionSystem.id);
  if (index >= 0) {
    if (systems[index].evaluatorSha256 !== finalized.predictionSystem.evaluatorSha256) {
      throw new TypeError(`prediction system hash changed: ${finalized.predictionSystem.id}`);
    }
    systems[index] = {
      ...systems[index],
      predictions: mergeUnique(
        systems[index].predictions,
        finalized.predictionSystem.predictions,
        'sampleId',
        'prediction',
      ),
    };
  } else {
    systems.push(finalized.predictionSystem);
  }
  systems.sort((a, b) => a.id.localeCompare(b.id));

  return {
    reviewSampleDocument: {
      ...reviewSampleDocument,
      samples: mergeUnique(
        reviewSampleDocument.samples,
        finalized.samples,
        'sampleId',
        'review sample',
      ),
    },
    labelDocument: {
      ...labelDocument,
      labels: mergeUnique(labelDocument.labels, finalized.labels, 'sampleId', 'label'),
    },
    predictionDocument: {
      ...predictionDocument,
      systems,
    },
  };
}
