#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  finalizeHumanReview, mergeReviewCorpus, serializeJson,
} from './review-workflow.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
let packetPath = null;
let decisionsPath = null;
let write = false;

for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if (flag === '--write') {
    if (write) {
      process.stderr.write('duplicate flag: --write\n');
      process.exit(2);
    }
    write = true;
    continue;
  }
  if (!['--packet', '--decisions'].includes(flag)) {
    process.stderr.write(`unknown argument: ${flag}\n`);
    process.exit(2);
  }
  const value = args[index + 1];
  if (value == null || value.startsWith('--')) {
    process.stderr.write(`${flag} requires a value\n`);
    process.exit(2);
  }
  if (flag === '--packet') packetPath = resolve(process.cwd(), value);
  else decisionsPath = resolve(process.cwd(), value);
  index += 1;
}

if (!packetPath || !decisionsPath) {
  process.stderr.write('--packet and --decisions are required\n');
  process.exit(2);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

try {
  const finalized = finalizeHumanReview(readJson(packetPath), readJson(decisionsPath));
  const paths = {
    samples: resolve(here, 'corpus/review-samples.json'),
    labels: resolve(here, 'corpus/labels.json'),
    predictions: resolve(here, 'corpus/predictions.json'),
  };
  const merged = mergeReviewCorpus({
    reviewSampleDocument: readJson(paths.samples),
    labelDocument: readJson(paths.labels),
    predictionDocument: readJson(paths.predictions),
    finalized,
  });
  if (write) {
    writeFileSync(paths.samples, serializeJson(merged.reviewSampleDocument));
    writeFileSync(paths.labels, serializeJson(merged.labelDocument));
    writeFileSync(paths.predictions, serializeJson(merged.predictionDocument));
    process.stdout.write(`recorded ${finalized.labels.length} confirmed human labels\n`);
  } else {
    process.stdout.write(`${JSON.stringify({
      valid: true,
      write: false,
      labelsToRecord: finalized.labels.length,
      sampleIds: finalized.labels.map((label) => label.sampleId),
    }, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`cannot finalize review: ${error.message}\n`);
  process.exitCode = 2;
}
