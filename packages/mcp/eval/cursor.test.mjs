import { describe, it, expect } from 'vitest';
import { parseCursorStream, buildMcpConfig, isCursorAuthError } from './cursor.mjs';

// Synthetic stream-json transcript in the documented shape: system/init, buffered
// assistant text, an MCP tool_call started→completed pair, and a terminal result.
const STREAM = [
  { type: 'system', subtype: 'init', model: 'composer-2.5' },
  { type: 'tool_call', subtype: 'started', tool_call_id: 'c1', name: 'middleware_get_all_operators', timestamp_ms: 1000 },
  { type: 'tool_call', subtype: 'completed', tool_call_id: 'c1', name: 'middleware_get_all_operators', timestamp_ms: 1700 },
  { type: 'assistant', message: { model_call_id: 'm1', content: [{ type: 'text', text: 'There is <b>1 operator</b> registered.' }] } },
  { type: 'result', duration_ms: 4200, usage: { input_tokens: 1200, output_tokens: 90 } },
].map((e) => JSON.stringify(e)).join('\n');

describe('parseCursorStream', () => {
  it('extracts answer, trace, duration and usage from stream-json', () => {
    const r = parseCursorStream(STREAM);
    expect(r.answer).toBe('There is <b>1 operator</b> registered.');
    expect(r.events).toBe(5);
    expect(r.trace).toEqual([{ name: 'middleware_get_all_operators', ms: 700, isError: false }]);
    expect(r.durationMs).toBe(4200);
    expect(r.usage).toEqual({ input_tokens: 1200, output_tokens: 90 });
  });

  it('handles json mode (single object with .result)', () => {
    const r = parseCursorStream(JSON.stringify({ type: 'result', result: 'epoch 48 is current', duration_ms: 3000 }));
    expect(r.answer).toBe('epoch 48 is current');
    expect(r.durationMs).toBe(3000);
    expect(r.trace).toEqual([]);
  });

  it('reconstructs from deltas when no buffered flush exists', () => {
    const deltas = [
      { type: 'assistant', timestamp_ms: 1, delta: { text: 'epoch ' } },
      { type: 'assistant', timestamp_ms: 2, delta: { text: '48' } },
    ].map((e) => JSON.stringify(e)).join('\n');
    expect(parseCursorStream(deltas).answer).toBe('epoch 48');
  });

  it('prefers buffered flushes over deltas (no double-count)', () => {
    const mixed = [
      { type: 'assistant', timestamp_ms: 1, delta: { text: 'epoch ' } },
      { type: 'assistant', timestamp_ms: 2, delta: { text: '48' } },
      { type: 'assistant', message: { model_call_id: 'm1', content: [{ type: 'text', text: 'epoch 48' }] } },
    ].map((e) => JSON.stringify(e)).join('\n');
    expect(parseCursorStream(mixed).answer).toBe('epoch 48');
  });

  it('marks a failed tool call as errored', () => {
    const s = [
      { type: 'tool_call', subtype: 'started', tool_call_id: 'x', name: 'rewards_get_events', timestamp_ms: 0 },
      { type: 'tool_call', subtype: 'error', tool_call_id: 'x', name: 'rewards_get_events', is_error: true, timestamp_ms: 500 },
    ].map((e) => JSON.stringify(e)).join('\n');
    const r = parseCursorStream(s);
    expect(r.trace).toEqual([{ name: 'rewards_get_events', ms: 500, isError: true }]);
  });

  it('returns empty (not a crash) on garbage or unknown formats', () => {
    expect(parseCursorStream('')).toEqual({ answer: '', trace: [], durationMs: null, usage: {}, resultError: null, events: 0 });
    expect(parseCursorStream('not json at all\nmore junk').events).toBe(0);
    // unknown-but-valid JSON events → parsed, but nothing extracted
    expect(parseCursorStream(JSON.stringify({ type: 'mystery', foo: 1 })).answer).toBe('');
  });

  it('prefers the terminal result over assistant narration, and reads the nested tool name', () => {
    const s = [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Let me check the middleware. ' }] } },
      { type: 'tool_call', subtype: 'started', call_id: 'c1', tool_call: { mcpToolCall: { name: 'middleware_get_all_operators' } } },
      { type: 'tool_call', subtype: 'completed', call_id: 'c1', tool_call: { mcpToolCall: { name: 'middleware_get_all_operators' } } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'The current epoch is 48 with 3 operators.' }] } },
      { type: 'result', subtype: 'success', result: 'The current epoch is 48 with 3 operators.', is_error: false, duration_ms: 5000 },
    ].map((e) => JSON.stringify(e)).join('\n');
    const r = parseCursorStream(s);
    expect(r.answer).toBe('The current epoch is 48 with 3 operators.'); // not the glued 'Let me check…' narration
    expect(r.trace).toEqual([{ name: 'middleware_get_all_operators', ms: null, isError: false }]); // nested name, not 'tool'
    expect(r.durationMs).toBe(5000);
  });

  it('reads duration/usage ONLY from the terminal result, never mid-stream', () => {
    const s = [
      { type: 'system', subtype: 'init', usage: { input_tokens: 50 } }, // decoy usage
      { type: 'tool_call', subtype: 'completed', call_id: 't', name: 'x', duration_ms: 700 }, // decoy per-call duration
      { type: 'result', subtype: 'success', result: 'done' }, // no duration/usage
    ].map((e) => JSON.stringify(e)).join('\n');
    const r = parseCursorStream(s);
    expect(r.durationMs).toBeNull();
    expect(r.usage).toEqual({});
  });

  it('collapses cumulative buffered flushes per id when there is no result event', () => {
    const s = [
      { type: 'assistant', message: { model_call_id: 'm1', content: [{ type: 'text', text: 'Epoch 48.' }] } },
      { type: 'assistant', message: { model_call_id: 'm1', content: [{ type: 'text', text: 'Epoch 48. Operators healthy.' }] } },
    ].map((e) => JSON.stringify(e)).join('\n');
    expect(parseCursorStream(s).answer).toBe('Epoch 48. Operators healthy.'); // last flush per id wins, no duplication
  });

  it('surfaces a result-level error flag', () => {
    const s = JSON.stringify({ type: 'result', is_error: true, error: 'model failed', duration_ms: 100 });
    expect(parseCursorStream(s).resultError).toBe('model failed');
  });
});

describe('buildMcpConfig', () => {
  it('produces the standard mcpServers schema for the read-only server', () => {
    const cfg = buildMcpConfig('/abs/dist/server.js', { PATH: '/usr/bin', SNOWSCAN_API_KEY: 'x' });
    expect(cfg).toEqual({
      mcpServers: {
        suzaku: { command: 'node', args: ['/abs/dist/server.js', '--read-only'], env: { PATH: '/usr/bin', SNOWSCAN_API_KEY: 'x' } },
      },
    });
  });
});

describe('isCursorAuthError', () => {
  it('detects auth/quota failures, ignores normal text', () => {
    expect(isCursorAuthError('Error: unauthorized (401)')).toBe(true);
    expect(isCursorAuthError('CURSOR_API_KEY is not set')).toBe(true);
    expect(isCursorAuthError('quota exceeded')).toBe(true);
    expect(isCursorAuthError('There is 1 operator registered')).toBe(false);
    // domain vocabulary in a correct answer must NOT read as an auth failure
    expect(isCursorAuthError('the operator has insufficient stake to register')).toBe(false);
    expect(isCursorAuthError('the vault is near its deposit quota')).toBe(false);
  });
});
