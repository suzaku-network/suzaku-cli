import { describe, it, expect } from 'vitest';
import {
  parseCursorStream, auditCursorBoundary, parseCursorToolList, compareCursorToolList,
  buildMcpConfig, buildCliConfig, normalizeUsage, isCursorAuthError,
} from './cursor.mjs';

const STREAM = [
  { type: 'system', subtype: 'init', model: 'composer-2.5', service_tier: 'standard', agent_version: '2026.07.09' },
  {
    type: 'tool_call', subtype: 'started', tool_call_id: 'c1', timestamp_ms: 1000,
    tool_call: {
      mcpToolCall: {
        server_name: 'suzaku', name: 'middleware_get_all_operators',
        args: { middlewareAddress: '0xabc', network: 'mainnet' },
      },
    },
  },
  {
    type: 'tool_call', subtype: 'completed', tool_call_id: 'c1', timestamp_ms: 1700,
    tool_call: { mcpToolCall: { server_name: 'suzaku', name: 'middleware_get_all_operators' } },
  },
  { type: 'assistant', message: { model_call_id: 'm1', content: [{ type: 'text', text: 'There is <b>1 operator</b> registered.' }] } },
  { type: 'result', duration_ms: 4200, usage: { input_tokens: 1200, output_tokens: 90 } },
].map((e) => JSON.stringify(e)).join('\n');

describe('parseCursorStream', () => {
  it('extracts canonical trace, metadata, duration, usage, and a raw hash', () => {
    const r = parseCursorStream(STREAM);
    expect(r.answer).toBe('There is <b>1 operator</b> registered.');
    expect(r.events).toBe(5);
    expect(r.trace).toEqual([{
      kind: 'mcpToolCall', server: 'suzaku', name: 'middleware_get_all_operators',
      args: { middlewareAddress: '0xabc', network: 'mainnet' },
      state: 'completed', ms: 700, isError: false,
    }]);
    expect(r.durationMs).toBe(4200);
    expect(r.usage).toEqual({ input_tokens: 1200, output_tokens: 90 });
    expect(r.resolvedModel).toBe('composer-2.5');
    expect(r.resolvedServiceTier).toBe('standard');
    expect(r.init.version).toBe('2026.07.09');
    expect(r.terminalSeen).toBe(true);
    expect(r.parseErrors).toEqual([]);
    expect(r.rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles json mode (a single result object)', () => {
    const r = parseCursorStream(JSON.stringify({ type: 'result', result: 'epoch 48 is current', duration_ms: 3000 }));
    expect(r.answer).toBe('epoch 48 is current');
    expect(r.durationMs).toBe(3000);
    expect(r.trace).toEqual([]);
    expect(r.terminalSeen).toBe(true);
  });

  it('reconstructs from deltas when no buffered flush exists', () => {
    const deltas = [
      { type: 'assistant', timestamp_ms: 1, delta: { text: 'epoch ' } },
      { type: 'assistant', timestamp_ms: 2, delta: { text: '48' } },
    ].map((e) => JSON.stringify(e)).join('\n');
    expect(parseCursorStream(deltas).answer).toBe('epoch 48');
  });

  it('prefers buffered flushes over deltas without double-counting', () => {
    const mixed = [
      { type: 'assistant', timestamp_ms: 1, delta: { text: 'epoch ' } },
      { type: 'assistant', timestamp_ms: 2, delta: { text: '48' } },
      { type: 'assistant', message: { model_call_id: 'm1', content: [{ type: 'text', text: 'epoch 48' }] } },
    ].map((e) => JSON.stringify(e)).join('\n');
    expect(parseCursorStream(mixed).answer).toBe('epoch 48');
  });

  it('marks a failed MCP tool call as errored', () => {
    const s = [
      {
        type: 'tool_call', subtype: 'started', tool_call_id: 'x', timestamp_ms: 0,
        tool_call: { mcpToolCall: { server: 'suzaku', name: 'rewards_get_events', args: { epoch: '45' } } },
      },
      {
        type: 'tool_call', subtype: 'error', tool_call_id: 'x', is_error: true, timestamp_ms: 500,
        tool_call: { mcpToolCall: { server: 'suzaku', name: 'rewards_get_events' } },
      },
    ].map((e) => JSON.stringify(e)).join('\n');
    expect(parseCursorStream(s).trace).toEqual([{
      kind: 'mcpToolCall', server: 'suzaku', name: 'rewards_get_events', args: { epoch: '45' },
      state: 'error', ms: 500, isError: true,
    }]);
  });

  it('retains malformed stream lines instead of silently skipping them', () => {
    expect(parseCursorStream('')).toMatchObject({ answer: '', trace: [], events: 0, parseErrors: [] });
    expect(parseCursorStream('not json at all\nmore junk')).toMatchObject({
      events: 0,
      parseErrors: [expect.stringContaining('line 1'), expect.stringContaining('line 2')],
    });
    expect(parseCursorStream(JSON.stringify({ type: 'mystery', foo: 1 })).answer).toBe('');
  });

  it('prefers the terminal result over assistant narration', () => {
    const s = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Let me check. ' }] } },
      { type: 'tool_call', subtype: 'started', call_id: 'c1', tool_call: { mcpToolCall: { name: 'middleware_get_all_operators' } } },
      { type: 'tool_call', subtype: 'completed', call_id: 'c1', tool_call: { mcpToolCall: { name: 'middleware_get_all_operators' } } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'There are 3 operators.' }] } },
      { type: 'result', subtype: 'success', result: 'There are 3 operators.', is_error: false, duration_ms: 5000 },
    ].map((e) => JSON.stringify(e)).join('\n');
    const r = parseCursorStream(s);
    expect(r.answer).toBe('There are 3 operators.');
    expect(r.trace).toEqual([{
      kind: 'mcpToolCall', server: null, name: 'middleware_get_all_operators', args: null,
      state: 'completed', ms: null, isError: false,
    }]);
  });

  it('reads duration and usage only from the terminal result', () => {
    const s = [
      { type: 'system', subtype: 'init', usage: { input_tokens: 50 } },
      { type: 'tool_call', subtype: 'completed', call_id: 't', tool_call: { readToolCall: {} }, duration_ms: 700 },
      { type: 'result', subtype: 'success', result: 'done' },
    ].map((e) => JSON.stringify(e)).join('\n');
    const r = parseCursorStream(s);
    expect(r.durationMs).toBeNull();
    expect(r.usage).toEqual({});
  });

  it('collapses cumulative buffered flushes per id', () => {
    const s = [
      { type: 'assistant', message: { model_call_id: 'm1', content: [{ type: 'text', text: 'Epoch 48.' }] } },
      { type: 'assistant', message: { model_call_id: 'm1', content: [{ type: 'text', text: 'Epoch 48. Operators healthy.' }] } },
    ].map((e) => JSON.stringify(e)).join('\n');
    expect(parseCursorStream(s).answer).toBe('Epoch 48. Operators healthy.');
  });

  it('surfaces result-level errors', () => {
    const s = JSON.stringify({ type: 'result', is_error: true, error: 'model failed', duration_ms: 100 });
    expect(parseCursorStream(s).resultError).toBe('model failed');
  });

  it('marks started calls that never complete as errors', () => {
    const s = JSON.stringify({
      type: 'tool_call', subtype: 'started', call_id: 'pending',
      tool_call: { mcpToolCall: { server: 'suzaku', name: 'health_check', args: { network: 'mainnet' } } },
    });
    const r = parseCursorStream(s);
    expect(r.trace[0]).toMatchObject({ name: 'health_check', state: 'incomplete', isError: true });
    expect(r.streamIssues).toEqual([expect.stringContaining('never completed')]);
  });
});

describe('auditCursorBoundary', () => {
  const allowed = ['middleware_get_all_operators', 'health_check'];

  it('allows only known Suzaku MCP calls and the internal tool lister', () => {
    const s = [
      { type: 'tool_call', subtype: 'completed', call_id: 'list', tool_call: { getMcpToolsToolCall: {} } },
      { type: 'tool_call', subtype: 'completed', call_id: 'mcp', tool_call: { mcpToolCall: { server: 'suzaku', name: 'health_check', args: { network: 'mainnet' } } } },
      { type: 'result', subtype: 'success', result: 'ok' },
    ].map(JSON.stringify).join('\n');
    expect(auditCursorBoundary(parseCursorStream(s), allowed)).toMatchObject({
      ok: true, boundaryViolation: false, mcpCalls: 1, argsVisible: true,
    });
  });

  it.each(['shellToolCall', 'readToolCall', 'grepToolCall', 'globToolCall', 'writeToolCall'])('fails closed on %s', (kind) => {
    const s = [
      { type: 'tool_call', subtype: 'completed', call_id: kind, tool_call: { [kind]: { args: { path: '/repo' } } } },
      { type: 'result', subtype: 'success', result: 'bypassed MCP' },
    ].map(JSON.stringify).join('\n');
    const audit = auditCursorBoundary(parseCursorStream(s), allowed);
    expect(audit.boundaryViolation).toBe(true);
    expect(audit.violations).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'non-mcp-tool' })]));
  });

  it('fails on unknown tools, wrong servers, malformed JSON, and incomplete calls', () => {
    const s = [
      JSON.stringify({ type: 'tool_call', subtype: 'started', call_id: 'x', tool_call: { mcpToolCall: { server: 'other', name: 'invented_tool' } } }),
      '{broken',
    ].join('\n');
    const audit = auditCursorBoundary(parseCursorStream(s), allowed);
    expect(audit.boundaryViolation).toBe(true);
    expect(audit.violations.map((v) => v.code)).toEqual(expect.arrayContaining([
      'stream-parse-error', 'stream-call-error', 'wrong-mcp-server', 'unknown-mcp-tool',
    ]));
  });
});

describe('cursor list-tools parity', () => {
  const output = [
    'Tools for suzaku (2):',
    '- health_check (network, rpcUrl)',
    '- middleware_get_all_operators (middlewareAddress, network, rpcUrl)',
  ].join('\n');
  const expected = [
    { name: 'health_check', inputSchema: { properties: { rpcUrl: {}, network: {} } } },
    { name: 'middleware_get_all_operators', inputSchema: { properties: { middlewareAddress: {}, network: {}, rpcUrl: {} } } },
  ];

  it('parses names and arguments and accepts exact parity', () => {
    const parsed = parseCursorToolList(output);
    expect(parsed).toMatchObject({ server: 'suzaku', declaredCount: 2, errors: [] });
    expect(compareCursorToolList(parsed, expected).ok).toBe(true);
  });

  it('reports missing, extra, and argument drift', () => {
    const parsed = parseCursorToolList(output
      .replace('network, rpcUrl', 'network, extra')
      .replace('middleware_get_all_operators', 'invented'));
    const comparison = compareCursorToolList(parsed, expected);
    expect(comparison.ok).toBe(false);
    expect(comparison.missing).toContain('middleware_get_all_operators');
    expect(comparison.extra).toContain('invented');
    expect(comparison.argMismatches[0].name).toBe('health_check');
  });
});

describe('buildMcpConfig', () => {
  it('uses the isolated read-only server config with the Cursor stdio bridge', () => {
    const cfg = buildMcpConfig('/abs/dist/server.js', { PATH: '/usr/bin', SNOWSCAN_API_KEY: 'x' }, '/usr/bin/node');
    expect(cfg).toEqual({
      mcpServers: {
        suzaku: {
          command: '/bin/sh',
          args: ['-c', "tee /dev/null | '/usr/bin/node' '/abs/dist/server.js' --read-only | tee /dev/null"],
          env: { PATH: '/usr/bin', SNOWSCAN_API_KEY: 'x' },
        },
      },
    });
  });
});

describe('buildCliConfig', () => {
  it('denies built-ins and allows only the Suzaku MCP server', () => {
    const c = buildCliConfig();
    expect(c.permissions.deny).toEqual(expect.arrayContaining(['Shell(*)', 'Read(**)', 'Write(**)', 'Search(*)', 'Web(*)']));
    expect(c.permissions.allow).toEqual(['Mcp(suzaku:*)']);
  });
});

describe('normalizeUsage', () => {
  it('maps observed Cursor camelCase usage to snake_case', () => {
    expect(normalizeUsage({ inputTokens: 36345, outputTokens: 1430, cacheReadTokens: 259514, cacheWriteTokens: 0 }))
      .toEqual({ input_tokens: 36345, output_tokens: 1430, cache_read_input_tokens: 259514, cache_creation_input_tokens: 0 });
  });
  it('passes snake_case through and tolerates junk', () => {
    expect(normalizeUsage({ input_tokens: 5, output_tokens: 2 })).toEqual({ input_tokens: 5, output_tokens: 2 });
    expect(normalizeUsage(null)).toEqual({});
    expect(normalizeUsage('x')).toEqual({});
  });
});

describe('isCursorAuthError', () => {
  it('detects auth/quota failures but ignores protocol vocabulary', () => {
    expect(isCursorAuthError('Error: unauthorized (401)')).toBe(true);
    expect(isCursorAuthError('CURSOR_API_KEY is not set')).toBe(true);
    expect(isCursorAuthError('quota exceeded')).toBe(true);
    expect(isCursorAuthError('There is 1 operator registered')).toBe(false);
    expect(isCursorAuthError('the operator has insufficient stake to register')).toBe(false);
    expect(isCursorAuthError('the vault is near its deposit quota')).toBe(false);
  });
});
