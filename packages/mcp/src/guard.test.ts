import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkToolAccess, checkValueLimit, guardWriteOperation } from './guard.js';

describe('checkToolAccess', () => {
  beforeEach(() => {
    delete process.env.SUZAKU_MCP_ALLOW_TOOLS;
    delete process.env.SUZAKU_MCP_DENY_TOOLS;
  });

  afterEach(() => {
    delete process.env.SUZAKU_MCP_ALLOW_TOOLS;
    delete process.env.SUZAKU_MCP_DENY_TOOLS;
  });

  it('allows any tool when no lists are configured', () => {
    expect(checkToolAccess('vault_deposit')).toBeNull();
    expect(checkToolAccess('middleware_register_operator')).toBeNull();
  });

  it('blocks tools on the deny list', () => {
    process.env.SUZAKU_MCP_DENY_TOOLS = 'vault_deposit,vault_withdraw';
    expect(checkToolAccess('vault_deposit')).toContain('blocked');
    expect(checkToolAccess('vault_withdraw')).toContain('blocked');
    expect(checkToolAccess('vault_claim')).toBeNull();
  });

  it('blocks tools not on the allow list', () => {
    process.env.SUZAKU_MCP_ALLOW_TOOLS = 'vault_get_balance,vault_deposit';
    expect(checkToolAccess('vault_get_balance')).toBeNull();
    expect(checkToolAccess('vault_deposit')).toBeNull();
    expect(checkToolAccess('middleware_register_operator')).toContain('not in');
  });

  it('deny list takes precedence over allow list', () => {
    process.env.SUZAKU_MCP_ALLOW_TOOLS = 'vault_deposit,vault_withdraw';
    process.env.SUZAKU_MCP_DENY_TOOLS = 'vault_deposit';
    expect(checkToolAccess('vault_deposit')).toContain('blocked');
    expect(checkToolAccess('vault_withdraw')).toBeNull();
  });

  it('handles whitespace in comma-separated lists', () => {
    process.env.SUZAKU_MCP_DENY_TOOLS = ' vault_deposit , vault_withdraw ';
    expect(checkToolAccess('vault_deposit')).toContain('blocked');
    expect(checkToolAccess('vault_withdraw')).toContain('blocked');
  });

  it('empty ALLOW_TOOLS string allows all tools', () => {
    process.env.SUZAKU_MCP_ALLOW_TOOLS = '';
    expect(checkToolAccess('vault_deposit')).toBeNull();
    expect(checkToolAccess('anything')).toBeNull();
  });

  it('empty DENY_TOOLS string denies nothing', () => {
    process.env.SUZAKU_MCP_DENY_TOOLS = '';
    expect(checkToolAccess('vault_deposit')).toBeNull();
  });
});

describe('checkValueLimit', () => {
  beforeEach(() => {
    delete process.env.SUZAKU_MCP_MAX_AVAX_PER_TX;
  });

  afterEach(() => {
    delete process.env.SUZAKU_MCP_MAX_AVAX_PER_TX;
  });

  it('returns null when no limit is configured', () => {
    expect(checkValueLimit('100')).toBeNull();
  });

  it('returns null when no amount is provided', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '10';
    expect(checkValueLimit(undefined)).toBeNull();
  });

  it('allows amounts within the limit', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '10';
    expect(checkValueLimit('5')).toBeNull();
    expect(checkValueLimit('10')).toBeNull();
  });

  it('blocks amounts exceeding the limit', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '10';
    expect(checkValueLimit('10.01')).toContain('exceeds');
    expect(checkValueLimit('100')).toContain('exceeds');
  });

  it('rejects non-decimal amounts (fail closed)', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = 'not-a-number';
    expect(checkValueLimit('10')).toContain('Unparseable');

    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '10';
    expect(checkValueLimit('not-a-number')).toContain('Unparseable');
  });

  it('rejects amounts with trailing text like "10 AVAX"', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '10';
    expect(checkValueLimit('10 AVAX')).toContain('Unparseable');
  });

  it('rejects scientific notation', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '10';
    expect(checkValueLimit('1e3')).toContain('Unparseable');
  });

  it('rejects negative amounts', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '10';
    expect(checkValueLimit('-5')).toContain('Unparseable');
  });

  it('rejects Infinity', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '10';
    expect(checkValueLimit('Infinity')).toContain('Unparseable');
  });

  it('handles decimal amounts', () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '1.5';
    expect(checkValueLimit('1.4')).toBeNull();
    expect(checkValueLimit('1.5')).toBeNull();
    expect(checkValueLimit('1.6')).toContain('exceeds');
  });
});

describe('confirmWriteOperation', () => {
  beforeEach(() => {
    delete process.env.SUZAKU_MCP_REQUIRE_CONFIRM;
    delete process.env.SUZAKU_MCP_SUGGEST;
  });

  afterEach(() => {
    delete process.env.SUZAKU_MCP_REQUIRE_CONFIRM;
    delete process.env.SUZAKU_MCP_SUGGEST;
  });

  it('returns null for mainnet (handled by cli-runner)', async () => {
    process.env.SUZAKU_MCP_REQUIRE_CONFIRM = 'true';
    const { confirmWriteOperation } = await import('./guard.js');
    expect(await confirmWriteOperation('vault_deposit', { network: 'mainnet' })).toBeNull();
  });

  it('returns null when REQUIRE_CONFIRM is not true', async () => {
    const { confirmWriteOperation } = await import('./guard.js');
    expect(await confirmWriteOperation('vault_deposit', { network: 'fuji' })).toBeNull();
  });

  it('fails closed when guardServer is null and REQUIRE_CONFIRM=true', async () => {
    process.env.SUZAKU_MCP_REQUIRE_CONFIRM = 'true';
    const { confirmWriteOperation } = await import('./guard.js');
    const result = await confirmWriteOperation('vault_deposit', { network: 'fuji' });
    expect(result).toContain('MCP server not initialized');
  });
});

describe('guardWriteOperation', () => {
  beforeEach(() => {
    delete process.env.SUZAKU_MCP_ALLOW_TOOLS;
    delete process.env.SUZAKU_MCP_DENY_TOOLS;
    delete process.env.SUZAKU_MCP_MAX_AVAX_PER_TX;
    delete process.env.SUZAKU_MCP_REQUIRE_CONFIRM;
    delete process.env.SUZAKU_MCP_SUGGEST;
  });

  afterEach(() => {
    delete process.env.SUZAKU_MCP_ALLOW_TOOLS;
    delete process.env.SUZAKU_MCP_DENY_TOOLS;
    delete process.env.SUZAKU_MCP_MAX_AVAX_PER_TX;
    delete process.env.SUZAKU_MCP_REQUIRE_CONFIRM;
    delete process.env.SUZAKU_MCP_SUGGEST;
  });

  it('returns null when all checks pass', async () => {
    expect(await guardWriteOperation('vault_deposit', { network: 'fuji', amount: '5' }, 'amount')).toBeNull();
  });

  it('fails on access check before value check', async () => {
    process.env.SUZAKU_MCP_DENY_TOOLS = 'vault_deposit';
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '100';
    const result = await guardWriteOperation('vault_deposit', { amount: '1' }, 'amount');
    expect(result).toContain('blocked');
  });

  it('fails on value limit when access is ok', async () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '5';
    const result = await guardWriteOperation('vault_deposit', { amount: '10', network: 'fuji' }, 'amount');
    expect(result).toContain('exceeds');
  });

  it('skips value check when amountField is not specified', async () => {
    process.env.SUZAKU_MCP_MAX_AVAX_PER_TX = '5';
    const result = await guardWriteOperation('vault_claim', { amount: '10', network: 'fuji' });
    expect(result).toBeNull();
  });

  it('skips confirmation for mainnet (handled by cli-runner)', async () => {
    process.env.SUZAKU_MCP_REQUIRE_CONFIRM = 'true';
    const result = await guardWriteOperation('vault_deposit', { network: 'mainnet', amount: '1' }, 'amount');
    expect(result).toBeNull();
  });
});
