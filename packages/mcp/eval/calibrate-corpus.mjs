#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCalibrationReport } from './calibration.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const paths = {
  labels: resolve(here, 'corpus/labels.json'),
  predictions: resolve(here, 'corpus/predictions.json'),
  inventory: resolve(here, 'corpus/inventory.json'),
  reviewSamples: resolve(here, 'corpus/review-samples.json'),
};

for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if (!['--labels', '--predictions', '--inventory', '--review-samples'].includes(flag)) {
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
  const key = flag === '--review-samples' ? 'reviewSamples' : flag.slice(2);
  paths[key] = resolve(process.cwd(), value);
  index += 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

try {
  const inventory = readJson(paths.inventory);
  const reviewSamples = readJson(paths.reviewSamples);
  if (reviewSamples?.schemaVersion !== 1 || !Array.isArray(reviewSamples.samples)) {
    throw new TypeError('review samples must use schemaVersion 1 and contain a samples array');
  }
  const report = buildCalibrationReport({
    inventory: {
      ...inventory,
      reviewCandidates: [
        ...(inventory.reviewCandidates ?? []),
        ...reviewSamples.samples,
      ],
    },
    labelDocument: readJson(paths.labels),
    predictionDocument: readJson(paths.predictions),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  process.stderr.write(`calibration input error: ${error.message}\n`);
  process.exitCode = 2;
}
