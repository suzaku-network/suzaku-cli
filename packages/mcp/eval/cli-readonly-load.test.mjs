import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

describe('read-only CLI startup', () => {
  it('does not load the native Ledger USB stack for ordinary commands', () => {
    expect(() => execFileSync(process.execPath, [resolve(root, 'bin/cli.js'), '--help'], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })).not.toThrow();
  });

  it('constructs a public read client without loading the Ledger stack', () => {
    const clientModule = pathToFileURL(resolve(root, 'dist/client.js')).href;
    const script = `
      const { generateClient } = await import(${JSON.stringify(clientModule)});
      const client = await generateClient('mainnet');
      if (!client || typeof client.getBlockNumber !== 'function') process.exit(2);
    `;
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })).not.toThrow();
  });
});
