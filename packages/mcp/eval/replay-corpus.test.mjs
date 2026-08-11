import { describe, expect, it } from 'vitest';
import {
  buildManifestIndex, replayLabels, sha256, trackedInventory,
} from './replay-corpus.mjs';

describe('replay corpus provenance', () => {
  it('indexes only reports explicitly checksummed by manifests', () => {
    const parsed = [{
      value: {
        gitSha: 'a'.repeat(40),
        suiteVersion: 5,
        hashes: { files: { 'eval/questions.json': 'b'.repeat(64) } },
        repetitions: [{
          engine: 'anthropic',
          model: 'model-a',
          report: { json: 'results/run.json', jsonSha256: 'c'.repeat(64) },
        }],
      },
    }];
    const index = buildManifestIndex(parsed, '/repo/packages/mcp/eval');
    expect(index.get('results/run.json')).toEqual([{
      report: 'results/run.json',
      reportSha256: 'c'.repeat(64),
      gitSha: 'a'.repeat(40),
      suiteVersion: 5,
      questionsSha256: 'b'.repeat(64),
      engine: 'anthropic',
      model: 'model-a',
    }]);
  });

  it('hashes identities deterministically without using old verdicts as labels', () => {
    expect(sha256('same')).toBe(sha256('same'));
    const samples = [{ sampleId: 'sample-a' }, { sampleId: 'sample-b' }];
    const labels = [{ sampleId: 'sample-a', verdict: 'CORRECT' }];
    const replay = replayLabels(samples, labels, () => 'PENDING_HUMAN');
    expect(replay).toEqual([
      { sampleId: 'sample-a', gold: 'CORRECT', predicted: 'PENDING_HUMAN' },
      { sampleId: 'sample-b', gold: 'UNLABELLED', predicted: 'PENDING_HUMAN' },
    ]);
  });

  it('tracks aggregate exclusions and only the samples that may be reviewed', () => {
    const tracked = trackedInventory({
      schemaVersion: 1,
      generatedFrom: { resultFileCount: 2, resultTreeSha256: 'a'.repeat(64) },
      summary: { samples: 2, exclusions: 1 },
      exclusions: [{ reason: 'missing answer text' }],
      samples: [
        {
          sampleId: 'sample-a',
          questionId: 'q1',
          suiteVersion: null,
          promptSha256: null,
          answerSha256: 'b'.repeat(64),
          providerKeyHash: 'c'.repeat(64),
          frozenEvidence: { status: 'missing' },
          source: { resultSha256: 'd'.repeat(64) },
          eligibility: { status: 'UNSCORABLE', reason: 'missing provenance' },
        },
        {
          sampleId: 'sample-b',
          questionId: 'q1',
          suiteVersion: 3,
          promptSha256: 'e'.repeat(64),
          answerSha256: 'f'.repeat(64),
          providerKeyHash: '0'.repeat(64),
          frozenEvidence: { status: 'fact-summary-only' },
          source: { resultSha256: '1'.repeat(64) },
          eligibility: { status: 'REVIEW_REQUIRED', reason: 'fact summary only' },
        },
      ],
    });
    expect(tracked.byQuestion.q1).toEqual({
      samples: 2,
      byEligibility: { UNSCORABLE: 1, REVIEW_REQUIRED: 1 },
    });
    expect(tracked.reviewCandidates.map(({ sampleId }) => sampleId)).toEqual(['sample-b']);
    expect(tracked.ineligibleReasons).toEqual({
      'missing provenance': 1,
      'fact summary only': 1,
      'missing answer text': 1,
    });
    expect(JSON.stringify(tracked)).not.toContain('"answer"');
  });
});
