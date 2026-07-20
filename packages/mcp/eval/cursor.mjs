import { createHash } from 'node:crypto';

// Pure helpers for the `--engine cursor` eval engine (Cursor CLI / Composer).
// No process spawning, no I/O — unit-tested in cursor.test.mjs with fixtures so CI
// stays green with no cursor-agent binary or CURSOR_API_KEY present.
//
// Cursor's stream shape is not a stable public contract. Parsing is tolerant enough to
// preserve diagnostics, but boundary classification is intentionally fail-closed: an
// unrecognized/malformed tool event can never produce a benchmark PASS.

/** First defined value among candidate dot-paths on obj (shallow-ish, array indices ok). */
function pick(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    let ok = true;
    for (const seg of p.split('.')) {
      if (cur == null || typeof cur !== 'object') { ok = false; break; }
      cur = Array.isArray(cur) && /^\d+$/.test(seg) ? cur[Number(seg)] : cur[seg];
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

/** Pull all text out of an assistant/message content array (or a bare string). */
function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => typeof b === 'string' || (b && (b.type === 'text' || typeof b.text === 'string')))
    .map((b) => (typeof b === 'string' ? b : b.text ?? ''))
    .join('');
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

function canonicalState(event) {
  const raw = String(pick(event, ['subtype', 'status', 'phase', 'state']) ?? '').toLowerCase();
  if (/start|begin|running|pending/.test(raw)) return 'started';
  if (/error|fail|cancel|abort/.test(raw)) return 'error';
  if (/complete|done|end|finish|success|result/.test(raw) || raw === '') return 'completed';
  return 'unknown';
}

function normalizeArgs(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function splitMcpName(rawName, rawServer) {
  let name = rawName == null ? null : String(rawName);
  let server = rawServer == null ? null : String(rawServer);
  if (name?.startsWith('mcp__')) {
    const [, parsedServer, ...rest] = name.split('__');
    if (parsedServer && rest.length > 0) {
      server ??= parsedServer;
      name = rest.join('__');
    }
  } else if (name?.includes(':')) {
    const [prefix, ...rest] = name.split(':');
    if (prefix && rest.length > 0) {
      server ??= prefix;
      name = rest.join(':');
    }
  }
  return { name, server };
}

function isToolEvent(event) {
  return /tool.?call/i.test(String(event?.type ?? ''))
    || /tool.?call/i.test(String(event?.subtype ?? ''))
    || (event?.tool_call != null)
    || (event?.toolCall != null);
}

function canonicalToolEvent(event, index) {
  const tc = pick(event, ['tool_call', 'toolCall']);
  let kind = null;
  let inner = null;
  let malformed = false;
  if (tc && typeof tc === 'object' && !Array.isArray(tc)) {
    // Cursor CLI 2026.07 flattens the protobuf oneof to a `*ToolCall` key and keeps
    // IDs/timestamps/hook context as siblings. Field additions are allowed by the
    // stream contract, so classify by exactly one tool-variant key rather than by
    // total key count. The in-memory `{tool:{case,value}}` shape is also accepted.
    if (Object.prototype.hasOwnProperty.call(tc, 'tool')) {
      const union = tc.tool;
      const flattenedVariants = Object.keys(tc).filter((key) => /ToolCall$/.test(key));
      if (flattenedVariants.length > 0) malformed = true;
      if (!union || typeof union !== 'object' || Array.isArray(union)
        || typeof union.case !== 'string' || union.case.length === 0
        || !union.value || typeof union.value !== 'object' || Array.isArray(union.value)) {
        malformed = true;
      } else {
        kind = union.case;
        inner = union.value;
      }
    } else {
      const variants = Object.keys(tc).filter((key) => /ToolCall$/.test(key));
      if (variants.length !== 1) {
        malformed = true;
      } else {
        [kind] = variants;
        inner = tc[kind];
        if (!inner || typeof inner !== 'object' || Array.isArray(inner)) malformed = true;
      }
    }
  }
  if (!kind && String(event.type ?? '').toLowerCase() === 'mcp_tool_call') kind = 'mcpToolCall';
  kind ??= String(pick(event, ['kind', 'tool_kind', 'toolKind']) ?? 'unknownToolCall');
  inner = inner && typeof inner === 'object' ? inner : {};

  const rawName = pick(inner, ['args.toolName', 'name', 'tool', 'toolName', 'tool_name'])
    ?? pick(event, ['name', 'tool', 'toolName', 'tool_name', 'server_tool_name']);
  const rawServer = pick(inner, ['args.providerIdentifier', 'args.server', 'server', 'serverName', 'server_name', 'mcpServer', 'mcp_server_name'])
    ?? pick(event, ['server', 'serverName', 'server_name', 'mcp_server_name']);
  const { name: splitName, server } = splitMcpName(rawName, rawServer);
  const internal = kind === 'getMcpToolsToolCall';
  const name = splitName ?? (internal || kind !== 'mcpToolCall' ? kind : null);
  const argsValue = (kind === 'mcpToolCall'
    ? pick(inner, ['args.args', 'args', 'input', 'arguments', 'params'])
    : pick(inner, ['args', 'input', 'arguments', 'params']))
    ?? pick(event, ['args', 'input', 'arguments', 'params']);
  const args = normalizeArgs(argsValue);
  if (kind === 'mcpToolCall' && !name) malformed = true;
  if (argsValue != null && args == null) malformed = true;
  const state = canonicalState(event);
  const nestedResultCase = String(pick(inner, ['result.result.case', 'result.case']) ?? '').toLowerCase();
  const nestedResultError = pick(inner, ['result.success.isError', 'result.success.is_error']) === true
    || ['error', 'failure', 'rejected', 'permissionDenied', 'cancelled', 'aborted']
      .some((key) => Object.prototype.hasOwnProperty.call(inner?.result ?? {}, key));
  const explicitError = pick(event, ['is_error', 'isError']) === true
    || Boolean(pick(event, ['error']))
    || nestedResultError
    || /error|fail|reject|denied|cancel|abort/.test(nestedResultCase)
    || state === 'error';
  const wrapperTs = state === 'started'
    ? pick(tc ?? {}, ['startedAtMs', 'started_at_ms'])
    : pick(tc ?? {}, ['completedAtMs', 'completed_at_ms']);
  return {
    index,
    callId: String(pick(event, ['call_id', 'tool_call_id', 'id', 'toolCallId'])
      ?? pick(tc ?? {}, ['toolCallId', 'tool_call_id'])
      ?? `${kind}:${server ?? ''}:${name ?? ''}`),
    kind,
    server,
    name,
    args,
    state,
    ts: pick(event, ['timestamp_ms', 'ts', 'time_ms']) ?? wrapperTs ?? null,
    ms: pick(event, ['duration_ms', 'durationMs']) ?? null,
    isError: explicitError,
    malformed,
  };
}

/** Parse one Cursor NDJSON transcript without silently dropping malformed lines. */
export function parseCursorStream(stdout) {
  const raw = typeof stdout === 'string' ? stdout : '';
  const rawSha256 = sha256(raw);
  const empty = {
    answer: '', trace: [], toolEvents: [], durationMs: null, usage: {},
    resultError: null, events: 0, parseErrors: [], streamIssues: [],
    terminalSeen: false, init: {}, resolvedModel: null, resolvedServiceTier: null, rawSha256,
  };
  if (raw.trim().length === 0) return empty;

  const events = [];
  const parseErrors = [];
  raw.trim().split('\n').forEach((line, i) => {
    const s = line.trim();
    if (!s) return;
    try {
      const parsed = JSON.parse(s);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('event is not an object');
      events.push(parsed);
    } catch (error) {
      parseErrors.push(`line ${i + 1}: ${error.message}`);
    }
  });
  if (events.length === 0) return { ...empty, parseErrors };

  // The terminal `result` event is the authoritative source of the final answer,
  // duration, usage, and error flag — Cursor's documented shape is
  // { type:"result", subtype:"success"|..., result:"<full text>", is_error, duration_ms, usage }.
  // Prefer it over stitching `assistant` events (which interleave interim tool-call
  // narration and cumulative flushes that would duplicate/garble the answer).
  const resultEvt = [...events].reverse().find((e) => e.type === 'result' || e.subtype === 'result');

  let answer = '';
  if (resultEvt) answer = contentText(pick(resultEvt, ['result', 'text', 'message.content']) ?? '');
  if (!answer) {
    // fallback only when there is no result event at all: reconstruct from assistant
    // events — buffered flushes preferred (last per model_call_id), else deltas.
    const assistant = events.filter((e) => e.type === 'assistant' || e.role === 'assistant');
    const isDelta = (e) => pick(e, ['timestamp_ms']) !== undefined && pick(e, ['message.model_call_id', 'model_call_id']) === undefined;
    const buffered = assistant.filter((e) => !isDelta(e));
    if (buffered.length > 0) {
      const lastById = new Map();
      const order = [];
      buffered.forEach((e, i) => {
        const id = String(pick(e, ['message.model_call_id', 'model_call_id']) ?? `#${i}`);
        if (!lastById.has(id)) order.push(id);
        lastById.set(id, contentText(pick(e, ['message.content', 'content', 'text']) ?? ''));
      });
      answer = order.map((id) => lastById.get(id)).filter(Boolean).join('');
    } else {
      answer = assistant.map((e) => contentText(pick(e, ['delta.content', 'delta.text', 'message.content', 'content', 'text']) ?? '')).join('');
    }
  }

  // Canonical raw tool events are retained for boundary auditing. Logical trace calls
  // merge started/completed pairs so expected-tool budgets count executions, not events.
  const toolEvents = events.map((e, index) => (isToolEvent(e) ? canonicalToolEvent(e, index) : null)).filter(Boolean);
  const trace = [];
  const pending = new Map();
  const streamIssues = [];
  for (const event of toolEvents) {
    if (event.state === 'started') {
      if (!pending.has(event.callId)) pending.set(event.callId, []);
      pending.get(event.callId).push(event);
      continue;
    }
    const queue = pending.get(event.callId);
    const started = queue?.shift() ?? null;
    if (started && (started.kind !== event.kind
      || (started.name != null && event.name != null && started.name !== event.name)
      || (started.server != null && event.server != null && started.server !== event.server))) {
      streamIssues.push(`call ${event.callId} changed identity between start and ${event.state}`);
    }
    const startTs = started?.ts;
    const ms = typeof event.ts === 'number' && typeof startTs === 'number'
      ? event.ts - startTs
      : event.ms;
    trace.push({
      kind: event.kind,
      server: event.server ?? started?.server ?? null,
      name: event.name ?? started?.name ?? null,
      args: event.args ?? started?.args ?? null,
      state: event.state,
      ms: typeof ms === 'number' ? ms : null,
      isError: event.isError || started?.isError === true || event.state === 'unknown' || event.malformed || started?.malformed === true,
    });
  }
  for (const [callId, queue] of pending) {
    for (const started of queue) {
      streamIssues.push(`call ${callId} started but never completed`);
      trace.push({
        kind: started.kind, server: started.server, name: started.name,
        args: started.args, state: 'incomplete', ms: null, isError: true,
      });
    }
  }

  // duration/usage/error come ONLY from the terminal result event — never the first
  // match anywhere (a per-call duration or an init-event usage would be wrong).
  const durationMs = resultEvt ? (pick(resultEvt, ['duration_ms', 'durationMs']) ?? null) : null;
  const usage = normalizeUsage(resultEvt ? (pick(resultEvt, ['usage', 'tokens']) ?? {}) : {});
  const resultError = resultEvt && (pick(resultEvt, ['is_error', 'isError']) === true
    || /error|fail|cancel|abort/i.test(String(resultEvt.subtype ?? '')))
    ? (pick(resultEvt, ['error', 'message']) ?? 'result.is_error')
    : null;
  const initEvt = events.find((e) => String(e.type ?? '') === 'system' && String(e.subtype ?? '') === 'init') ?? {};
  const resolvedModel = pick(initEvt, ['model', 'resolved_model', 'resolvedModel'])
    ?? pick(resultEvt ?? {}, ['model', 'resolved_model', 'resolvedModel'])
    ?? null;
  // `mode` is Cursor's execution mode (ask/plan), not a billing/service tier.
  // Current stream-json emits no tier field, so never manufacture one from it.
  const resolvedServiceTier = pick(initEvt, ['service_tier', 'serviceTier', 'tier'])
    ?? pick(resultEvt ?? {}, ['service_tier', 'serviceTier', 'tier'])
    ?? null;
  const init = {
    model: resolvedModel,
    serviceTier: resolvedServiceTier,
    version: pick(initEvt, ['version', 'agent_version', 'agentVersion']) ?? null,
    sessionId: pick(initEvt, ['session_id', 'sessionId', 'chat_id', 'chatId']) ?? null,
  };

  return {
    answer, trace, toolEvents, durationMs, usage, resultError,
    events: events.length, parseErrors, streamIssues,
    terminalSeen: Boolean(resultEvt), init, resolvedModel, resolvedServiceTier, rawSha256,
  };
}

/** Every raw tool event must be an approved Suzaku MCP execution or internal listing. */
export function auditCursorBoundary(parsed, allowedToolNames, serverName = 'suzaku') {
  const allowed = new Set(allowedToolNames ?? []);
  const violations = [];
  for (const error of parsed.parseErrors ?? []) violations.push({ code: 'stream-parse-error', detail: error });
  for (const issue of parsed.streamIssues ?? []) violations.push({ code: 'stream-call-error', detail: issue });
  for (const event of parsed.toolEvents ?? []) {
    if (event.malformed) violations.push({ code: 'malformed-tool-event', detail: `event ${event.index}` });
    if (event.state === 'unknown') violations.push({ code: 'unknown-tool-state', detail: `event ${event.index}` });
    if (event.kind === 'getMcpToolsToolCall') continue;
    if (event.kind !== 'mcpToolCall') {
      violations.push({ code: 'non-mcp-tool', detail: `${event.kind}:${event.name ?? '?'}` });
      continue;
    }
    if (event.server != null && event.server !== serverName) {
      violations.push({ code: 'wrong-mcp-server', detail: `${event.server}:${event.name ?? '?'}` });
    }
    if (!event.name || !allowed.has(event.name)) {
      violations.push({ code: 'unknown-mcp-tool', detail: `${event.server ?? '?'}:${event.name ?? '?'}` });
    }
  }
  const mcpCalls = (parsed.trace ?? []).filter((call) => call.kind === 'mcpToolCall');
  const argsVisible = mcpCalls.length === 0 ? null : mcpCalls.every((call) => call.args != null);
  return {
    ok: violations.length === 0,
    boundaryViolation: violations.length > 0,
    violations,
    mcpCalls: mcpCalls.length,
    internalCalls: (parsed.trace ?? []).filter((call) => call.kind === 'getMcpToolsToolCall').length,
    argsVisible,
  };
}

/** Parse `cursor-agent mcp list-tools` and compare both names and argument names. */
export function parseCursorToolList(stdout) {
  const lines = String(stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const header = /^Tools for (.+?) \((\d+)\):$/.exec(lines[0] ?? '');
  const errors = [];
  if (!header) errors.push('missing tool-list header');
  const tools = [];
  for (const line of lines.slice(header ? 1 : 0)) {
    const hit = /^- ([A-Za-z0-9_-]+) \((.*)\)$/.exec(line);
    if (!hit) {
      errors.push(`unparsed line: ${line}`);
      continue;
    }
    tools.push({
      name: hit[1],
      args: hit[2].trim() ? hit[2].split(',').map((arg) => arg.trim()).filter(Boolean) : [],
    });
  }
  const declaredCount = header ? Number(header[2]) : null;
  if (declaredCount != null && declaredCount !== tools.length) errors.push(`header says ${declaredCount} tools, parsed ${tools.length}`);
  return { server: header?.[1] ?? null, declaredCount, tools, errors };
}

export function compareCursorToolList(parsed, expectedTools) {
  const actual = new Map(parsed.tools.map((tool) => [tool.name, [...tool.args].sort()]));
  const expected = new Map(expectedTools.map((tool) => [
    tool.name,
    Object.keys(tool.inputSchema?.properties ?? {}).sort(),
  ]));
  const missing = [...expected.keys()].filter((name) => !actual.has(name));
  const extra = [...actual.keys()].filter((name) => !expected.has(name));
  const argMismatches = [];
  for (const [name, args] of expected) {
    if (!actual.has(name)) continue;
    if (JSON.stringify(actual.get(name)) !== JSON.stringify(args)) {
      argMismatches.push({ name, expected: args, actual: actual.get(name) });
    }
  }
  return {
    ok: parsed.errors.length === 0 && missing.length === 0 && extra.length === 0 && argMismatches.length === 0,
    missing, extra, argMismatches, parseErrors: parsed.errors,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** Standard Cursor mcp.json shape registering the Suzaku read-only server. */
export function buildMcpConfig(serverPath, env = {}, nodePath = process.execPath) {
  // Cursor CLI 2026.07 closes this server when Node is the direct stdio child. A
  // zero-storage tee bridge on both sides avoids that CLI transport race; mandatory
  // list-tools parity preflight below prevents this workaround from going stale.
  const bridge = `tee /dev/null | ${shellQuote(nodePath)} ${shellQuote(serverPath)} --read-only | tee /dev/null`;
  return {
    mcpServers: {
      suzaku: {
        command: '/bin/sh',
        args: ['-c', bridge],
        env,
      },
    },
  };
}

/**
 * Cursor CLI permissions config (project-level .cursor/cli.json) that restricts the
 * agent to ONLY the Suzaku MCP tools — denying the built-in shell/read/write/search
 * tools so Composer can't bypass MCP by running `suzaku-cli` in a shell or reading
 * files. This makes the benchmark apples-to-apples with the bot (which has MCP only).
 * NOTE: Cursor documents permissions as best-effort, not a hard boundary — a smoke run
 * must confirm the trace shows MCP tool names, not shellToolCall.
 */
export function buildCliConfig() {
  return {
    permissions: {
      deny: ['Shell(*)', 'Read(**)', 'Write(**)', 'Search(*)', 'Web(*)'],
      allow: ['Mcp(suzaku:*)'],
    },
  };
}

/** Map cursor-agent's camelCase usage (inputTokens…) to the snake_case computeCost expects. */
export function normalizeUsage(u) {
  if (!u || typeof u !== 'object') return {};
  const g = (a, b) => (u[a] ?? u[b]);
  const out = {};
  const it = g('input_tokens', 'inputTokens'); if (it != null) out.input_tokens = it;
  const ot = g('output_tokens', 'outputTokens'); if (ot != null) out.output_tokens = ot;
  const cr = g('cache_read_input_tokens', 'cacheReadTokens'); if (cr != null) out.cache_read_input_tokens = cr;
  const cw = g('cache_creation_input_tokens', 'cacheWriteTokens'); if (cw != null) out.cache_creation_input_tokens = cw;
  const tt = g('total_tokens', 'totalTokens'); if (tt != null) out.total_tokens = tt;
  return out;
}

/**
 * Detect an auth/quota failure in cursor-agent's STDERR (drives the billing-abort guard).
 * Deliberately narrow — do NOT run this against stdout, which embeds the model's answer:
 * bare words like "insufficient"/"quota" are ordinary protocol vocabulary and would flag
 * a correct answer. Restricted to auth/credential/quota-exhaustion phrasing.
 */
export function isCursorAuthError(text) {
  return /unauthorized|invalid api key|CURSOR_API_KEY|\b401\b|\b403\b|not authenticated|please log ?in|payment required|quota exceeded|rate limit/i.test(String(text ?? ''));
}
