import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RAW_KEY = `0x${'1'.repeat(64)}`;
const originalArgv = [...process.argv];
const originalNetwork = process.env.NETWORK;
const originalHome = process.env.HOME;
const originalPath = process.env.PATH;
let tempHome: string;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'suzaku-signer-policy-'));
  mkdirSync(join(tempHome, '.suzaku-cli', '.password-store'), { recursive: true });
  const binDir = join(tempHome, 'bin');
  mkdirSync(binDir);
  const fakePass = join(binDir, 'pass');
  writeFileSync(fakePass, `#!/bin/sh\nif [ "$1" = "version" ]; then echo 1.7.4; else echo '${RAW_KEY}'; fi\n`);
  chmodSync(fakePass, 0o700);
  process.env.HOME = tempHome;
  process.env.PATH = `${binDir}:${originalPath ?? ''}`;
  vi.resetModules();
});

afterEach(() => {
  process.argv = [...originalArgv];
  if (originalNetwork === undefined) delete process.env.NETWORK;
  else process.env.NETWORK = originalNetwork;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  vi.restoreAllMocks();
  rmSync(tempHome, { recursive: true, force: true });
});

async function loadParser() {
  const parser = await import('../../../dist/lib/cliParser.js');
  const { passPath } = await import('../../../dist/keyStore.js');
  mkdirSync(passPath, { recursive: true });
  return parser;
}

describe('restored root signer policy', () => {
  it('rejects a raw key when mainnet is explicit on argv', async () => {
    process.argv = [...originalArgv, '--network', 'mainnet'];
    const { ParserPrivateKey } = await loadParser();
    expect(() => ParserPrivateKey(RAW_KEY)).toThrow('Using private key on mainnet is not allowed');
  });

  it('rejects a raw key when mainnet is selected by the environment', async () => {
    process.argv = [...originalArgv];
    process.env.NETWORK = 'mainnet';
    const { ParserPrivateKey } = await loadParser();
    expect(() => ParserPrivateKey(RAW_KEY)).toThrow('Using private key on mainnet is not allowed');
  });

  it('accepts the same raw key on an explicit testnet', async () => {
    process.argv = [...originalArgv, '--network', 'fuji'];
    delete process.env.NETWORK;
    const { ParserPrivateKey } = await loadParser();
    expect(ParserPrivateKey(RAW_KEY)).toBe(RAW_KEY);
  });

  it('preserves Ledger and keystore parsing paths', async () => {
    const { ParserPrivateKey } = await loadParser();
    expect(ParserPrivateKey('ledger')).toBe('ledger');
    expect(ParserPrivateKey('operator-key')).toBe(RAW_KEY);
  });
});
