import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sanitizeOutput,
  sanitizeArgs,
  formatResult,
  formatGuardError,
  requireSigner,
  DEDUP_CACHE_MAX,
  type CliResult,
} from './cli-runner.js';

describe('sanitizeOutput', () => {
  it('redacts 64-char hex private keys', () => {
    const pk = '0x' + 'a'.repeat(64);
    expect(sanitizeOutput(`key: ${pk}`)).toBe('key: 0x[REDACTED]');
  });

  it('redacts multiple keys in one string', () => {
    const pk1 = '0x' + '1'.repeat(64);
    const pk2 = '0x' + '2'.repeat(64);
    expect(sanitizeOutput(`${pk1} and ${pk2}`)).toBe('0x[REDACTED] and 0x[REDACTED]');
  });

  it('preserves shorter hex strings', () => {
    const shortHex = '0x' + 'a'.repeat(40); // address-length
    expect(sanitizeOutput(`addr: ${shortHex}`)).toBe(`addr: ${shortHex}`);
  });

  it('preserves longer hex strings (only redacts exactly 64 chars)', () => {
    const longHex = '0x' + 'a'.repeat(65);
    // The regex matches 0x + 64 hex chars, so the first 66 chars get redacted
    // and the trailing 'a' remains
    expect(sanitizeOutput(longHex)).toBe('0x[REDACTED]a');
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

  it('is case-insensitive for hex characters', () => {
    const pkUpper = '0x' + 'A'.repeat(64);
    const pkMixed = '0x' + 'aAbBcCdDeEfF'.repeat(5) + 'aAbB';
    expect(sanitizeOutput(pkUpper)).toBe('0x[REDACTED]');
    expect(sanitizeOutput(pkMixed)).toBe('0x[REDACTED]');
  });
});

describe('sanitizeArgs', () => {
  it('redacts keys in each array element', () => {
    const pk = '0x' + 'f'.repeat(64);
    const args = ['command', pk, '--flag'];
    const result = sanitizeArgs(args);
    expect(result[0]).toBe('command');
    expect(result[1]).toBe('0x[REDACTED]');
    expect(result[2]).toBe('--flag');
  });

  it('handles empty array', () => {
    expect(sanitizeArgs([])).toEqual([]);
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

  it('redacts private keys in error messages', () => {
    const pk = '0x' + 'a'.repeat(64);
    const result: CliResult = { success: false, data: null, error: `Failed with key ${pk}` };
    const formatted = formatResult(result);
    expect(formatted.content[0].text).toContain('0x[REDACTED]');
    expect(formatted.content[0].text).not.toContain(pk);
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
