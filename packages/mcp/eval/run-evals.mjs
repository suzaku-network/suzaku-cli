#!/usr/bin/env node
// Monitor-bot eval runner. Two tiers:
//   --tier 1  deterministic: run each question's ground-truth tools directly, assert
//             sane values, record latency. No LLM, no API key, $0.
//   --tier 2  LLM-in-loop: an Anthropic tool-runner agent with the bot's SOUL.md +
//             EPOCHS.md system prompt answers each question through the same MCP
//             server; scored on tool trace, facts vs live ground truth, Telegram
//             format rules, latency, and cost. Needs ANTHROPIC_API_KEY.
//
// Usage: node eval/run-evals.mjs --tier 1|2 [--only id1,id2] [--fast] [--model <id>]
// Results: eval/results/<runid>-tier<N>[-model].{json,md}

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  parseToolJson, getPath, deepFind, resolveFact, saneValue,
  normalizeAnswer, matchFact, scoreTrace, scoreFormat, computeCost, verdict,
} from './scoring.mjs';

// ---------- flags ----------
const argv = process.argv.slice(2);
function flagValue(name, dflt = null) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : dflt;
}
const TIER = Number(flagValue('--tier', '1'));
const ONLY = flagValue('--only') ? flagValue('--only').split(',').map((s) => s.trim()) : null;
const FAST = argv.includes('--fast');
const MODEL = flagValue('--model', 'claude-sonnet-4-6');
if (TIER !== 1 && TIER !== 2) {
  console.error('usage: run-evals.mjs --tier 1|2 [--only ids] [--fast] [--model id]');
  process.exit(2);
}

// $ per MTok [input, output]; cache write = 1.25x input, cache read = 0.1x input
const PRICES = {
  'claude-sonnet-4-6': [3, 15],
  'claude-sonnet-5': [3, 15],
  'claude-haiku-4-5': [1, 5],
  'claude-opus-4-8': [5, 25],
};
const DEFAULT_TOOL_TIMEOUT = 120_000;

// ---------- load question set ----------
const here = new URL('.', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('./questions.json', here), 'utf8'));

function substitute(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)([+-]\d+)?\}\}/g, (_, name, delta) => {
      if (!(name in vars)) throw new Error(`template var not resolved: ${name}`);
      const base = vars[name];
      if (delta) {
        const n = Number(base);
        if (!Number.isFinite(n)) throw new Error(`template arithmetic on non-number: ${name}=${base}`);
        return String(n + Number(delta));
      }
      return String(base);
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]));
  }
  return value;
}

// ---------- MCP client ----------
const serverEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  SUZAKU_MCP_RATE_MAX_CALLS: '600',
  SUZAKU_MCP_RATE_WINDOW_MS: '60000',
  // tier 1 measures true tool latency; tier 2 mirrors the deployed mcporter config
  SUZAKU_MCP_DEDUP_WINDOW_MS: TIER === 1 ? '1' : '30000',
};
if (process.env.SNOWSCAN_API_KEY) serverEnv.SNOWSCAN_API_KEY = process.env.SNOWSCAN_API_KEY;

const transport = new StdioClientTransport({
  command: 'node',
  args: [new URL('../dist/server.js', here).pathname, '--read-only'],
  env: serverEnv,
});
const mcp = new Client({ name: 'suzaku-eval', version: '0.0.1' });
await mcp.connect(transport);
const { tools: mcpTools } = await mcp.listTools();
const toolByName = new Map(mcpTools.map((t) => [t.name, t]));
console.log(`MCP server up: ${mcpTools.length} tools (read-only profile)`);

async function callMcp(name, args, timeoutMs = DEFAULT_TOOL_TIMEOUT) {
  const t0 = performance.now();
  try {
    const res = await mcp.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
    const text = res.content?.map((c) => c.text).join('\n') ?? '';
    return { ok: res.isError !== true, text, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, text: `EXCEPTION: ${e.message}`, ms: Math.round(performance.now() - t0) };
  }
}

// ---------- preflight: catch tool-name/arg mismatches before spending time ----------
const preflightWarnings = [];
function preflightCheck(toolName, args) {
  const tool = toolByName.get(toolName);
  if (!tool) {
    preflightWarnings.push(`unknown tool: ${toolName}`);
    return;
  }
  const schema = tool.inputSchema ?? {};
  const required = schema.required ?? [];
  const props = Object.keys(schema.properties ?? {});
  for (const r of required) {
    if (!(r in args)) preflightWarnings.push(`${toolName}: missing required arg '${r}' (has: ${Object.keys(args).join(', ')})`);
  }
  for (const a of Object.keys(args)) {
    if (props.length > 0 && !props.includes(a)) preflightWarnings.push(`${toolName}: arg '${a}' not in schema (expects: ${props.join(', ')})`);
  }
}

// ---------- context prefetch ----------
const vars = { ...spec.deployment };
for (const ctx of spec.context) {
  const args = substitute(ctx.args, vars);
  preflightCheck(ctx.tool, args);
  const res = await callMcp(ctx.tool, args);
  if (!res.ok) {
    console.error(`context fetch failed (${ctx.tool}): ${res.text.slice(0, 300)}`);
    process.exit(1);
  }
  const data = parseToolJson(res.text);
  let value;
  for (const path of ctx.extract) {
    value = getPath(data, path);
    if (value !== undefined) break;
  }
  if (value === undefined) {
    for (const path of ctx.extract) {
      const hit = deepFind(data, path);
      if (hit.found) { value = hit.value; break; }
    }
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    console.error(`context '${ctx.id}': could not extract a number (got ${JSON.stringify(value)}) from: ${res.text.slice(0, 300)}`);
    process.exit(1);
  }
  vars[ctx.id] = n;
  console.log(`context: ${ctx.id} = ${n}`);
}

// ---------- question selection ----------
const questions = spec.questions
  .filter((q) => (ONLY ? ONLY.includes(q.id) : true))
  .filter((q) => (FAST ? !q.slow : true))
  .filter((q) => (TIER === 1 ? !q.safety : true));
for (const q of questions) {
  for (const gt of q.groundTruth ?? []) preflightCheck(gt.tool, substitute(gt.args, vars));
  for (const group of q.expectedTools ?? []) {
    for (const name of Array.isArray(group) ? group : [group]) {
      if (!toolByName.has(name)) preflightWarnings.push(`expectedTools references unknown tool: ${name} (question ${q.id})`);
    }
  }
}
if (preflightWarnings.length > 0) {
  console.log('\n⚠ preflight warnings (fix questions.json if these look wrong):');
  for (const w of [...new Set(preflightWarnings)]) console.log(`  - ${w}`);
  console.log('');
}

// ---------- ground truth ----------
async function fetchGroundTruth(q) {
  const out = [];
  for (const gt of q.groundTruth ?? []) {
    const args = substitute(gt.args, vars);
    const res = await callMcp(gt.tool, args, gt.timeoutMs ?? DEFAULT_TOOL_TIMEOUT);
    const data = res.ok ? parseToolJson(res.text) : null;
    const facts = [];
    for (const factSpec of gt.facts ?? []) {
      const fact = { ...factSpec };
      if (fact.value !== undefined) fact.value = substitute(fact.value, vars);
      const resolved = fact.value !== undefined
        ? { value: fact.value, via: 'literal' }
        : resolveFact(data ?? {}, fact);
      facts.push({ spec: fact, ...resolved, sane: resolved.value !== undefined && saneValue(fact, resolved.value) });
    }
    out.push({ tool: gt.tool, ok: res.ok, ms: res.ms, error: res.ok ? null : res.text.slice(0, 400), facts, raw: res.text });
  }
  return out;
}

const results = [];

// ---------- tier 1 ----------
if (TIER === 1) {
  for (const q of questions) {
    const t0 = performance.now();
    const gts = await fetchGroundTruth(q);
    const allCallsOk = gts.every((g) => g.ok);
    const allFacts = gts.flatMap((g) => g.facts);
    const saneFacts = allFacts.filter((f) => f.sane);
    const v = allCallsOk && saneFacts.length === allFacts.length ? 'PASS'
      : allCallsOk && saneFacts.length > 0 ? 'PARTIAL' : 'FAIL';
    results.push({
      id: q.id, verdict: v,
      toolMs: gts.reduce((s, g) => s + g.ms, 0),
      wallMs: Math.round(performance.now() - t0),
      detail: {
        calls: gts.map((g) => ({ tool: g.tool, ok: g.ok, ms: g.ms, error: g.error })),
        facts: allFacts.map((f) => ({ name: f.spec.name, value: previewValue(f.value), via: f.via, sane: f.sane })),
      },
    });
    console.log(`${pad(v, 8)} ${pad(q.id, 20)} tools ${gts.map((g) => `${g.tool}:${g.ok ? 'ok' : 'ERR'}:${g.ms}ms`).join(' ')}`);
    for (const f of allFacts.filter((x) => !x.sane)) {
      console.log(`         ↳ fact '${f.spec.name}' unresolved/insane (via=${f.via ?? 'none'}, value=${previewValue(f.value)})`);
    }
  }
}

// ---------- tier 2 ----------
if (TIER === 2) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('tier 2 needs ANTHROPIC_API_KEY in the environment');
    process.exit(2);
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { betaTool } = await import('@anthropic-ai/sdk/helpers/beta/json-schema');
  const anthropic = new Anthropic();
  const price = PRICES[MODEL] ?? (console.log(`⚠ no pricing for ${MODEL}, using sonnet rates`), PRICES['claude-sonnet-4-6']);

  const soul = readFileSync(new URL('../deploy/openclaw/SOUL.md', here), 'utf8');
  const epochs = readFileSync(new URL('../deploy/openclaw/EPOCHS.md', here), 'utf8');
  const system = [{
    type: 'text',
    text: `${soul}\n\n---\n\nEPOCHS.md (your workspace reference — already read for you):\n\n${epochs}`,
    cache_control: { type: 'ephemeral' }, // caches tools+system across the sequential questions
  }];

  let trace = [];
  const agentTools = mcpTools.map((t) => betaTool({
    name: t.name,
    description: (t.description ?? '').slice(0, 1024),
    inputSchema: t.inputSchema,
    run: async (input) => {
      const res = await callMcp(t.name, input ?? {}, gtTimeout(t.name));
      trace.push({ name: t.name, ms: res.ms, isError: !res.ok });
      return res.text.slice(0, 30_000);
    },
  }));
  function gtTimeout(name) {
    const slowTools = ['deployment_heartbeat', 'middleware_operator_dashboard', 'middleware_network_overview', 'discover_network', 'rewards_get_events', 'rewards_epoch_diagnosis', 'middleware_stake_matrix', 'middleware_epoch_status', 'middleware_get_validator_balances', 'middleware_uptime_report'];
    return slowTools.includes(name) ? 300_000 : DEFAULT_TOOL_TIMEOUT;
  }

  for (const q of questions) {
    trace = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    const prompt = substitute(q.prompt, vars);
    const t0 = performance.now();
    let answer = '';
    let runError = null;
    let stopReason = null;
    try {
      const runner = anthropic.beta.messages.toolRunner({
        model: MODEL,
        max_tokens: 8192,
        system,
        tools: agentTools,
        messages: [{ role: 'user', content: prompt }],
        max_iterations: 8,
      });
      let last = null;
      for await (const message of runner) {
        last = message;
        for (const k of Object.keys(usage)) usage[k] += message.usage?.[k] ?? 0;
      }
      stopReason = last?.stop_reason ?? null;
      answer = (last?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    } catch (e) {
      runError = e.message;
    }
    const wallMs = Math.round(performance.now() - t0);

    // score
    const traceScore = scoreTrace(trace, {
      expectedTools: q.expectedTools ?? [],
      maxToolCalls: q.maxToolCalls ?? null,
      forbiddenTools: q.forbiddenTools ?? [],
    });
    const format = scoreFormat(answer);
    let factsSummary;
    let factDetails = [];
    if (q.safety) {
      const norm = normalizeAnswer(answer).toLowerCase();
      const refusalOk = (q.refusalAny ?? []).some((s) => norm.includes(s.toLowerCase()));
      const leaked = (q.mustNotContain ?? []).some((s) => answer.includes(s));
      factsSummary = { refusalOk, leaked };
      factDetails = [{ name: 'refusal', matched: refusalOk }, { name: 'no-leak', matched: !leaked }];
    } else {
      const gts = await fetchGroundTruth(q); // after the agent so dedup can't pre-warm it
      let total = 0;
      let matched = 0;
      for (const g of gts) {
        for (const f of g.facts) {
          if (f.spec.answerMatch === false) continue;
          total += 1;
          const ok = f.value !== undefined && matchFact(answer, f.spec, f.value);
          if (ok) matched += 1;
          factDetails.push({ name: f.spec.name, value: previewValue(f.value), via: f.via, matched: ok });
        }
      }
      factsSummary = { total, matched };
    }
    const v = runError ? 'FAIL' : verdict({ trace: traceScore, facts: factsSummary, format, safety: q.safety === true });
    const cost = computeCost(usage, price);
    results.push({
      id: q.id, verdict: v, wallMs, cost, usage, stopReason, runError,
      trace: trace.map((t) => ({ name: t.name, ms: t.ms, isError: t.isError })),
      traceScore, format, facts: factsSummary, factDetails,
      answer,
    });
    const factStr = q.safety
      ? `refusal=${factsSummary.refusalOk} leak=${factsSummary.leaked}`
      : `facts ${factsSummary.matched}/${factsSummary.total}`;
    console.log(`${pad(v, 8)} ${pad(q.id, 20)} tools ${traceScore.groupsSatisfied}/${traceScore.groupsTotal} calls=${traceScore.calls} ${factStr} fmt=${format.ok ? 'ok' : format.violations.join('+')} ${(wallMs / 1000).toFixed(1)}s $${cost.toFixed(4)}`);
    if (runError) console.log(`         ↳ error: ${runError.slice(0, 300)}`);
  }
}

// ---------- report ----------
function pad(s, n) { return String(s).padEnd(n); }
function previewValue(v) {
  if (v === undefined) return undefined;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

const passed = results.filter((r) => r.verdict === 'PASS').length;
const partial = results.filter((r) => r.verdict === 'PARTIAL').length;
const failed = results.filter((r) => r.verdict === 'FAIL').length;
const totalCost = results.reduce((s, r) => s + (r.cost ?? 0), 0);
console.log(`\n${passed} PASS / ${partial} PARTIAL / ${failed} FAIL of ${results.length}${TIER === 2 ? ` — total cost $${totalCost.toFixed(3)} (${MODEL})` : ''}`);

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const resultsDir = new URL('./results/', here);
mkdirSync(resultsDir, { recursive: true });
const baseName = `${runId}-tier${TIER}${TIER === 2 ? `-${MODEL}` : ''}`;
writeFileSync(new URL(`./${baseName}.json`, resultsDir), JSON.stringify({ runId, tier: TIER, model: TIER === 2 ? MODEL : null, vars, results }, null, 2));

const md = [];
md.push(`# Eval run ${runId} — tier ${TIER}${TIER === 2 ? ` — ${MODEL}` : ''}`);
md.push('');
md.push(`**${passed} PASS / ${partial} PARTIAL / ${failed} FAIL** of ${results.length}${TIER === 2 ? ` — total cost $${totalCost.toFixed(3)}` : ''}`);
md.push('');
md.push(TIER === 2
  ? '| question | verdict | tool groups | calls | facts | format | wall | cost |\n|---|---|---|---|---|---|---|---|'
  : '| question | verdict | tool latency | wall |\n|---|---|---|---|');
for (const r of results) {
  if (TIER === 2) {
    const factStr = r.factDetails ? r.factDetails.map((f) => `${f.name}:${f.matched ? '✓' : '✗'}`).join(' ') : '';
    md.push(`| ${r.id} | ${r.verdict} | ${r.traceScore.groupsSatisfied}/${r.traceScore.groupsTotal} | ${r.traceScore.calls} | ${factStr} | ${r.format.ok ? 'ok' : r.format.violations.join(', ')} | ${(r.wallMs / 1000).toFixed(1)}s | $${r.cost.toFixed(4)} |`);
  } else {
    md.push(`| ${r.id} | ${r.verdict} | ${r.toolMs}ms | ${r.wallMs}ms |`);
  }
}
if (TIER === 2) {
  md.push('');
  for (const r of results) {
    md.push(`## ${r.id} — ${r.verdict}`);
    md.push('');
    md.push(`Trace: ${r.trace.map((t) => `${t.name}(${t.ms}ms${t.isError ? ',ERR' : ''})`).join(' → ') || '(no tool calls)'}`);
    if (r.runError) md.push(`\nError: ${r.runError}`);
    md.push('');
    md.push('Answer:');
    md.push('```');
    md.push((r.answer ?? '').slice(0, 2500));
    md.push('```');
    md.push('');
  }
}
writeFileSync(new URL(`./${baseName}.md`, resultsDir), md.join('\n'));
console.log(`results: eval/results/${baseName}.{json,md}`);

await mcp.close();
process.exit(failed > 0 ? 1 : 0);
