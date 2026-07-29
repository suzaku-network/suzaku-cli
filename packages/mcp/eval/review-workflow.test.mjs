import { describe, expect, it } from 'vitest';
import {
  buildDecisionTemplate, buildReviewPacket, finalizeHumanReview,
  mergeReviewCorpus, renderReviewMarkdown, serializeJson,
} from './review-workflow.mjs';

const hashes = {
  questions: 'a'.repeat(64),
  questionContracts: 'b'.repeat(64),
  scoring: 'c'.repeat(64),
  reviewWorkflow: 'e'.repeat(64),
};
const questionSpec = {
  suiteVersion: 5,
  suiteStatus: 'draft',
  questions: [{
    id: 'q1',
    prompt: 'Is epoch {{currentEpoch-1}} ready?',
  }],
};
const contractSpec = {
  suiteVersion: 5,
  suiteStatus: 'draft',
  contracts: [{
    id: 'q1',
    expectedOutcome: 'State the verified readiness of the previous epoch.',
    required: ['Use the previous epoch.'],
    prohibited: ['Do not claim the current epoch is complete.'],
    semanticCriteria: ['Associate readiness with the correct epoch.'],
    evidence: [{ kind: 'live-mcp', ref: 'q1' }],
  }],
};
const baseResult = {
  id: 'q1',
  answer: 'Epoch 51 is ready.',
  verdict: 'PENDING_HUMAN',
  gateVerdict: 'PASS',
  usage: { input_tokens: 100, output_tokens: 10 },
  trace: [{
    name: 'epoch_status',
    args: { epoch: 51 },
    isError: false,
  }],
  traceScore: { ok: true, informational: false },
  format: { ok: true },
  policy: { ok: true },
  groundTruthEvidence: [{
    tool: 'epoch_status',
    args: { epoch: 51 },
    ok: true,
    parsed: true,
    facts: [{
      name: 'ready',
      value: true,
      via: 'path',
      sane: true,
    }],
  }],
};
const report = {
  schemaVersion: 2,
  runId: 'run-1',
  tier: 2,
  suiteVersion: 5,
  suiteStatus: 'draft',
  gitSha: 'd'.repeat(40),
  trackedDirty: false,
  hashes,
  engine: 'anthropic',
  model: 'hidden-model',
  repeat: 1,
  epochAtRun: 52,
  aborted: false,
  invalidReason: null,
  driftWarning: null,
  vars: { currentEpoch: 52 },
  results: [baseResult],
};

function packetFor(value = report) {
  const reportText = serializeJson(value);
  return buildReviewPacket({
    report: value,
    reportText,
    questionSpec,
    contractSpec,
    expectedHashes: hashes,
  });
}

function completedDecisions(packet, {
  verdict = 'CORRECT',
  missed = [],
  critical = false,
} = {}) {
  const decisions = buildDecisionTemplate(packet);
  decisions.reviewer = 'human@example';
  decisions.sanitizationConfirmed = true;
  decisions.decisions = decisions.decisions.map((decision) => ({
    ...decision,
    criteria: decision.criteria.map((criterion) => ({
      ...criterion,
      status: missed.includes(criterion.id) ? 'MISSED' : 'MET',
    })),
    verdict,
    critical,
    reason: verdict === 'CORRECT' ? 'Matches the frozen evidence.' : 'Misses a required criterion.',
  }));
  return decisions;
}

describe('human review packet', () => {
  it('shows evidence and an answer without exposing or inferring the model/verdict', () => {
    const packet = packetFor();
    const page = renderReviewMarkdown(packet);
    const decisions = buildDecisionTemplate(packet);
    expect(packet.samples[0]).toMatchObject({
      prompt: 'Is epoch 51 ready?',
      expectedOutcome: 'State the verified readiness of the previous epoch.',
      answer: 'Epoch 51 is ready.',
      objectiveEvidence: [{
        tool: 'epoch_status',
        facts: [{ name: 'ready', value: true }],
      }],
    });
    expect(page).toContain('Epoch 51 is ready.');
    expect(page).toContain('"ready"');
    expect(page).not.toContain('hidden-model');
    expect(page).not.toContain('anthropic');
    expect(page).not.toContain('PENDING_HUMAN');
    expect(decisions.decisions[0]).toMatchObject({
      verdict: null,
      critical: null,
      reason: null,
    });
    expect(decisions.decisions[0].criteria.every(({ status }) => status === null)).toBe(true);
  });

  it('rejects stale, dirty, and infrastructure-invalid source results', () => {
    expect(() => packetFor({
      ...report,
      hashes: { ...hashes, scoring: 'f'.repeat(64) },
    })).toThrow('scoring hash mismatch');
    expect(() => packetFor({ ...report, trackedDirty: true }))
      .toThrow('clean tracked worktree');
    expect(() => packetFor({
      ...report,
      results: [{ ...baseResult, runError: 'timeout' }],
    })).toThrow('model run error');
    expect(() => packetFor({
      ...report,
      results: [{ ...baseResult, groundTruthEvidence: undefined }],
    })).toThrow('review ground truth is missing');
    expect(() => packetFor({
      ...report,
      results: [{
        ...baseResult,
        groundTruthEvidence: [{
          ...baseResult.groundTruthEvidence[0],
          facts: [{
            ...baseResult.groundTruthEvidence[0].facts[0],
            via: 'deep-global+derive:any',
          }],
        }],
      }],
    })).toThrow('untrusted global fallback');
  });
});

describe('explicit human decisions', () => {
  it('requires a completed human decision for every criterion and answer', () => {
    const packet = packetFor();
    expect(() => finalizeHumanReview(packet, buildDecisionTemplate(packet)))
      .toThrow('reviewer must be a non-empty string');
    const incomplete = completedDecisions(packet);
    incomplete.decisions[0].criteria[0].status = null;
    expect(() => finalizeHumanReview(packet, incomplete)).toThrow('status must be MET or MISSED');
  });

  it('records exactly the supplied human label, independent of answer wording', () => {
    const packet = packetFor();
    const correct = finalizeHumanReview(packet, completedDecisions(packet));
    const wrong = finalizeHumanReview(packet, completedDecisions(packet, {
      verdict: 'WRONG',
      missed: ['semantic-1'],
      critical: true,
    }));
    expect(correct.labels[0]).toMatchObject({
      verdict: 'CORRECT',
      critical: false,
      criteriaMissed: [],
    });
    expect(wrong.labels[0]).toMatchObject({
      verdict: 'WRONG',
      critical: true,
      criteriaMissed: ['Associate readiness with the correct epoch.'],
    });
    expect(correct.predictionSystem.predictions[0].verdict).toBe('PENDING_HUMAN');
    expect(wrong.predictionSystem.predictions[0].verdict).toBe('PENDING_HUMAN');
  });

  it('rejects an overall verdict that contradicts the criterion decisions', () => {
    const packet = packetFor();
    expect(() => finalizeHumanReview(packet, completedDecisions(packet, {
      verdict: 'CORRECT',
      missed: ['required-1'],
    }))).toThrow('CORRECT is inconsistent');
    expect(() => finalizeHumanReview(packet, completedDecisions(packet, {
      verdict: 'PARTIAL',
    }))).toThrow('PARTIAL requires a missed criterion');
    expect(() => finalizeHumanReview(packet, completedDecisions(packet, {
      verdict: 'CORRECT',
      critical: true,
    }))).toThrow('CORRECT answer cannot carry a critical error');
  });

  it('merges sanitized provenance, labels, and evaluator predictions without overwrites', () => {
    const packet = packetFor();
    const finalized = finalizeHumanReview(packet, completedDecisions(packet));
    const empty = {
      reviewSampleDocument: { schemaVersion: 1, samples: [] },
      labelDocument: { schemaVersion: 1, labels: [] },
      predictionDocument: { schemaVersion: 1, systems: [] },
      finalized,
    };
    const merged = mergeReviewCorpus(empty);
    expect(merged.reviewSampleDocument.samples).toHaveLength(1);
    expect(merged.labelDocument.labels).toHaveLength(1);
    expect(merged.predictionDocument.systems[0]).toMatchObject({
      id: 'suite-v5-deterministic',
      evaluatorSha256: hashes.scoring,
      predictions: [{
        sampleId: packet.samples[0].sampleId,
        verdict: 'PENDING_HUMAN',
      }],
    });
    expect(mergeReviewCorpus({
      reviewSampleDocument: merged.reviewSampleDocument,
      labelDocument: merged.labelDocument,
      predictionDocument: merged.predictionDocument,
      finalized,
    })).toEqual(merged);

    const conflict = structuredClone(finalized);
    conflict.labels[0].verdict = 'WRONG';
    expect(() => mergeReviewCorpus({
      reviewSampleDocument: merged.reviewSampleDocument,
      labelDocument: merged.labelDocument,
      predictionDocument: merged.predictionDocument,
      finalized: conflict,
    })).toThrow('label conflicts');
  });
});
