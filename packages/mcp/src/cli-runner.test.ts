import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sanitizeOutput,
  sanitizeArgs,
  redactRpcUrl,
  formatResult,
  formatGuardError,
  requireSigner,
  runCli,
  getActiveSubprocesses,
  resetActiveSubprocesses,
  resetRateLimiter,
  DEDUP_CACHE_MAX,
  type CliResult,
} from './cli-runner.js';

describe('redactRpcUrl', () => {
  it('strips API-key-bearing path segments', () => {
    expect(redactRpcUrl('https://avax-mainnet.g.alchemy.com/v2/SECRETKEY123')).toBe('https://avax-mainnet.g.alchemy.com/[REDACTED]');
  });

  it('strips query strings and userinfo', () => {
    expect(redactRpcUrl('https://rpc.example.com/path?apikey=abc')).toBe('https://rpc.example.com/[REDACTED]');
    expect(redactRpcUrl('https://user:pass@rpc.example.com')).toBe('https://rpc.example.com/[REDACTED]');
  });

  it('keeps a bare host:port with no secret material untouched', () => {
    expect(redactRpcUrl('https://api.avax.network')).toBe('https://api.avax.network');
    expect(redactRpcUrl('https://rpc.example.com:8545')).toBe('https://rpc.example.com:8545');
  });

  it('passes through undefined and redacts unparseable input', () => {
    expect(redactRpcUrl(undefined)).toBeUndefined();
    expect(redactRpcUrl('not a url')).toBe('[REDACTED]');
  });
});

describe('sanitizeOutput', () => {
  it('redacts the configured SUZAKU_PK with and without 0x prefix', () => {
    const bare = 'a'.repeat(64);
    process.env.SUZAKU_PK = '0x' + bare;
    try {
      expect(sanitizeOutput(`key: 0x${bare}`)).toBe('key: 0x[REDACTED]');
      expect(sanitizeOutput(`key: ${bare}`)).toBe('key: [REDACTED]');
    } finally {
      delete process.env.SUZAKU_PK;
    }
  });

  it('redacts the configured SUZAKU_PCHAIN_PK', () => {
    const bare = 'b'.repeat(64);
    process.env.SUZAKU_PCHAIN_PK = bare;
    try {
      expect(sanitizeOutput(`pchain: 0x${bare}`)).toBe('pchain: 0x[REDACTED]');
    } finally {
      delete process.env.SUZAKU_PCHAIN_PK;
    }
  });

  it('preserves 0x-prefixed 64-char hex (tx hashes, role hashes, validation IDs)', () => {
    const txHash = '0x' + '1'.repeat(64);
    expect(sanitizeOutput(`tx: ${txHash}`)).toBe(`tx: ${txHash}`);
  });

  it('preserves shorter hex strings', () => {
    const shortHex = '0x' + 'a'.repeat(40); // address-length
    expect(sanitizeOutput(`addr: ${shortHex}`)).toBe(`addr: ${shortHex}`);
  });

  it('redacts bare 64-char hex without 0x prefix', () => {
    const bare = 'a'.repeat(64);
    expect(sanitizeOutput(`key: ${bare}`)).toBe('key: [REDACTED]');
  });

  it('redacts bare hex case-insensitive', () => {
    const bare = 'A'.repeat(64);
    expect(sanitizeOutput(bare)).toBe('[REDACTED]');
  });

  it('preserves non-hex strings', () => {
    expect(sanitizeOutput('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(sanitizeOutput('')).toBe('');
  });
});

describe('sanitizeArgs', () => {
  it('preserves 0x-prefixed hashes but redacts bare 64-char hex in elements', () => {
    const txHash = '0x' + 'f'.repeat(64);
    const bare = 'e'.repeat(64);
    const args = ['command', txHash, bare, '--flag'];
    const result = sanitizeArgs(args);
    expect(result[0]).toBe('command');
    expect(result[1]).toBe(txHash);
    expect(result[2]).toBe('[REDACTED]');
    expect(result[3]).toBe('--flag');
  });

  it('handles empty array', () => {
    expect(sanitizeArgs([])).toEqual([]);
  });

  it('redacts value following --snowscan-api-key by flag name', () => {
    const args = ['middleware', 'node-logs', '0xabc', '--snowscan-api-key', 'REAL_API_KEY_123'];
    const result = sanitizeArgs(args);
    expect(result).toEqual(['middleware', 'node-logs', '0xabc', '--snowscan-api-key', '[REDACTED]']);
  });

  it('redacts value following --private-key by flag name', () => {
    const args = ['--private-key', 'deadbeef1234'];
    const result = sanitizeArgs(args);
    expect(result).toEqual(['--private-key', '[REDACTED]']);
  });

  it('redacts value following -k by flag name', () => {
    const args = ['-k', 'somekey'];
    const result = sanitizeArgs(args);
    expect(result).toEqual(['-k', '[REDACTED]']);
  });

  it('does not redact flag without following value', () => {
    const args = ['--snowscan-api-key'];
    const result = sanitizeArgs(args);
    expect(result).toEqual(['--snowscan-api-key']);
  });
});

describe('formatResult', () => {
  it('formats error result with isError flag', () => {
    const result: CliResult = { success: false, data: null, error: 'something failed' };
    const formatted = formatResult(result);
    expect(formatted.isError).toBe(true);
    expect(formatted.content[0].text).toContain('something failed');
  });

  it('formats success with object data includes structuredContent', () => {
    const result: CliResult = { success: true, data: { epoch: 5, operators: [] } };
    const formatted = formatResult(result);
    expect(formatted.isError).toBeUndefined();
    expect(formatted.content[0].text).toContain('"epoch": 5');
    expect((formatted as { structuredContent?: unknown }).structuredContent).toEqual({ epoch: 5, operators: [] });
  });

  it('formats success with non-object data without structuredContent', () => {
    const result: CliResult = { success: true, data: 'just a string' };
    const formatted = formatResult(result);
    expect(formatted.isError).toBeUndefined();
    expect(formatted.content[0].text).toBe('"just a string"');
    expect((formatted as { structuredContent?: unknown }).structuredContent).toBeUndefined();
  });

  it('formats success with null data', () => {
    const result: CliResult = { success: true, data: null };
    const formatted = formatResult(result);
    expect(formatted.content[0].text).toBe('null');
  });

  it('formats success with array data without structuredContent', () => {
    const result: CliResult = { success: true, data: [1, 2, 3] };
    const formatted = formatResult(result);
    expect((formatted as { structuredContent?: unknown }).structuredContent).toBeUndefined();
  });

  it('redacts the configured private key in error messages', () => {
    const pk = '0x' + 'a'.repeat(64);
    process.env.SUZAKU_PK = pk;
    try {
      const result: CliResult = { success: false, data: null, error: `Failed with key ${pk}` };
      const formatted = formatResult(result);
      expect(formatted.content[0].text).toContain('0x[REDACTED]');
      expect(formatted.content[0].text).not.toContain(pk);
    } finally {
      delete process.env.SUZAKU_PK;
    }
  });
});

describe('formatGuardError', () => {
  it('wraps error string in MCP error response', () => {
    const result = formatGuardError('Tool blocked by deny list');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: Tool blocked by deny list');
  });
});

describe('requireSigner', () => {
  beforeEach(() => {
    delete process.env.SUZAKU_PK;
    delete process.env.SUZAKU_SECRET_NAME;
    delete process.env.SUZAKU_MCP_LEDGER;
  });

  afterEach(() => {
    delete process.env.SUZAKU_PK;
    delete process.env.SUZAKU_SECRET_NAME;
    delete process.env.SUZAKU_MCP_LEDGER;
  });

  it('returns error when no signing method is set', () => {
    const result = requireSigner();
    expect(result).not.toBeNull();
    expect(result!.isError).toBe(true);
    expect(result!.content[0].text).toContain('No signing method configured');
  });

  it('returns null when SUZAKU_PK is set', () => {
    process.env.SUZAKU_PK = '0x' + 'a'.repeat(64);
    expect(requireSigner()).toBeNull();
  });

  it('returns null when SUZAKU_SECRET_NAME is set', () => {
    process.env.SUZAKU_SECRET_NAME = 'my-key';
    expect(requireSigner()).toBeNull();
  });

  it('returns null when SUZAKU_MCP_LEDGER is true', () => {
    process.env.SUZAKU_MCP_LEDGER = 'true';
    expect(requireSigner()).toBeNull();
  });

  it('returns error when SUZAKU_MCP_LEDGER is set but not true', () => {
    process.env.SUZAKU_MCP_LEDGER = 'false';
    expect(requireSigner()).not.toBeNull();
  });

  it('returns error when SUZAKU_PK is whitespace only', () => {
    process.env.SUZAKU_PK = '   ';
    expect(requireSigner()).not.toBeNull();
    expect(requireSigner()!.isError).toBe(true);
  });

  it('returns error when SUZAKU_SECRET_NAME is whitespace only', () => {
    process.env.SUZAKU_SECRET_NAME = ' ';
    expect(requireSigner()).not.toBeNull();
  });
});

describe('DEDUP_CACHE_MAX', () => {
  it('is set to 500', () => {
    expect(DEDUP_CACHE_MAX).toBe(500);
  });
});

describe('concurrency limiter', () => {
  beforeEach(() => {
    resetActiveSubprocesses();
  });

  it('starts with 0 active subprocesses', () => {
    expect(getActiveSubprocesses()).toBe(0);
  });

  it('resetActiveSubprocesses resets to 0', () => {
    // We can only test the exported helper directly
    resetActiveSubprocesses();
    expect(getActiveSubprocesses()).toBe(0);
  });
});

describe('rate limiter', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it('resetRateLimiter clears the window', () => {
    // Verify reset doesn't throw and state is clean
    resetRateLimiter();
  });
});

describe('bypassSuggest', () => {
  beforeEach(() => {
    resetActiveSubprocesses();
    resetRateLimiter();
    delete process.env.SUZAKU_MCP_SUGGEST;
    delete process.env.SUZAKU_SAFE_ADDRESS;
  });

  afterEach(() => {
    delete process.env.SUZAKU_SAFE_ADDRESS;
  });

  it('mainnet writes return suggest mode by default', async () => {
    const result = await runCli(['nonexistent-command'], { privateKey: true, network: 'mainnet' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)._suggest_mode).toBe(true);
  });

  it('suggested command includes --safe when SUZAKU_SAFE_ADDRESS is set', async () => {
    process.env.SUZAKU_SAFE_ADDRESS = '0x' + '1'.repeat(40);
    const result = await runCli(['nonexistent-command'], { privateKey: true, network: 'mainnet' });
    expect((result.data as Record<string, unknown>).command).toContain(`--safe 0x${'1'.repeat(40)}`);
  });

  it('bypassSuggest skips the suggest matrix and reaches execution', async () => {
    // The unknown command makes the spawned CLI fail fast — getting a non-suggest
    // failure proves the matrix was bypassed and the subprocess actually ran.
    const result = await runCli(['nonexistent-command'], { privateKey: true, network: 'mainnet', bypassSuggest: true, timeout: 30_000 });
    expect(result.success).toBe(false);
    expect((result.data as Record<string, unknown> | null)?._suggest_mode).toBeUndefined();
  }, 35_000);
});
