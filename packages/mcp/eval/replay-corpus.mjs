import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync, readdirSync, statSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { questionPrompts } from './question-prompts.mjs';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function posixPath(value) {
  return value.split(sep).join('/');
}

function jsonFiles(root) {
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else if (entry.endsWith('.json')) files.push(path);
    }
  }
  visit(root);
  return files;
}

function parseJsonFile(path) {
  const raw = readFileSync(path);
  try {
    return { raw, value: JSON.parse(raw.toString('utf8')), error: null };
  } catch (error) {
    return { raw, value: null, error: error.message };
  }
}

function reportReferences(manifest) {
  const references = [];
  for (const repetition of manifest.repetitions ?? []) {
    if (!repetition.report?.json) continue;
    references.push({
      report: repetition.report.json,
      reportSha256: repetition.report.jsonSha256 ?? null,
      gitSha: manifest.gitSha ?? null,
      suiteVersion: manifest.suiteVersion ?? null,
      questionsSha256: manifest.hashes?.files?.['eval/questions.json'] ?? null,
      engine: repetition.engine ?? null,
      model: repetition.model ?? null,
    });
  }
  return references;
}

export function buildManifestIndex(parsedFiles, evalDir) {
  const index = new Map();
  for (const file of parsedFiles) {
    const manifest = file.value;
    if (!manifest || !Array.isArray(manifest.repetitions)) continue;
    for (const reference of reportReferences(manifest)) {
      const key = posixPath(reference.report).replace(/^.*?results\//, 'results/');
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(reference);
    }
  }
  return index;
}

function substitute(value, vars) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{(\w+)([+-]\d+)?\}\}/g, (_, name, delta) => {
    if (!(name in vars)) throw new Error(`missing template variable ${name}`);
    if (!delta) return String(vars[name]);
    const n = Number(vars[name]) + Number(delta);
    if (!Number.isFinite(n)) throw new Error(`non-numeric template variable ${name}`);
    return String(n);
  });
}

export function readQuestionSnapshot(repoRoot, provenance) {
  if (!provenance?.gitSha || !provenance.questionsSha256) {
    return { questions: null, error: 'missing manifest git SHA or questions hash' };
  }
  let raw;
  try {
    raw = execFileSync(
      'git',
      ['show', `${provenance.gitSha}:packages/mcp/eval/questions.json`],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    return { questions: null, error: `question snapshot unavailable: ${error.message}` };
  }
  const actualHash = sha256(raw);
  if (actualHash !== provenance.questionsSha256) {
    return {
      questions: null,
      error: `question snapshot hash mismatch: expected ${provenance.questionsSha256}, got ${actualHash}`,
    };
  }
  try {
    return { questions: JSON.parse(raw), error: null };
  } catch (error) {
    return { questions: null, error: `question snapshot invalid JSON: ${error.message}` };
  }
}

function frozenEvidenceStatus(question, result) {
  if ((question.groundTruth ?? []).length === 0) return 'not-required';
  const expectedFacts = question.groundTruth
    .flatMap((groundTruth) => groundTruth.facts ?? [])
    .filter((fact) => fact.answerMatch !== false)
    .map((fact) => fact.name);
  const facts = new Map(
    (result.factDetails ?? [])
      .filter((fact) => Object.hasOwn(fact, 'value'))
      .map((fact) => [fact.name, fact]),
  );
  if (expectedFacts.length > 0 && expectedFacts.every((name) => facts.has(name))) return 'fact-summary-only';
  return 'missing';
}

function sampleEligibility({ provenance, snapshotError, question, evidenceStatus }) {
  if (!provenance) return { status: 'UNSCORABLE', reason: 'no manifest links this report to a git/question snapshot' };
  if (snapshotError) return { status: 'UNSCORABLE', reason: snapshotError };
  if (!question) return { status: 'UNSCORABLE', reason: 'question ID absent from the frozen question snapshot' };
  if (evidenceStatus === 'missing') return { status: 'UNSCORABLE', reason: 'frozen ground-truth evidence is missing' };
  if (evidenceStatus === 'fact-summary-only') {
    return {
      status: 'REVIEW_REQUIRED',
      reason: 'only the old scorer fact summary survives; a human must decide whether it is sufficient',
    };
  }
  return { status: 'READY_FOR_SANITIZATION', reason: null };
}

function traceSnapshot(trace) {
  return (trace ?? []).map((call) => ({
    name: call.name ?? null,
    args: call.args ?? null,
    isError: call.isError === true,
  }));
}

/**
 * Inventory legacy result reports without trusting their old verdicts.
 *
 * Provider/model names are deliberately replaced by a hash. A labelling packet can
 * expose answer text, prompt, trace, and frozen evidence without exposing model
 * identity. Raw source paths and the provider map stay outside the tracked packet.
 */
export function inventoryCorpus({
  evalDir,
  resultsDir = join(evalDir, 'results'),
  repoRoot = resolve(evalDir, '../../..'),
  includeAnswers = false,
} = {}) {
  const parsedFiles = jsonFiles(resultsDir).map((path) => {
    const parsed = parseJsonFile(path);
    return {
      path,
      rel: posixPath(relative(evalDir, path)),
      ...parsed,
    };
  });
  const manifestIndex = buildManifestIndex(parsedFiles, evalDir);
  const snapshotCache = new Map();
  const samples = [];
  const exclusions = [];
  const providerMap = {};

  for (const file of parsedFiles) {
    if (file.error) {
      exclusions.push({ sourceSha256: sha256(file.raw), reason: `invalid JSON: ${file.error}` });
      continue;
    }
    const report = file.value;
    if (!Array.isArray(report?.results) || Number(report.tier) !== 2) continue;
    const references = manifestIndex.get(file.rel) ?? [];
    const provenance = references.length === 1 ? references[0] : null;
    let snapshot = { questions: null, error: provenance ? 'snapshot not read' : null };
    if (provenance) {
      const key = `${provenance.gitSha}:${provenance.questionsSha256}`;
      if (!snapshotCache.has(key)) snapshotCache.set(key, readQuestionSnapshot(repoRoot, provenance));
      snapshot = snapshotCache.get(key);
    }
    const resultSha256 = sha256(file.raw);
    if (provenance?.reportSha256 && provenance.reportSha256 !== resultSha256) {
      snapshot = { questions: null, error: 'result checksum does not match its manifest' };
    }

    for (let index = 0; index < report.results.length; index += 1) {
      const result = report.results[index];
      if (typeof result?.answer !== 'string' || result.answer.length === 0) {
        exclusions.push({
          sourceSha256: resultSha256,
          questionId: result?.id ?? null,
          reason: 'missing answer text',
        });
        continue;
      }
      const question = snapshot.questions?.questions?.find(({ id }) => id === result.id) ?? null;
      let prompt = null;
      let promptError = snapshot.error;
      if (question) {
        try {
          const configured = questionPrompts(question)
            .map((candidate) => substitute(candidate, report.vars ?? {}));
          prompt = result.prompt == null ? configured[0] : String(result.prompt);
          if (!configured.includes(prompt)) {
            throw new TypeError('result prompt is not a configured question variant');
          }
        } catch (error) {
          promptError = `prompt reconstruction failed: ${error.message}`;
        }
      }
      const evidenceStatus = question ? frozenEvidenceStatus(question, result) : 'missing';
      const eligibility = sampleEligibility({
        provenance,
        snapshotError: promptError,
        question,
        evidenceStatus,
      });
      const identitySeed = `${resultSha256}:${index}:${result.id}`;
      const sampleId = `sample-${sha256(identitySeed).slice(0, 12)}`;
      const providerKey = `${report.engine ?? provenance?.engine ?? 'unknown'}:${report.model ?? provenance?.model ?? 'unknown'}`;
      const providerKeyHash = sha256(providerKey);
      providerMap[sampleId] = providerKey;

      samples.push({
        sampleId,
        questionId: result.id,
        suiteVersion: provenance?.suiteVersion ?? null,
        prompt,
        promptSha256: prompt == null ? null : sha256(prompt),
        answerSha256: sha256(result.answer),
        answerLength: result.answer.length,
        ...(includeAnswers ? { answer: result.answer } : {}),
        providerKeyHash,
        trace: traceSnapshot(result.trace),
        frozenEvidence: {
          status: evidenceStatus,
          facts: evidenceStatus === 'missing'
            ? []
            : (result.factDetails ?? []).filter((fact) => Object.hasOwn(fact, 'value')).map((fact) => ({
              name: fact.name,
              value: fact.value,
              via: fact.via ?? null,
            })),
        },
        source: {
          resultSha256,
          questionIndex: index,
          gitSha: provenance?.gitSha ?? null,
          questionsSha256: provenance?.questionsSha256 ?? null,
        },
        eligibility,
        legacyVerdict: result.verdict ?? null,
      });
    }
  }

  samples.sort((a, b) => a.sampleId.localeCompare(b.sampleId));
  const byEligibility = {};
  for (const sample of samples) {
    byEligibility[sample.eligibility.status] = (byEligibility[sample.eligibility.status] ?? 0) + 1;
  }
  return {
    inventory: {
      schemaVersion: 1,
      generatedFrom: {
        resultFileCount: parsedFiles.length,
        resultTreeSha256: sha256(
          parsedFiles.map((file) => `${file.rel}\t${sha256(file.raw)}`).sort().join('\n'),
        ),
      },
      summary: {
        samples: samples.length,
        exclusions: exclusions.length,
        byEligibility,
      },
      samples,
      exclusions,
    },
    providerMap,
  };
}

export function replayLabels(samples, labels, scorer) {
  const labelById = new Map(labels.map((label) => [label.sampleId, label]));
  return samples.map((sample) => {
    const label = labelById.get(sample.sampleId) ?? null;
    return {
      sampleId: sample.sampleId,
      gold: label?.verdict ?? 'UNLABELLED',
      predicted: scorer(sample),
    };
  });
}

/** Compact, answer-free artifact suitable for source control. */
export function trackedInventory(inventory) {
  const byQuestion = {};
  const ineligibleReasons = {};
  const reviewCandidates = [];
  for (const sample of inventory.samples) {
    const question = byQuestion[sample.questionId] ?? {
      samples: 0,
      byEligibility: {},
    };
    question.samples += 1;
    question.byEligibility[sample.eligibility.status] =
      (question.byEligibility[sample.eligibility.status] ?? 0) + 1;
    byQuestion[sample.questionId] = question;
    if (sample.eligibility.reason) {
      ineligibleReasons[sample.eligibility.reason] =
        (ineligibleReasons[sample.eligibility.reason] ?? 0) + 1;
    }
    if (sample.eligibility.status !== 'UNSCORABLE') {
      reviewCandidates.push({
        sampleId: sample.sampleId,
        questionId: sample.questionId,
        suiteVersion: sample.suiteVersion,
        promptSha256: sample.promptSha256,
        answerSha256: sample.answerSha256,
        providerKeyHash: sample.providerKeyHash,
        frozenEvidenceStatus: sample.frozenEvidence.status,
        source: sample.source,
        eligibility: sample.eligibility,
      });
    }
  }
  for (const exclusion of inventory.exclusions) {
    ineligibleReasons[exclusion.reason] = (ineligibleReasons[exclusion.reason] ?? 0) + 1;
  }
  return {
    schemaVersion: inventory.schemaVersion,
    generatedFrom: inventory.generatedFrom,
    summary: inventory.summary,
    byQuestion,
    ineligibleReasons,
    reviewCandidates,
  };
}
