import { execFile } from 'node:child_process';
import {
  mkdtempSync, readFileSync, readdirSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256 } from './review-workflow.mjs';

const evalDir = new URL('./', import.meta.url).pathname;
const makeReview = new URL('./make-review-page.mjs', import.meta.url).pathname;
const finalizeReview = new URL('./finalize-review.mjs', import.meta.url).pathname;

function exec(script, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [script, ...args], {
      cwd: evalDir,
      encoding: 'utf8',
      timeout: 10_000,
    }, (error, stdout, stderr) => resolve({
      status: error == null ? 0 : Number(error.code),
      stdout,
      stderr,
    }));
  });
}

describe('review workflow CLI', () => {
  it('creates an anonymous page and validates completed decisions without writing corpus files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-eval-review-'));
    const outputDir = join(dir, 'reviews');
    const questionsText = readFileSync(join(evalDir, 'questions.json'), 'utf8');
    const contractsText = readFileSync(join(evalDir, 'question-contracts.json'), 'utf8');
    const questionPromptsText = readFileSync(join(evalDir, 'question-prompts.mjs'), 'utf8');
    const scoringText = readFileSync(join(evalDir, 'scoring.mjs'), 'utf8');
    const reviewWorkflowText = readFileSync(join(evalDir, 'review-workflow.mjs'), 'utf8');
    const outputGuardText = readFileSync(join(evalDir, '../deploy/openclaw/plugins/suzaku-output-guard/transform.mjs'), 'utf8');
    const spec = JSON.parse(questionsText);
    const report = {
      schemaVersion: 2,
      runId: 'test-run',
      tier: 2,
      suiteVersion: spec.suiteVersion,
      suiteStatus: spec.suiteStatus,
      gitSha: 'a'.repeat(40),
      trackedDirty: false,
      hashes: {
        questions: sha256(questionsText),
        questionContracts: sha256(contractsText),
        questionPrompts: sha256(questionPromptsText),
        scoring: sha256(scoringText),
        reviewWorkflow: sha256(reviewWorkflowText),
        outputGuard: sha256(outputGuardText),
      },
      engine: 'anthropic',
      model: 'must-not-appear',
      repeat: 1,
      epochAtRun: 52,
      aborted: false,
      invalidReason: null,
      driftWarning: null,
      vars: { ...spec.deployment, currentEpoch: 52 },
      usage: { input_tokens: 100, output_tokens: 20 },
      results: [{
        id: 'operators',
        answer: 'There is one registered operator.',
        verdict: 'PENDING_HUMAN',
        gateVerdict: 'PASS',
        usage: { input_tokens: 100, output_tokens: 20 },
        trace: [{
          name: 'middleware_get_all_operators',
          args: { middlewareAddress: spec.deployment.middleware, network: 'mainnet' },
          isError: false,
        }],
        traceScore: { ok: true, informational: false },
        format: { ok: true },
        policy: { ok: true },
        groundTruthEvidence: [{
          tool: 'middleware_get_all_operators',
          args: { middlewareAddress: spec.deployment.middleware, network: 'mainnet' },
          ok: true,
          parsed: true,
          facts: [{
            name: 'operatorCount', value: 1, via: 'path', sane: true,
          }],
        }],
      }],
    };
    const input = join(dir, 'source.json');
    writeFileSync(input, `${JSON.stringify(report, null, 2)}\n`);

    const created = await exec(makeReview, [
      '--', '--input', input, '--output-dir', outputDir,
    ]);
    expect(created).toMatchObject({ status: 0, stderr: '' });
    const names = readdirSync(outputDir);
    const packetName = names.find((name) => /^review-.+\.json$/.test(name)
      && !name.endsWith('-decisions.json'));
    const decisionsName = names.find((name) => name.endsWith('-decisions.json'));
    const pageName = names.find((name) => name.endsWith('.md'));
    expect(packetName).toBeDefined();
    expect(decisionsName).toBeDefined();
    expect(pageName).toBeDefined();
    const page = readFileSync(join(outputDir, pageName), 'utf8');
    expect(page).toContain('There is one registered operator.');
    expect(page).not.toContain('must-not-appear');
    expect(page).not.toContain('anthropic');
    expect(page).not.toContain('PENDING_HUMAN');

    const decisionsPath = join(outputDir, decisionsName);
    const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8'));
    decisions.reviewer = 'human@example';
    decisions.sanitizationConfirmed = true;
    decisions.decisions = decisions.decisions.map((decision) => ({
      ...decision,
      criteria: decision.criteria.map((criterion) => ({ ...criterion, status: 'MET' })),
      verdict: 'CORRECT',
      critical: false,
      reason: 'Matches the frozen operator evidence.',
    }));
    writeFileSync(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`);
    const finalized = await exec(finalizeReview, [
      '--',
      '--packet', join(outputDir, packetName),
      '--decisions', decisionsPath,
    ]);
    expect(finalized.status).toBe(0);
    expect(finalized.stderr).toBe('');
    expect(finalized.stdout, `finalize-review produced no JSON: ${JSON.stringify(finalized)}`).not.toBe('');
    expect(JSON.parse(finalized.stdout)).toMatchObject({
      valid: true,
      write: false,
      labelsToRecord: 1,
    });
  });
});
