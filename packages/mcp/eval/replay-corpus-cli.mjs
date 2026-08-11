#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryCorpus, trackedInventory } from './replay-corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const allowed = new Set(['--include-answers', '--write']);
for (const arg of args) {
  if (!allowed.has(arg)) {
    process.stderr.write(`unknown argument: ${arg}\n`);
    process.exitCode = 2;
    process.exit();
  }
}

const includeAnswers = args.includes('--include-answers');
const write = args.includes('--write');
if (includeAnswers && write) {
  process.stderr.write('--include-answers cannot be combined with --write; tracked inventory never contains raw answers\n');
  process.exitCode = 2;
  process.exit();
}

const { inventory, providerMap } = inventoryCorpus({
  evalDir: here,
  repoRoot: resolve(here, '../../..'),
  includeAnswers,
});

if (write) {
  const target = resolve(here, 'corpus/inventory.json');
  writeFileSync(target, `${JSON.stringify(trackedInventory(inventory), null, 2)}\n`);
  process.stdout.write(`${target}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ inventory, providerMap }, null, 2)}\n`);
}
