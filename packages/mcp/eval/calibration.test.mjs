import { describe, expect, it } from 'vitest';
import { buildCalibrationReport } from './calibration.mjs';

const sample = {
  sampleId: 'sample-a',
  eligibility: { status: 'READY_FOR_SANITIZATION' },
};
const inventory = { reviewCandidates: [sample] };
const label = {
  sampleId: 'sample-a',
  verdict: 'WRONG',
  critical: true,
  criteriaMet: [],
  criteriaMissed: ['answer contradicts frozen ground truth'],
  reason: 'The answer reverses the verified state.',
  labeler: 'human-reviewer',
  adjudication: 'CONFIRMED',
};
const evaluatorSha256 = 'a'.repeat(64);

describe('offline calibration report', () => {
  it('blocks instead of inventing evidence when labels and predictions are absent', () => {
    const report = buildCalibrationReport({
      inventory,
      labelDocument: { schemaVersion: 1, labels: [] },
      predictionDocument: { schemaVersion: 1, systems: [] },
    });
    expect(report).toMatchObject({
      status: 'BLOCKED',
      labelledSamples: 0,
      blockers: [
        'no human-confirmed gold labels',
        'no versioned scorer/judge predictions',
      ],
    });
  });

  it('reports a critical false pass and fails the scorer gate', () => {
    const report = buildCalibrationReport({
      inventory,
      labelDocument: { schemaVersion: 1, labels: [label] },
      predictionDocument: {
        schemaVersion: 1,
        systems: [{
          id: 'unsafe-scorer',
          evaluatorSha256,
          predictions: [{ sampleId: 'sample-a', verdict: 'PASS' }],
        }],
      },
    });
    expect(report.status).toBe('FAIL');
    expect(report.systems[0]).toMatchObject({
      gate: 'FAIL',
      falsePasses: 1,
      falsePassRate: 1,
      criticalFalsePasses: 1,
      correctHardFails: 0,
      automationCoverage: 1,
      pendingHumanCoverage: 0,
    });
    expect(report.systems[0].confusionMatrix.WRONG.PASS).toBe(1);
  });

  it('allows conservative pending-human predictions without claiming automation', () => {
    const report = buildCalibrationReport({
      inventory,
      labelDocument: { schemaVersion: 1, labels: [label] },
      predictionDocument: {
        schemaVersion: 1,
        systems: [{
          id: 'conservative-scorer',
          evaluatorSha256,
          predictions: [{ sampleId: 'sample-a', verdict: 'PENDING_HUMAN' }],
        }],
      },
    });
    expect(report.status).toBe('PASS');
    expect(report.systems[0]).toMatchObject({
      gate: 'PASS',
      criticalFalsePasses: 0,
      automationCoverage: 0,
      pendingHumanCoverage: 1,
      exactAgreement: 0,
    });
  });

  it('requires evidence review before using a fact-summary-only sample', () => {
    expect(() => buildCalibrationReport({
      inventory: {
        reviewCandidates: [{
          ...sample,
          eligibility: { status: 'REVIEW_REQUIRED' },
        }],
      },
      labelDocument: { schemaVersion: 1, labels: [label] },
      predictionDocument: { schemaVersion: 1, systems: [] },
    })).toThrow('evidenceReview must be SUFFICIENT');
  });

  it('lists every verdict change across compared systems', () => {
    const report = buildCalibrationReport({
      inventory,
      labelDocument: { schemaVersion: 1, labels: [label] },
      predictionDocument: {
        schemaVersion: 1,
        systems: [
          {
            id: 'baseline',
            evaluatorSha256,
            predictions: [{ sampleId: 'sample-a', verdict: 'PASS' }],
          },
          {
            id: 'candidate',
            evaluatorSha256: 'b'.repeat(64),
            predictions: [{ sampleId: 'sample-a', verdict: 'PENDING_HUMAN' }],
          },
        ],
      },
    });
    expect(report.changedVerdicts).toEqual([{
      sampleId: 'sample-a',
      gold: 'WRONG',
      critical: true,
      predictions: {
        baseline: 'PASS',
        candidate: 'PENDING_HUMAN',
      },
    }]);
  });
});
