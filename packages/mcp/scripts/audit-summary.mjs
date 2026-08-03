#!/usr/bin/env node
// Summarize the MCP audit log the live bot already writes (one JSON object per line:
// ts, tool, args, network, success, duration_ms, signerMethod). Node built-ins only.
//
//   docker compose exec suzaku-bot cat /data/audit/mcp-audit.log | node scripts/audit-summary.mjs
//   node scripts/audit-summary.mjs ~/.suzaku-cli/mcp-audit.log --since 7d
//   docker compose logs suzaku-bot | node scripts/audit-summary.mjs --gateway-logs

import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const GATEWAY_MODE = argv.includes('--gateway-logs');
const JSON_OUT = argv.includes('--json');
const sinceIdx = argv.indexOf('--since');
const SINCE_MS = sinceIdx !== -1 ? parseDuration(argv[sinceIdx + 1]) : null;
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--since');

function parseDuration(s) {
  const m = /^(\d+)([dhm])$/.exec(s ?? '');
  if (!m) {
    console.error(`bad --since value '${s}' (use e.g. 7d, 24h, 30m)`);
    process.exit(2);
  }
  const mult = { d: 86_400_000, h: 3_600_000, m: 60_000 }[m[2]];
  return Number(m[1]) * mult;
}

function readInput() {
  if (files.length > 0) return files.map((f) => readFileSync(f, 'utf8')).join('\n');
  try {
    return readFileSync(0, 'utf8'); // stdin
  } catch {
    console.error('no input: pass file paths or pipe the log on stdin');
    process.exit(2);
  }
}

const redact = (s) => s
  .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-…REDACTED')
  .replace(/\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, 'TG-TOKEN-REDACTED');

const raw = readInput();

// ---------- gateway-log mode: model selection / fallback visibility ----------
if (GATEWAY_MODE) {
  const lines = raw.split('\n');
  const markers = {
    fallback: /fallback|falling back|fell back/i,
    'moonshot/kimi': /moonshot\/kimi|kimi-k3/i,
    'openai/gpt': /openai\/gpt|gpt-5/i,
    'anthropic/claude': /anthropic\/claude|claude-sonnet|claude-haiku|claude-opus/i,
    'rate-limit': /rate.?limit|429|overloaded/i,
    error: /\bERROR\b|\bFATAL\b/,
  };
  const counts = Object.fromEntries(Object.keys(markers).map((k) => [k, 0]));
  const fallbackSamples = [];
  for (const line of lines) {
    for (const [name, re] of Object.entries(markers)) {
      if (re.test(line)) {
        counts[name] += 1;
        if (name === 'fallback' && fallbackSamples.length < 5) fallbackSamples.push(redact(line.trim()).slice(0, 200));
      }
    }
  }
  console.log(`gateway log lines: ${lines.length}`);
  for (const [name, n] of Object.entries(counts)) console.log(`  ${name.padEnd(18)} ${n}`);
  if (fallbackSamples.length > 0) {
    console.log('\nfallback samples:');
    for (const s of fallbackSamples) console.log(`  ${s}`);
  } else {
    console.log('\nno fallback markers found — primary model appears to have served all turns (or the marker regex needs tuning against this OpenClaw version\'s log format).');
  }
  process.exit(0);
}

// ---------- audit-log mode ----------
const now = Date.now();
const entries = [];
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t.startsWith('{')) continue;
  try {
    const e = JSON.parse(t);
    if (!e.tool || !e.ts) continue;
    const ts = Date.parse(e.ts);
    if (SINCE_MS != null && now - ts > SINCE_MS) continue;
    entries.push({ ts, tool: e.tool, ok: e.success === true, ms: Number(e.duration_ms ?? NaN), network: e.network, signer: e.signerMethod });
  } catch {
    /* skip malformed lines */
  }
}
if (entries.length === 0) {
  console.error('no audit entries matched (check the input / --since window)');
  process.exit(1);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

const byTool = new Map();
for (const e of entries) {
  if (!byTool.has(e.tool)) byTool.set(e.tool, []);
  byTool.get(e.tool).push(e);
}

const rows = [...byTool.entries()].map(([tool, list]) => {
  const durations = list.map((e) => e.ms).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    tool,
    calls: list.length,
    okPct: Math.round((list.filter((e) => e.ok).length / list.length) * 100),
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    max: durations.length > 0 ? durations[durations.length - 1] : NaN,
    last: new Date(Math.max(...list.map((e) => e.ts))).toISOString(),
  };
}).sort((a, b) => b.calls - a.calls);

const perDay = new Map();
for (const e of entries) {
  const day = new Date(e.ts).toISOString().slice(0, 10);
  perDay.set(day, (perDay.get(day) ?? 0) + 1);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ total: entries.length, tools: rows, perDay: Object.fromEntries(perDay) }, null, 2));
  process.exit(0);
}

const fmtMs = (n) => (Number.isFinite(n) ? `${Math.round(n)}ms` : '—');
console.log(`audit entries: ${entries.length}   window: ${SINCE_MS != null ? argv[sinceIdx + 1] : 'all'}   span: ${new Date(Math.min(...entries.map((e) => e.ts))).toISOString().slice(0, 10)} → ${new Date(Math.max(...entries.map((e) => e.ts))).toISOString().slice(0, 10)}`);
console.log('');
console.log(`${'tool'.padEnd(44)} ${'calls'.padStart(5)} ${'ok%'.padStart(4)} ${'p50'.padStart(8)} ${'p95'.padStart(8)} ${'max'.padStart(9)}`);
for (const r of rows) {
  console.log(`${r.tool.padEnd(44)} ${String(r.calls).padStart(5)} ${String(r.okPct).padStart(4)} ${fmtMs(r.p50).padStart(8)} ${fmtMs(r.p95).padStart(8)} ${fmtMs(r.max).padStart(9)}`);
}
const allDurations = entries.map((e) => e.ms).filter(Number.isFinite).sort((a, b) => a - b);
console.log(`${'TOTAL'.padEnd(44)} ${String(entries.length).padStart(5)} ${String(Math.round((entries.filter((e) => e.ok).length / entries.length) * 100)).padStart(4)} ${fmtMs(percentile(allDurations, 50)).padStart(8)} ${fmtMs(percentile(allDurations, 95)).padStart(8)} ${fmtMs(allDurations[allDurations.length - 1]).padStart(9)}`);
console.log('\ncalls per day (last 14):');
for (const [day, n] of [...perDay.entries()].sort().slice(-14)) {
  console.log(`  ${day}  ${String(n).padStart(4)}  ${'█'.repeat(Math.min(60, n))}`);
}
