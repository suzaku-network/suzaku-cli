#!/usr/bin/env node
import {
  mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDecisionTemplate, buildReviewPacket, renderReviewMarkdown,
  serializeJson, sha256,
} from './review-workflow.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
let input = null;
let outputDir = resolve(here, 'results/reviews');

for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if (!['--input', '--output-dir'].includes(flag)) {
    process.stderr.write(`unknown argument: ${flag}\n`);
    process.exitCode = 2;
    process.exit();
  }
  const value = args[index + 1];
  if (value == null || value.startsWith('--')) {
    process.stderr.write(`${flag} requires a value\n`);
    process.exitCode = 2;
    process.exit();
  }
  if (flag === '--input') input = resolve(process.cwd(), value);
  else outputDir = resolve(process.cwd(), value);
  index += 1;
}

if (!input) {
  process.stderr.write('--input is required\n');
  process.exit(2);
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

try {
  const reportText = readText(input);
  const questionsText = readText(resolve(here, 'questions.json'));
  const contractsText = readText(resolve(here, 'question-contracts.json'));
  const scoringText = readText(resolve(here, 'scoring.mjs'));
  const reviewWorkflowText = readText(resolve(here, 'review-workflow.mjs'));
  const outputGuardText = readText(resolve(here, '../deploy/openclaw/plugins/suzaku-output-guard/transform.mjs'));
  const packet = buildReviewPacket({
    report: JSON.parse(reportText),
    reportText,
    questionSpec: JSON.parse(questionsText),
    contractSpec: JSON.parse(contractsText),
    expectedHashes: {
      questions: sha256(questionsText),
      questionContracts: sha256(contractsText),
      scoring: sha256(scoringText),
      reviewWorkflow: sha256(reviewWorkflowText),
      outputGuard: sha256(outputGuardText),
    },
  });
  const decisions = buildDecisionTemplate(packet);
  mkdirSync(outputDir, { recursive: true });
  const packetPath = resolve(outputDir, `${packet.packetId}.json`);
  const decisionsPath = resolve(outputDir, `${packet.packetId}-decisions.json`);
  const pagePath = resolve(outputDir, `${packet.packetId}.md`);
  writeFileSync(packetPath, serializeJson(packet));
  writeFileSync(decisionsPath, serializeJson(decisions));
  writeFileSync(pagePath, renderReviewMarkdown(packet));
  process.stdout.write([
    `review page: ${pagePath}`,
    `decisions: ${decisionsPath}`,
    `packet: ${packetPath}`,
    '',
  ].join('\n'));
} catch (error) {
  process.stderr.write(`cannot create review page: ${error.message}\n`);
  process.exitCode = 2;
}
