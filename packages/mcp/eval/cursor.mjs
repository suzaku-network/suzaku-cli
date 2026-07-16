// Pure helpers for the `--engine cursor` eval engine (Cursor CLI / Composer).
// No process spawning, no I/O — unit-tested in cursor.test.mjs with fixtures so CI
// stays green with no cursor-agent binary or CURSOR_API_KEY present.
//
// The exact `cursor-agent --output-format stream-json` event shape is not fully
// documented, so parseCursorStream is deliberately tolerant: it tries several field
// names for each thing it needs and skips anything it doesn't recognize. If the real
// format differs, it degrades to an empty answer/trace (which the smoke run surfaces
// loudly) rather than silently returning wrong data.

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
    .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
    .map((b) => (typeof b === 'string' ? b : b.text ?? ''))
    .join('');
}

/**
 * Parse cursor-agent output into the runner's engine contract fields.
 * Accepts either `--output-format json` (a single object with `.result`) or
 * `--output-format stream-json` (newline-delimited events).
 * Returns { answer, trace, durationMs, usage, events } — events is the parsed count
 * for diagnostics ("parsed 0 events" is the tell that the format assumption is wrong).
 */
export function parseCursorStream(stdout) {
  const empty = { answer: '', trace: [], durationMs: null, usage: {}, resultError: null, events: 0 };
  if (typeof stdout !== 'string' || stdout.trim().length === 0) return empty;

  // json mode: the whole stdout is one object with a final `.result` string.
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      const result = pick(obj, ['result', 'text', 'message.content']);
      if (result !== undefined) {
        return {
          answer: contentText(result),
          trace: [],
          durationMs: pick(obj, ['duration_ms', 'durationMs']) ?? null,
          usage: normalizeUsage(pick(obj, ['usage', 'tokens']) ?? {}),
          resultError: pick(obj, ['is_error', 'isError']) === true ? (pick(obj, ['error', 'message']) ?? 'result.is_error') : null,
          events: 1,
        };
      }
    } catch { /* not single-object json — fall through to stream parsing */ }
  }

  // stream-json: one JSON event per line.
  const events = [];
  for (const line of trimmed.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try { events.push(JSON.parse(s)); } catch { /* skip non-JSON lines */ }
  }
  if (events.length === 0) return empty;

  // The terminal `result` event is the authoritative source of the final answer,
  // duration, usage, and error flag — Cursor's documented shape is
  // { type:"result", subtype:"success"|..., result:"<full text>", is_error, duration_ms, usage }.
  // Prefer it over stitching `assistant` events (which interleave interim tool-call
  // narration and cumulative flushes that would duplicate/garble the answer).
  const resultEvt = [...events].reverse().find((e) => e.type === 'result' || e.subtype === 'result' || e.subtype === 'success');

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

  // Tool identity lives nested under tool_call.<kind> (e.g. readToolCall / mcpToolCall),
  // not a flat top-level field — extract from there first, else fall back to flat fields.
  const toolName = (e) => {
    const tc = pick(e, ['tool_call', 'toolCall']);
    if (tc && typeof tc === 'object' && !Array.isArray(tc)) {
      const kind = Object.keys(tc)[0];
      const inner = kind ? tc[kind] : null;
      const nm = inner && typeof inner === 'object'
        ? pick(inner, ['name', 'tool', 'toolName', 'tool_name', 'server_name', 'mcp_server_name', 'args.name'])
        : undefined;
      if (nm) return String(nm);
      if (kind) return String(kind);
    }
    return String(pick(e, ['name', 'tool', 'toolName', 'tool_name', 'server_tool_name']) ?? 'tool');
  };

  // Trace: pair started→completed per call key; a per-key queue handles overlapping
  // same-name calls without ids, and a lone unlabeled event counts as exactly one call.
  const trace = [];
  const pending = new Map(); // key -> [{name, ts}]
  for (const e of events) {
    const ttype = String(e.type ?? '');
    if (ttype !== 'tool_call' && ttype !== 'mcp_tool_call' && !/tool.?call/i.test(ttype)) continue;
    const name = toolName(e);
    const key = String(pick(e, ['call_id', 'tool_call_id', 'id', 'toolCallId']) ?? name);
    const sub = String(pick(e, ['subtype', 'status', 'phase', 'state']) ?? '');
    const ts = pick(e, ['timestamp_ms', 'ts', 'time_ms']);
    const isError = pick(e, ['is_error', 'error', 'isError']) != null || /error|fail/i.test(sub);
    if (/start|begin|running/i.test(sub)) {
      if (!pending.has(key)) pending.set(key, []);
      pending.get(key).push({ name, ts });
    } else if (/complete|done|end|finish|error|fail|success|result/i.test(sub) || sub === '') {
      const q = pending.get(key);
      const s = q && q.length ? q.shift() : null;
      const ms = typeof ts === 'number' && s && typeof s.ts === 'number' ? ts - s.ts : (pick(e, ['duration_ms', 'durationMs']) ?? null);
      trace.push({ name: s?.name ?? name, ms: typeof ms === 'number' ? ms : null, isError });
    }
  }
  for (const [, q] of pending) for (const s of q) trace.push({ name: s.name, ms: null, isError: false });

  // duration/usage/error come ONLY from the terminal result event — never the first
  // match anywhere (a per-call duration or an init-event usage would be wrong).
  const durationMs = resultEvt ? (pick(resultEvt, ['duration_ms', 'durationMs']) ?? null) : null;
  const usage = normalizeUsage(resultEvt ? (pick(resultEvt, ['usage', 'tokens']) ?? {}) : {});
  const resultError = resultEvt && pick(resultEvt, ['is_error', 'isError']) === true
    ? (pick(resultEvt, ['error', 'message']) ?? 'result.is_error')
    : null;

  return { answer, trace, durationMs, usage, resultError, events: events.length };
}

/** Standard Cursor mcp.json shape registering the Suzaku read-only server. */
export function buildMcpConfig(serverPath, env = {}) {
  return {
    mcpServers: {
      suzaku: {
        command: 'node',
        args: [serverPath, '--read-only'],
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
      deny: ['Shell(*)', 'Read(*)', 'Write(*)', 'Search(*)'],
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
