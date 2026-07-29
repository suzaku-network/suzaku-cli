#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCalibrationReport } from './calibration.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const paths = {
  labels: resolve(here, 'corpus/labels.json'),
  predictions: resolve(here, 'corpus/predictions.json'),
  inventory: resolve(here, 'corpus/inventory.json'),
};

for (let index = 0; index < args.length; index += 1) {
  const flag = args[index];
  if (!['--labels', '--predictions', '--inventory'].includes(flag)) {
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
  paths[flag.slice(2)] = resolve(process.cwd(), value);
  index += 1;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

try {
  const report = buildCalibrationReport({
    inventory: readJson(paths.inventory),
    labelDocument: readJson(paths.labels),
    predictionDocument: readJson(paths.predictions),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== 'PASS') process.exitCode = 1;
} catch (error) {
  process.stderr.write(`calibration input error: ${error.message}\n`);
  process.exitCode = 2;
}
