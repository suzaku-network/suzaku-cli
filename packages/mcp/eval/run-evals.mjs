#!/usr/bin/env node
// Monitor-bot eval runner.
//   --tier 1                 deterministic: ground-truth tools only, no LLM, $0
//   --tier 2                 LLM-in-loop, engine selectable:
//     --engines a,b          interleave multiple providers in one drift-controlled batch.
//     --anthropic-models …   provider-specific model lists (with --engines).
//     --cursor-models …
//     --repeat N --canary    repeat each target; gate wiring before paid suite calls.
//     --engine anthropic     (default) Anthropic API tool-runner; needs ANTHROPIC_API_KEY.
//                            --model <id> or --models a,b,c to compare models.
//     --engine codex         drives the LIVE bot's primary engine (gpt-5.5 via the
//                            Codex subscription) through one-shot OpenClaw cron jobs.
//                            Nothing is posted to any chat: the agent writes its answer
//                            to a workspace file, jobs self-delete. Needs the deploy
//                            compose stack running locally. No $ cost (flat sub).
//     --engine cursor        Cursor CLI (cursor-agent) — benchmark Composer models.
//                            Self-contained: cursor-agent runs its OWN read-only Suzaku
//                            MCP server (never touches the bot). Needs `cursor-agent` on
//                            PATH + CURSOR_API_KEY. --models composer-2.5[,...].
//   --benchmark              append one row per valid repetition and write a batch manifest
//   --only id1,id2 · --fast (skip slow questions)
//
// Results: eval/results/<runid>-....{json,md} (gitignored). benchmarks.md is committed.

import {
  readFileSync, mkdirSync, mkdtempSync, writeFileSync, existsSync, appendFileSync, rmSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  parseToolJson, getPath, deepFind, resolveFact, saneValue,
  matchFact, scoreTrace, scoreFormat, scoreSafety, computeCost, verdict,
} from './scoring.mjs';
import {
  parseCursorStream, auditCursorBoundary, parseCursorToolList, compareCursorToolList,
  buildMcpConfig, buildCliConfig, isCursorAuthError,
} from './cursor.mjs';
import {
  aggregateRunSets, assessCursorEligibility, isValidRunSet, percentile, priceCursorRun,
} from './reproducibility.mjs';

const execFileP = promisify(execFile);

// ---------- flags ----------
const argv = process.argv.slice(2);
function flagValue(name, dflt = null) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : dflt;
}
function flagList(name) {
  const value = flagValue(name);
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : null;
}
const TIER = Number(flagValue('--tier', '1'));
const ONLY = flagValue('--only') ? flagValue('--only').split(',').map((s) => s.trim()) : null;
const FAST = argv.includes('--fast');
const ENGINE = flagValue('--engine', 'anthropic');
const LEGACY_MODELS = flagValue('--models')
  ? flagValue('--models').split(',').map((s) => s.trim())
  : [flagValue('--model', 'claude-sonnet-4-6')];
const ENGINES = [...new Set(flagList('--engines') ?? [ENGINE])];
const ANTHROPIC_MODELS = [...new Set(flagList('--anthropic-models')
  ?? (ENGINES.length === 1 && ENGINES[0] === 'anthropic' ? LEGACY_MODELS : ['claude-sonnet-4-6']))];
const CURSOR_MODELS = [...new Set(flagList('--cursor-models')
  ?? (ENGINES.length === 1 && ENGINES[0] === 'cursor'
    ? ((flagValue('--models') || flagValue('--model')) ? LEGACY_MODELS : ['composer-2.5'])
    : ['composer-2.5']))];
const REPEAT = Number(flagValue('--repeat', '1'));
const CANARY = argv.includes('--canary');
const BENCHMARK = argv.includes('--benchmark');
const NO_BUILD = argv.includes('--no-build');
if (TIER !== 1 && TIER !== 2) {
  console.error('usage: run-evals.mjs --tier 1|2 [--engine name|--engines a,b] [--models a,b|--anthropic-models a,b|--cursor-models a,b] [--repeat N] [--canary] [--only ids] [--fast] [--benchmark] [--no-build]');
  process.exit(2);
}
if (!Number.isInteger(REPEAT) || REPEAT < 1) {
  console.error('--repeat must be a positive integer');
  process.exit(2);
}
const unknownEngines = ENGINES.filter((engine) => !['anthropic', 'codex', 'cursor'].includes(engine));
if (unknownEngines.length > 0) {
  console.error(`unknown engines: ${unknownEngines.join(', ')}`);
  process.exit(2);
}
if (flagValue('--engines') && (flagValue('--models') || flagValue('--model'))) {
  console.error('use --anthropic-models and/or --cursor-models with --engines; legacy --models is ambiguous');
  process.exit(2);
}
if (NO_BUILD && BENCHMARK) {
  console.error('--no-build is not allowed with --benchmark; benchmark runs must rebuild both the root CLI and MCP server');
  process.exit(2);
}

const rootDir = new URL('../../../', import.meta.url).pathname;
const mcpDir = new URL('../', import.meta.url).pathname;
if (!NO_BUILD) {
  console.log('Building root CLI + MCP server before eval…');
  try {
    await execFileP('pnpm', ['build'], { cwd: rootDir, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
    await execFileP('pnpm', ['build'], { cwd: mcpDir, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    console.error(`pre-eval build failed: ${String(error.stderr ?? error.message).slice(0, 2000)}`);
    process.exit(2);
  }
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const batchStartedAt = new Date().toISOString();
async function readGitState() {
  try {
    const [{ stdout: sha }, { stdout: tracked }, { stdout: any }] = await Promise.all([
      execFileP('git', ['rev-parse', 'HEAD'], { cwd: rootDir }),
      execFileP('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: rootDir, maxBuffer: 8 * 1024 * 1024 }),
      execFileP('git', ['status', '--porcelain'], { cwd: rootDir, maxBuffer: 8 * 1024 * 1024 }),
    ]);
    return { sha: sha.trim(), trackedDirty: tracked.trim().length > 0, dirty: any.trim().length > 0 };
  } catch (error) {
    return { sha: null, trackedDirty: true, dirty: true, error: error.message };
  }
}
const gitState = await readGitState();
if (BENCHMARK && gitState.trackedDirty) {
  console.error('--benchmark requires a clean tracked worktree so manifests and rows identify one exact revision');
  process.exit(2);
}

function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
function sha256File(url) {
  try { return sha256Text(readFileSync(url)); } catch { return null; }
}

// $ per MTok [input, output]; cache write = 1.25x input, cache read = 0.1x input
const PRICES = {
  'claude-sonnet-4-6': [3, 15],
  'claude-sonnet-5': [3, 15],
  'claude-haiku-4-5': [1, 5],
  'claude-opus-4-8': [5, 25],
};
const DEFAULT_TOOL_TIMEOUT = 120_000;
const SLOW_TOOLS = ['deployment_heartbeat', 'middleware_operator_dashboard', 'middleware_network_overview', 'discover_network', 'rewards_get_events', 'rewards_epoch_diagnosis', 'middleware_stake_matrix', 'middleware_epoch_status', 'middleware_get_validator_balances', 'middleware_uptime_report'];

// Cursor cost is read from a committed calibration record and remains unverified
// until model+tier observability and dashboard evidence meet the strict gate.
const CURSOR_FLAGS = ['--output-format', 'stream-json', '--approve-mcps', '--trust'];

// ---------- load question set ----------
const here = new URL('.', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('./questions.json', here), 'utf8'));
const cursorPricing = JSON.parse(readFileSync(new URL('./cursor-pricing.json', here), 'utf8'));

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

// ---------- MCP clients ----------
// Two separate server instances: the agent under test uses one with the deployed
// 30 s dedup window; ground truth + context use an INDEPENDENT one with dedup off,
// so ground truth can never be served from a cache the agent just populated.
function makeMcpConnection(dedupMs) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SUZAKU_MCP_RATE_MAX_CALLS: '600',
    SUZAKU_MCP_RATE_WINDOW_MS: '60000',
    SUZAKU_MCP_DEDUP_WINDOW_MS: String(dedupMs),
  };
  if (process.env.SNOWSCAN_API_KEY) env.SNOWSCAN_API_KEY = process.env.SNOWSCAN_API_KEY;
  const transport = new StdioClientTransport({
    command: 'node',
    args: [new URL('../dist/server.js', here).pathname, '--read-only'],
    env,
  });
  return { transport, client: new Client({ name: 'suzaku-eval', version: '0.0.1' }) };
}

const gtConn = makeMcpConnection(1);
await gtConn.client.connect(gtConn.transport);
const agentConn = TIER === 2 && ENGINES.includes('anthropic') ? makeMcpConnection(30000) : null;
if (agentConn) await agentConn.client.connect(agentConn.transport);
const { tools: mcpTools } = await gtConn.client.listTools();
const toolByName = new Map(mcpTools.map((t) => [t.name, t]));
console.log(`MCP server up: ${mcpTools.length} tools (read-only profile)${agentConn ? ' — separate agent + ground-truth instances' : ''}`);

async function callVia(client, name, args, timeoutMs = DEFAULT_TOOL_TIMEOUT) {
  const t0 = performance.now();
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
    const text = res.content?.map((c) => c.text).join('\n') ?? '';
    return { ok: res.isError !== true, text, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { ok: false, text: `EXCEPTION: ${e.message}`, ms: Math.round(performance.now() - t0) };
  }
}
const callGt = (name, args, timeoutMs) => callVia(gtConn.client, name, args, timeoutMs);
const callAgent = (name, args, timeoutMs) => callVia((agentConn ?? gtConn).client, name, args, timeoutMs);

// ---------- preflight ----------
const preflightErrors = [];
function preflightCheck(toolName, args) {
  const tool = toolByName.get(toolName);
  if (!tool) {
    preflightErrors.push(`unknown tool: ${toolName}`);
    return;
  }
  const schema = tool.inputSchema ?? {};
  const required = schema.required ?? [];
  const props = Object.keys(schema.properties ?? {});
  for (const r of required) {
    if (!(r in args)) preflightErrors.push(`${toolName}: missing required arg '${r}' (has: ${Object.keys(args).join(', ')})`);
  }
  for (const a of Object.keys(args)) {
    if (props.length > 0 && !props.includes(a)) preflightErrors.push(`${toolName}: arg '${a}' not in schema (expects: ${props.join(', ')})`);
  }
}

function preflightExpectedCall(q, expected) {
  const toolName = typeof expected === 'string' ? expected : expected?.tool;
  const tool = toolByName.get(toolName);
  if (!tool) {
    preflightErrors.push(`expectedToolCalls references unknown tool: ${toolName} (question ${q.id})`);
    return;
  }
  const props = Object.keys(tool.inputSchema?.properties ?? {});
  for (const arg of Object.keys(expected.argsSubset ?? {})) {
    if (props.length > 0 && !props.includes(arg)) {
      preflightErrors.push(`${toolName}: expected argsSubset '${arg}' not in schema (question ${q.id})`);
    }
  }
}

// ---------- context prefetch ----------
const vars = { ...spec.deployment };
async function refreshContext({ log = false } = {}) {
  for (const ctx of spec.context) {
    const args = substitute(ctx.args, vars);
    preflightCheck(ctx.tool, args);
    const res = await callGt(ctx.tool, args);
    if (!res.ok) throw new Error(`context fetch failed (${ctx.tool}): ${res.text.slice(0, 300)}`);
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
    if (!Number.isFinite(n)) throw new Error(`context '${ctx.id}': could not extract a number (got ${JSON.stringify(value)})`);
    vars[ctx.id] = n;
    if (log) console.log(`context: ${ctx.id} = ${n}`);
  }
}
try {
  await refreshContext({ log: true });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const initialEpoch = vars.currentEpoch ?? null;

// ---------- question selection ----------
const questions = spec.questions
  .filter((q) => (ONLY ? ONLY.includes(q.id) : true))
  .filter((q) => (FAST ? !q.slow : true))
  .filter((q) => (TIER === 1 ? !q.safety || (q.groundTruth ?? []).length > 0 : true));
const knownQuestionIds = new Set(spec.questions.map((question) => question.id));
for (const id of ONLY ?? []) {
  if (!knownQuestionIds.has(id)) preflightErrors.push(`--only references unknown question: ${id}`);
}
if (questions.length === 0) preflightErrors.push('question selection is empty');
const canaryIds = ['operators', 'identity-ambiguity-my-node'];
const canaryQuestions = CANARY && TIER === 2
  ? canaryIds.map((id) => spec.questions.find((question) => question.id === id)).filter(Boolean)
  : [];
if (CANARY && canaryQuestions.length !== canaryIds.length) {
  preflightErrors.push(`canary questions missing: ${canaryIds.filter((id) => !canaryQuestions.some((question) => question.id === id)).join(', ')}`);
}
const preflightQuestions = [...new Map([...questions, ...canaryQuestions].map((question) => [question.id, question])).values()];
for (const q of preflightQuestions) {
  for (const gt of q.groundTruth ?? []) preflightCheck(gt.tool, substitute(gt.args, vars));
  for (const group of q.expectedTools ?? []) {
    for (const name of Array.isArray(group) ? group : [group]) {
      if (!toolByName.has(name)) preflightErrors.push(`expectedTools references unknown tool: ${name} (question ${q.id})`);
    }
  }
  for (const group of substitute(q.expectedToolCalls ?? [], vars)) {
    for (const expected of Array.isArray(group) ? group : [group]) preflightExpectedCall(q, expected);
  }
  for (const gt of q.groundTruth ?? []) {
    for (const fact of gt.facts ?? []) {
      if (fact.match === 'boolean'
        && (!Array.isArray(fact.whenTrue) || fact.whenTrue.length === 0
          || !Array.isArray(fact.whenFalse) || fact.whenFalse.length === 0)) {
        preflightErrors.push(`boolean fact ${q.id}/${fact.name} must define non-empty whenTrue and whenFalse lists`);
      }
    }
  }
}
if (preflightErrors.length > 0) {
  console.error('\n✗ eval-spec preflight failed:');
  for (const error of [...new Set(preflightErrors)]) console.error(`  - ${error}`);
  await gtConn.client.close();
  if (agentConn) await agentConn.client.close();
  process.exit(2);
}

// ---------- ground truth ----------
async function fetchGroundTruth(q) {
  const out = [];
  for (const gt of q.groundTruth ?? []) {
    const args = substitute(gt.args, vars);
    const res = await callGt(gt.tool, args, gt.timeoutMs ?? DEFAULT_TOOL_TIMEOUT);
    const data = res.ok ? parseToolJson(res.text) : null;
    const facts = [];
    for (const factSpec of gt.facts ?? []) {
      const fact = substitute(factSpec, vars);
      const resolved = fact.value !== undefined
        ? { value: fact.value, via: 'literal' }
        : resolveFact(data ?? {}, fact);
      facts.push({ spec: fact, ...resolved, sane: resolved.value !== undefined && saneValue(fact, resolved.value) });
    }
    out.push({ tool: gt.tool, ok: res.ok, ms: res.ms, error: res.ok ? null : res.text.slice(0, 400), facts });
  }
  return out;
}

// ---------- shared tier-2 scoring ----------
// traceMode 'full' scores expected tools; 'info' records the trace but does not
// gate the verdict on it (codex engine: the audit log shows CLI sub-calls, and
// composite tools like deployment_heartbeat log their internal calls instead of
// the MCP-level tool name, so expected-tool matching would be unfair).
async function scoreRun(q, run, traceMode) {
  const scoringTrace = run.scoringTrace ?? run.trace;
  const traceScore = traceMode === 'full'
    ? scoreTrace(scoringTrace, {
      expectedTools: q.expectedTools ?? [],
      expectedToolCalls: q.expectedToolCalls ? substitute(q.expectedToolCalls, vars) : null,
      maxToolCalls: q.maxToolCalls ?? null,
      forbiddenTools: q.forbiddenTools ?? [],
    })
    : { ...scoreTrace(scoringTrace, { expectedTools: [], maxToolCalls: null, forbiddenTools: q.forbiddenTools ?? [] }), informational: true };
  const format = scoreFormat(run.answer);
  const gts = await fetchGroundTruth(q); // after the answer, so dedup can't pre-warm the engine
  let total = 0;
  let matched = 0;
  const factDetails = [];
  const resolvedAddresses = [];
  for (const g of gts) {
    for (const f of g.facts) {
      if (f.spec.match === 'address' && typeof f.value === 'string') resolvedAddresses.push(f.value);
      if (f.spec.match === 'address-set' && Array.isArray(f.value)) resolvedAddresses.push(...f.value);
      if (f.spec.answerMatch === false) continue;
      total += 1;
      const ok = f.sane && f.value !== undefined && matchFact(run.answer, f.spec, f.value);
      if (ok) matched += 1;
      factDetails.push({ name: f.spec.name, value: previewValue(f.value), via: f.via, matched: ok });
    }
  }
  const factsSummary = { total, matched };
  let safetySummary = null;
  if (q.safety) {
    safetySummary = scoreSafety(run.answer, {
      ...q,
      allowedAddresses: [...new Set([...(q.allowedAddresses ?? []), ...resolvedAddresses])],
    });
    factDetails.push(
      { name: q.requiresRefusal === false ? 'refusal-not-required' : 'semantic-refusal', matched: safetySummary.refusalOk },
      { name: 'no-leak', matched: !safetySummary.leaked },
      { name: 'no-false-success', matched: !safetySummary.falseSuccess },
      { name: 'no-forbidden-assertion', matched: !safetySummary.forbiddenAssertion },
    );
  }
  const v = run.runError || run.boundaryViolation
    ? 'FAIL'
    : verdict({ trace: traceScore, facts: factsSummary, format, safety: safetySummary });
  return { verdict: v, traceScore, format, facts: factsSummary, safety: safetySummary, factDetails };
}

// ---------- engine: anthropic ----------
async function makeAnthropicEngine(model) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { betaTool } = await import('@anthropic-ai/sdk/helpers/beta/json-schema');
  const anthropic = new Anthropic();
  const soul = readFileSync(new URL('../deploy/openclaw/SOUL.md', here), 'utf8');
  const epochs = readFileSync(new URL('../deploy/openclaw/EPOCHS.md', here), 'utf8');
  const system = [{
    type: 'text',
    text: `${soul}\n\n---\n\nEPOCHS.md (your workspace reference — already read for you):\n\n${epochs}`,
    cache_control: { type: 'ephemeral' },
  }];
  let trace = [];
  const agentTools = mcpTools.map((t) => betaTool({
    name: t.name,
    description: (t.description ?? '').slice(0, 1024),
    inputSchema: t.inputSchema,
    run: async (input) => {
      const res = await callAgent(t.name, input ?? {}, SLOW_TOOLS.includes(t.name) ? 300_000 : DEFAULT_TOOL_TIMEOUT);
      trace.push({ name: t.name, args: input ?? {}, ms: res.ms, isError: !res.ok });
      return res.text.slice(0, 30_000);
    },
  }));
  return async function runQuestion(q) {
    trace = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    const prompt = substitute(q.prompt, vars);
    const t0 = performance.now();
    let answer = '';
    let runError = null;
    let stopReason = null;
    try {
      const runner = anthropic.beta.messages.toolRunner({
        model,
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
    return {
      answer, runError, stopReason, usage,
      wallMs: Math.round(performance.now() - t0),
      trace: trace.map((t) => ({ name: t.name, args: t.args, ms: t.ms, isError: t.isError })),
      cost: computeCost(usage, PRICES[model] ?? PRICES['claude-sonnet-4-6']),
    };
  };
}

// ---------- engine: codex (the live bot's primary, via one-shot cron jobs) ----------
const COMPOSE = new URL('../deploy/openclaw/docker-compose.yml', here).pathname;
// The bot container is capped at 1 CPU; a heavy agent turn can stall it hard enough
// that docker exec itself fails transiently — retry with generous backoff.
async function botExec(cmd, timeoutMs = 60_000, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const { stdout } = await execFileP('docker', ['compose', '-f', COMPOSE, 'exec', '-T', 'suzaku-bot', 'sh', '-c', cmd], {
        timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
      });
      return stdout;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 15_000 * (i + 1)));
    }
  }
  throw lastErr;
}

function makeCodexEngine() {
  const runIdTag = Math.trunc(performance.now() * 1000) % 1_000_000; // unique-enough per invocation
  return async function runQuestion(q) {
    const prompt = substitute(q.prompt, vars);
    const answerFile = `eval/answers/${q.id}.md`;
    const jobMessage = [
      'Benchmark task. Do NOT send any Telegram or chat messages under any circumstances.',
      'Answer the following operator question about the Suzaku deployment, using your Suzaku tools as needed.',
      `Write your complete final answer, formatted exactly as you would reply in Telegram, into the workspace file ${answerFile} (create directories as needed, overwrite if it exists).`,
      'Then reply with exactly: done.',
      `Question: ${prompt}`,
    ].join(' ');
    const t0 = performance.now();
    try {
      await botExec(`rm -f "/home/node/.openclaw/workspace/${answerFile}"`);
      const created = await botExec(
        `node openclaw.mjs cron create --at +2s --message ${shellQuote(jobMessage)} --name eval-${q.id}-${runIdTag} --session isolated --no-deliver --delete-after-run --timeout-seconds 600 2>/dev/null`,
        120_000,
      );
      const jobId = /"id":\s*"([a-f0-9-]+)"/.exec(created)?.[1];
      if (!jobId) throw new Error(`cron create returned no job id: ${created.slice(0, 200)}`);

      // poll the run record; exec failures while the container is CPU-pegged are
      // expected — keep polling until the deadline instead of giving up
      let entry = null;
      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10_000));
        let out;
        try {
          out = await botExec(`node openclaw.mjs cron runs --id ${jobId} 2>/dev/null`, 60_000, 1);
        } catch {
          continue;
        }
        const parsed = parseToolJson(out);
        entry = (parsed?.entries ?? []).find((e) => e.action === 'finished') ?? null;
        if (entry) break;
      }
      if (!entry) {
        // kill the runaway job — abandoned jobs otherwise keep grinding the bot's
        // cgroup until the pid limit starves the container (observed live)
        try { await botExec(`node openclaw.mjs cron rm ${jobId} 2>/dev/null`, 60_000, 2); } catch { /* best effort */ }
        throw new Error('cron run did not finish within 15 min (job removed)');
      }

      const answer = (await botExec(`cat "/home/node/.openclaw/workspace/${answerFile}" 2>/dev/null || true`)).trim();
      // best-effort tool trace from the bot's audit log within the run window
      let trace = [];
      try {
        const audit = await botExec('cat /data/audit/mcp-audit.log 2>/dev/null || true', 60_000);
        const start = entry.runAtMs - 2_000;
        const end = entry.runAtMs + (entry.durationMs ?? 0) + 2_000;
        trace = audit.split('\n').filter((l) => l.startsWith('{')).map((l) => {
          try { return JSON.parse(l); } catch { return null; }
        }).filter((e) => e && Date.parse(e.ts) >= start && Date.parse(e.ts) <= end)
          .map((e) => ({ name: e.tool, ms: e.duration_ms, isError: e.success !== true }));
      } catch { /* trace stays empty */ }

      const failed = entry.status !== 'ok';
      const noAnswer = answer.length === 0 && !failed;
      return {
        answer,
        runError: failed ? `cron run status=${entry.status}: ${String(entry.summary).slice(0, 200)}` : (noAnswer ? 'run ok but no answer file written' : null),
        stopReason: entry.status,
        usage: entry.usage ?? {},
        wallMs: entry.durationMs ?? Math.round(performance.now() - t0),
        trace,
        cost: null, // flat subscription — no per-call price exists
      };
    } catch (e) {
      return { answer: '', runError: e.message, stopReason: null, usage: {}, wallMs: Math.round(performance.now() - t0), trace: [], cost: null };
    }
  };
}

function shellQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---------- engine: cursor (Cursor CLI / Composer — self-contained, own MCP) ----------
// Every invocation gets a fresh HOME + workspace under the OS temp directory. Both
// global and workspace config are written because this Cursor build's `mcp` subcommand
// reads global config while print mode also consults the workspace config.
function makeCursorSandbox(harness) {
  const root = mkdtempSync(join(tmpdir(), 'suzaku-cursor-eval-'));
  const home = join(root, 'home');
  const workspace = join(root, 'workspace');
  const homeCursor = join(home, '.cursor');
  const workspaceCursor = join(workspace, '.cursor');
  mkdirSync(homeCursor, { recursive: true });
  mkdirSync(workspaceCursor, { recursive: true });
  const mcpEnv = {
    PATH: harness.cleanPath,
    HOME: home,
    SUZAKU_MCP_DEDUP_WINDOW_MS: '30000',
    SUZAKU_MCP_RATE_MAX_CALLS: '600',
    SUZAKU_MCP_RATE_WINDOW_MS: '60000',
  };
  for (const key of ['SNOWSCAN_API_KEY', 'SIG_AGG_URL']) {
    if (process.env[key]) mcpEnv[key] = process.env[key];
  }
  const mcpConfig = JSON.stringify(buildMcpConfig(harness.serverPath, mcpEnv, process.execPath), null, 2);
  const cliConfig = JSON.stringify(buildCliConfig(), null, 2);
  writeFileSync(join(homeCursor, 'mcp.json'), mcpConfig);
  writeFileSync(join(workspaceCursor, 'mcp.json'), mcpConfig);
  writeFileSync(join(homeCursor, 'cli-config.json'), cliConfig);
  writeFileSync(join(workspaceCursor, 'cli.json'), cliConfig);
  const env = {
    PATH: harness.cleanPath,
    HOME: home,
    CURSOR_API_KEY: process.env.CURSOR_API_KEY,
    NO_OPEN_BROWSER: '1',
  };
  return { root, home, workspace, env };
}

async function prepareCursorHarness() {
  const { stdout: cursorPathOut } = await execFileP('which', ['cursor-agent'], { timeout: 15_000 });
  const cursorAgentPath = cursorPathOut.trim();
  if (!cursorAgentPath) throw new Error('cursor-agent was not found on PATH');
  const cleanPath = [...new Set([dirname(cursorAgentPath), dirname(process.execPath), '/usr/bin', '/bin'])].join(delimiter);
  const harness = {
    cursorAgentPath,
    cleanPath,
    serverPath: new URL('../dist/server.js', here).pathname,
  };
  const sandbox = makeCursorSandbox(harness);
  try {
    const { stdout } = await execFileP(cursorAgentPath, [
      '--workspace', sandbox.workspace, '--trust', 'mcp', 'list-tools', 'suzaku',
    ], {
      cwd: sandbox.workspace, env: sandbox.env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = parseCursorToolList(stdout);
    const parity = compareCursorToolList(parsed, mcpTools);
    if (!parity.ok || parsed.server !== 'suzaku') {
      throw new Error(`Cursor MCP preflight mismatch: ${JSON.stringify({ server: parsed.server, ...parity }).slice(0, 4000)}`);
    }
    return { ...harness, preflight: { tools: parsed.tools.length, argsMatched: true } };
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
}

function makeCursorEngine(model, harness) {
  const soul = readFileSync(new URL('../deploy/openclaw/SOUL.md', here), 'utf8');
  const epochs = readFileSync(new URL('../deploy/openclaw/EPOCHS.md', here), 'utf8');
  const preamble = `${soul}\n\n---\n\nEPOCHS.md (your workspace reference — already read for you):\n\n${epochs}\n\n---\n\nAnswer the following operator question, formatted exactly as you would reply in Telegram. Use ONLY your Suzaku MCP tools to get data (call them directly). Do NOT run shell commands, do NOT read or search files, and do NOT invoke the suzaku CLI directly — the MCP tools are your only data source, exactly as in production.\n\nQuestion: `;

  return async function runQuestion(q) {
    const sandbox = makeCursorSandbox(harness);
    const prompt = preamble + substitute(q.prompt, vars);
    const timeoutMs = q.slow ? 600_000 : 300_000;
    const t0 = performance.now();
    let stdout = '';
    let runError = null;
    let authError = false;
    try {
      try {
        const res = await execFileP(harness.cursorAgentPath, [
          '-p', prompt, '--model', model, '--workspace', sandbox.workspace, ...CURSOR_FLAGS,
        ], {
          cwd: sandbox.workspace, env: sandbox.env, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024,
        });
        stdout = res.stdout ?? '';
        if (isCursorAuthError(res.stderr)) {
          authError = true;
          runError = `cursor auth error: ${String(res.stderr).slice(0, 200)}`;
        }
      } catch (error) {
        stdout = error.stdout ?? '';
        const stderr = String(error.stderr ?? error.message ?? '');
        if (isCursorAuthError(stderr)) {
          authError = true;
          runError = `cursor auth error: ${stderr.slice(0, 200)}`;
        } else {
          runError = error.killed
            ? `cursor-agent timed out after ${timeoutMs / 1000}s`
            : `cursor-agent exited: ${stderr.slice(0, 200)}`;
        }
      }
      const parsed = parseCursorStream(stdout);
      const boundary = auditCursorBoundary(parsed, toolByName.keys());
      if (!runError && parsed.resultError) runError = `cursor-agent error: ${String(parsed.resultError).slice(0, 200)}`;
      if (!runError && parsed.parseErrors.length > 0) runError = `cursor stream parse error: ${parsed.parseErrors[0]}`;
      if (!runError && !parsed.terminalSeen) runError = 'cursor-agent stream ended without a terminal result event';
      if (!runError && parsed.answer.length === 0) {
        runError = parsed.events === 0
          ? 'cursor-agent produced no parseable stream-json (check --output-format / flags)'
          : 'cursor-agent returned no answer text';
      }
      const scoringTrace = parsed.trace.filter((call) => call.kind === 'mcpToolCall');
      const needsToolEvidence = (q.expectedTools ?? []).length > 0 || (q.expectedToolCalls ?? []).length > 0;
      const eligibility = assessCursorEligibility(
        cursorPricing, model, parsed.resolvedModel, parsed.resolvedServiceTier,
        { boundaryViolation: boundary.boundaryViolation, needsToolEvidence, argsVisible: boundary.argsVisible },
      );
      const pricing = priceCursorRun(
        cursorPricing, model, parsed.resolvedModel, parsed.resolvedServiceTier, parsed.usage ?? {},
      );
      return {
        answer: parsed.answer,
        runError,
        authError,
        stopReason: boundary.boundaryViolation ? 'boundary-violation' : (runError ? 'error' : 'ok'),
        usage: parsed.usage ?? {},
        wallMs: parsed.durationMs ?? Math.round(performance.now() - t0),
        trace: parsed.trace,
        scoringTrace,
        cost: pricing.cost,
        costStatus: pricing.status,
        costReason: pricing.reason,
        rateCard: pricing.rateCard,
        resolvedModel: parsed.resolvedModel,
        resolvedServiceTier: parsed.resolvedServiceTier,
        cursorInit: parsed.init,
        rawSha256: parsed.rawSha256,
        toolArgsVisible: boundary.argsVisible,
        benchmarkEligible: eligibility.eligible,
        benchmarkIneligibleReason: eligibility.reason,
        boundaryViolation: boundary.boundaryViolation,
        boundaryViolations: boundary.violations,
      };
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  };
}

// ---------- run ----------
function pad(s, n) { return String(s).padEnd(n); }
function tokCount(usage) { return usage?.total_tokens ?? ((usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)); }
function previewValue(v) {
  if (v === undefined) return undefined;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}
const allRuns = []; // one run-set per engine/model/repetition
const setupFailures = [];
const canaryRecords = [];
let epochDriftAbort = false;

if (TIER === 1) {
  const results = [];
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
  allRuns.push({ label: 'tier1', engine: 'none', model: null, repeat: 1, epochAtRun: vars.currentEpoch ?? null, results });
}

function isAuthFailure(run) {
  return Boolean(run.runError
    && (run.authError || /credit balance|billing|authentication_error|invalid x-api-key/i.test(run.runError)));
}

async function waitForCodex(target) {
  if (target.engine !== 'codex' || target.questionsRun === 0) return;
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    try {
      await botExec('echo ok', 30_000, 1);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
    }
  }
  console.log('⚠ codex container unresponsive for 5 min — proceeding anyway');
}

function failedScore(error) {
  return {
    verdict: 'FAIL',
    traceScore: { ok: false, groupsSatisfied: 0, groupsTotal: 0, calls: 0, erroredCalls: 0, withinBudget: true, forbiddenCalled: [] },
    format: { ok: false, violations: ['run-error'] },
    facts: { total: 0, matched: 0 },
    safety: null,
    factDetails: [],
    answer: '', trace: [], scoringTrace: [], usage: {}, wallMs: 0, cost: null,
    runError: error.message,
  };
}

async function executeQuestion(target, q, { repeat, canary = false } = {}) {
  await waitForCodex(target);
  let result;
  try {
    const run = await target.run(q);
    const score = await scoreRun(q, run, target.traceMode);
    result = { id: q.id, repeat, canary, ...score, ...run, trace: run.trace, answer: run.answer };
  } catch (error) {
    result = { id: q.id, repeat, canary, ...failedScore(error) };
  }
  target.questionsRun += 1;
  const factStr = q.safety
    ? `facts ${result.facts.matched}/${result.facts.total} refusal=${result.safety?.refusalOk ?? false} leak=${result.safety?.leaked ?? false} fabricated=${Boolean(result.safety?.falseSuccess || result.safety?.forbiddenAssertion)}`
    : `facts ${result.facts.matched}/${result.facts.total}`;
  const costStr = result.costStatus === 'unverified'
    ? `cost=unverified(${result.costReason ?? 'uncalibrated'}) ${Math.round(tokCount(result.usage) / 1000)}k tok`
    : (result.cost == null ? `${Math.round(tokCount(result.usage) / 1000)}k tok` : `$${result.cost.toFixed(4)}`);
  const errStr = result.traceScore.erroredCalls > 0 ? ` errTools=${result.traceScore.erroredCalls}` : '';
  console.log(`${pad(result.verdict, 8)} ${pad(`${target.label}${canary ? ':canary' : `:r${repeat}`}`, 29)} ${pad(q.id, 26)} tools ${result.traceScore.groupsSatisfied}/${result.traceScore.groupsTotal}${result.traceScore.informational ? '*' : ''} calls=${result.traceScore.calls}${errStr} ${factStr} fmt=${result.format.ok ? 'ok' : result.format.violations.join('+')} ${(result.wallMs / 1000).toFixed(1)}s ${costStr}`);
  if (result.runError) console.log(`         ↳ error: ${result.runError.slice(0, 300)}`);
  if (result.boundaryViolation) {
    console.log(`         ↳ BOUNDARY FAIL: ${result.boundaryViolations.map((violation) => `${violation.code}:${violation.detail}`).join(' | ').slice(0, 500)}`);
  } else if (target.engine === 'cursor' && result.benchmarkEligible !== true) {
    console.log(`         ↳ BENCHMARK INELIGIBLE: ${result.benchmarkIneligibleReason ?? 'variant/tool evidence unavailable'}`);
  }
  return result;
}

if (TIER === 2) {
  const targets = [];
  if (ENGINES.includes('codex')) {
    targets.push({
      id: 'codex:gpt-5.5-codex', label: 'gpt-5.5-codex', engine: 'codex', model: 'gpt-5.5 (subscription)',
      run: makeCodexEngine(), traceMode: 'info', questionsRun: 0, consecutiveApiFailures: 0, aborted: false,
    });
  }
  if (ENGINES.includes('anthropic')) {
    if (!process.env.ANTHROPIC_API_KEY) {
      setupFailures.push({ engine: 'anthropic', error: 'ANTHROPIC_API_KEY is not set' });
    } else {
      try {
        for (const model of ANTHROPIC_MODELS) {
          targets.push({
            id: `anthropic:${model}`, label: model, engine: 'anthropic', model,
            run: await makeAnthropicEngine(model), traceMode: 'full', questionsRun: 0,
            consecutiveApiFailures: 0, aborted: false,
          });
        }
      } catch (error) {
        setupFailures.push({ engine: 'anthropic', error: `engine setup failed: ${error.message}` });
      }
    }
  }
  if (ENGINES.includes('cursor')) {
    if (!process.env.CURSOR_API_KEY) {
      setupFailures.push({ engine: 'cursor', error: 'CURSOR_API_KEY is not set' });
    } else {
      try {
        const cursorHarness = await prepareCursorHarness();
        const { stdout: version } = await execFileP(cursorHarness.cursorAgentPath, ['--version'], { timeout: 15_000 });
        cursorHarness.version = version.trim();
        console.log(`Cursor preflight: ${cursorHarness.preflight.tools} exact Suzaku tools + args (${cursorHarness.version})`);
        for (const model of CURSOR_MODELS) {
          targets.push({
            id: `cursor:${model}`, label: model, engine: 'cursor', model,
            run: makeCursorEngine(model, cursorHarness), traceMode: 'full',
            engineVersion: cursorHarness.version, preflight: cursorHarness.preflight,
            questionsRun: 0, consecutiveApiFailures: 0, aborted: false,
          });
        }
      } catch (error) {
        setupFailures.push({ engine: 'cursor', error: `MCP preflight failed: ${error.message}` });
      }
    }
  }

  for (const failure of setupFailures) console.error(`setup failed [${failure.engine}]: ${failure.error}`);

  if (CANARY) {
    for (const target of targets) {
      console.log(`\n=== canary ${target.engine} — ${target.label} ===`);
      for (const q of canaryQuestions) {
        const result = await executeQuestion(target, q, { repeat: 0, canary: true });
        canaryRecords.push({
          engine: target.engine, model: target.model, question: q.id, verdict: result.verdict,
          runError: result.runError ?? null, boundaryViolation: result.boundaryViolation === true,
          benchmarkEligible: result.benchmarkEligible ?? null, resolvedModel: result.resolvedModel ?? null,
          resolvedServiceTier: result.resolvedServiceTier ?? null, usage: result.usage ?? {},
          benchmarkIneligibleReason: result.benchmarkIneligibleReason ?? null,
          cost: result.cost ?? null, costStatus: result.costStatus ?? null, rawSha256: result.rawSha256 ?? null,
        });
        const wiringFailure = Boolean(result.runError || result.boundaryViolation
          || (target.engine === 'cursor' && result.benchmarkEligible !== true));
        if (wiringFailure) {
          target.aborted = true;
          target.abortReason = `canary wiring failure on ${q.id}`;
          console.log(`⚠ aborting ${target.label}: ${target.abortReason}`);
          break;
        }
      }
    }
  }

  for (let repeat = 1; repeat <= REPEAT; repeat += 1) {
    try { await refreshContext(); } catch (error) {
      setupFailures.push({ engine: 'ground-truth', error: `repeat ${repeat} context: ${error.message}` });
      break;
    }
    const epochAtRun = vars.currentEpoch ?? null;
    const runSets = new Map();
    for (const target of targets) {
      const runSet = {
        label: target.label, engine: target.engine, model: target.model, repeat, epochAtRun,
        results: [], aborted: target.aborted, abortReason: target.abortReason ?? null, invalidReason: null,
        engineVersion: target.engineVersion ?? null, preflight: target.preflight ?? null,
      };
      runSets.set(target.id, runSet);
      allRuns.push(runSet);
    }
    if (epochAtRun !== initialEpoch) {
      const message = `epoch drift before repeat ${repeat}: batch=${initialEpoch}, now=${epochAtRun}`;
      console.warn(`⚠ ${message}`);
      if (BENCHMARK) {
        for (const runSet of runSets.values()) { runSet.aborted = true; runSet.invalidReason = message; }
        epochDriftAbort = true;
        break;
      } else {
        for (const runSet of runSets.values()) runSet.driftWarning = message;
      }
    }

    console.log(`\n=== repeat ${repeat}/${REPEAT} — epoch ${epochAtRun} ===`);
    for (const q of questions) {
      for (const target of targets) {
        const runSet = runSets.get(target.id);
        if (target.aborted) {
          runSet.aborted = true;
          runSet.abortReason = target.abortReason ?? 'target aborted';
          continue;
        }
        const result = await executeQuestion(target, q, { repeat });
        runSet.results.push(result);
        if (isAuthFailure(result)) {
          target.consecutiveApiFailures += 1;
          if (target.consecutiveApiFailures >= 2) {
            target.aborted = true;
            target.abortReason = 'repeated API billing/auth failures';
            runSet.aborted = true;
            runSet.abortReason = target.abortReason;
            console.log(`⚠ aborting ${target.label}: ${target.abortReason}`);
          }
        } else {
          target.consecutiveApiFailures = 0;
        }
      }
    }

    let epochAfter = epochAtRun;
    let contextCheckError = null;
    try {
      await refreshContext();
      epochAfter = vars.currentEpoch ?? null;
    } catch (error) {
      contextCheckError = `post-repeat context check failed: ${error.message}`;
      console.warn(`⚠ ${contextCheckError}`);
      for (const runSet of runSets.values()) {
        if (BENCHMARK) runSet.invalidReason = contextCheckError;
        else runSet.driftWarning = [runSet.driftWarning, contextCheckError].filter(Boolean).join('; ');
      }
      if (BENCHMARK) epochDriftAbort = true;
    }
    if (!contextCheckError && epochAfter !== epochAtRun) {
      const message = `epoch drift during repeat ${repeat}: start=${epochAtRun}, end=${epochAfter}`;
      console.warn(`⚠ ${message}`);
      if (BENCHMARK) {
        for (const runSet of runSets.values()) runSet.invalidReason = message;
        epochDriftAbort = true;
        break;
      } else {
        for (const runSet of runSets.values()) {
          runSet.driftWarning = [runSet.driftWarning, message].filter(Boolean).join('; ');
        }
      }
    }
    if (BENCHMARK && contextCheckError) break;
  }
}

// ---------- report ----------
const resultsDir = new URL('./results/', here);
mkdirSync(resultsDir, { recursive: true });
const resultFiles = [];

for (const runSet of allRuns) {
  const { results } = runSet;
  const passed = results.filter((r) => r.verdict === 'PASS').length;
  const partial = results.filter((r) => r.verdict === 'PARTIAL').length;
  const failed = results.filter((r) => r.verdict === 'FAIL').length;
  const totalCost = results.reduce((s, r) => s + (r.cost ?? 0), 0);
  const suffix = TIER === 1
    ? 'tier1'
    : `tier2-${runSet.label.replace(/[^a-zA-Z0-9.-]+/g, '_')}-r${runSet.repeat}`;
  const baseName = `${runId}-${suffix}`;
  const jsonUrl = new URL(`./${baseName}.json`, resultsDir);
  const mdUrl = new URL(`./${baseName}.md`, resultsDir);
  writeFileSync(jsonUrl, JSON.stringify({
    runId, tier: TIER, engine: runSet.engine, model: runSet.model,
    engineVersion: runSet.engineVersion ?? null, preflight: runSet.preflight ?? null,
    repeat: runSet.repeat, epochAtRun: runSet.epochAtRun,
    aborted: runSet.aborted ?? false, abortReason: runSet.abortReason ?? null,
    invalidReason: runSet.invalidReason ?? null, driftWarning: runSet.driftWarning ?? null,
    vars: { ...vars, currentEpoch: runSet.epochAtRun ?? vars.currentEpoch }, results,
  }, null, 2));

  const md = [];
  md.push(`# Eval run ${runId} — ${suffix}`);
  md.push('');
  md.push(`**${passed} PASS / ${partial} PARTIAL / ${failed} FAIL** of ${results.length}${runSet.engine === 'anthropic' ? ` — total cost $${totalCost.toFixed(3)}` : ''}`);
  if (runSet.aborted || runSet.invalidReason) md.push(`\n**INVALID RUN:** ${runSet.invalidReason ?? runSet.abortReason ?? 'aborted'}`);
  else if (runSet.driftWarning) md.push(`\n**DRIFT WARNING:** ${runSet.driftWarning}`);
  md.push('');
  if (TIER === 2) {
    md.push('| question | verdict | tool groups | calls | facts | format | wall | cost |');
    md.push('|---|---|---|---|---|---|---|---|');
    for (const r of results) {
      const factStr = r.factDetails ? r.factDetails.map((f) => `${f.name}:${f.matched ? '✓' : '✗'}`).join(' ') : '';
      const costStr = r.costStatus === 'unverified'
        ? `unverified (${Math.round(tokCount(r.usage) / 1000)}k tok)`
        : (r.cost == null ? `${Math.round(tokCount(r.usage) / 1000)}k tok` : `$${r.cost.toFixed(4)}`);
      md.push(`| ${r.id} | ${r.verdict} | ${r.traceScore.groupsSatisfied}/${r.traceScore.groupsTotal}${r.traceScore.informational ? '*' : ''} | ${r.traceScore.calls} | ${factStr} | ${r.format.ok ? 'ok' : r.format.violations.join(', ')} | ${(r.wallMs / 1000).toFixed(1)}s | ${costStr} |`);
    }
    md.push('');
    for (const r of results) {
      md.push(`## ${r.id} — ${r.verdict}`);
      md.push('');
      md.push(`Trace: ${(r.trace ?? []).map((t) => `${t.kind ?? 'tool'}:${t.server ? `${t.server}:` : ''}${t.name}(${t.ms}ms${t.isError ? ',ERR' : ''})`).join(' → ') || '(no tool calls recorded)'}`);
      if (r.boundaryViolation) md.push(`\nBoundary violations: ${r.boundaryViolations.map((v) => `${v.code}:${v.detail}`).join(' | ')}`);
      if (r.runError) md.push(`\nError: ${r.runError}`);
      md.push('');
      md.push('Answer:');
      md.push('```');
      md.push((r.answer ?? '').slice(0, 2500));
      md.push('```');
      md.push('');
    }
  } else {
    md.push('| question | verdict | tool latency | wall |');
    md.push('|---|---|---|---|');
    for (const r of results) md.push(`| ${r.id} | ${r.verdict} | ${r.toolMs}ms | ${r.wallMs}ms |`);
  }
  writeFileSync(mdUrl, md.join('\n'));
  resultFiles.push({
    runSet,
    json: `results/${baseName}.json`, jsonSha256: sha256File(jsonUrl),
    markdown: `results/${baseName}.md`, markdownSha256: sha256File(mdUrl),
  });
  console.log(`\n[${runSet.label}] ${passed} PASS / ${partial} PARTIAL / ${failed} FAIL of ${results.length}${runSet.engine === 'anthropic' ? ` — cost $${totalCost.toFixed(3)}` : ''} → results/${baseName}.md`);
}

// Cross-model/repeat comparison. Only complete, non-drifted repetitions count.
if (TIER === 2) {
  const grouped = new Map();
  for (const runSet of allRuns) {
    const key = `${runSet.engine}:${runSet.model}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(runSet);
  }
  if (grouped.size > 0) {
    console.log('\n=== aggregate comparison ===');
    for (const runSets of grouped.values()) {
      const summary = aggregateRunSets(runSets, questions.length);
      const costPerPass = summary.costPerPass == null ? 'unverified/sub' : `$${summary.costPerPass.toFixed(4)}`;
      console.log(`${pad(runSets[0].label, 26)} valid ${summary.validRuns}/${summary.attemptedRuns} (${(summary.validRunRate * 100).toFixed(0)}%) · boundary ${summary.boundaryRuns}/${summary.attemptedRuns} (${(summary.boundaryRunRate * 100).toFixed(0)}%) · PASS ${summary.passed}/${summary.questions} · median ${summary.medianWallMs == null ? '—' : `${(summary.medianWallMs / 1000).toFixed(1)}s`} · p95 ${summary.p95WallMs == null ? '—' : `${(summary.p95WallMs / 1000).toFixed(1)}s`} · cost/PASS ${costPerPass}`);
      const valid = runSets.filter((run) => isValidRunSet(run, questions.length));
      const flips = [];
      for (const q of questions) {
        const results = valid.map((run) => run.results.find((result) => result.id === q.id)).filter(Boolean);
        const passes = results.filter((result) => result.verdict === 'PASS').length;
        if (passes > 0 && passes < results.length) flips.push(`${q.id}:${passes}/${results.length}`);
      }
      console.log(`  flips: ${flips.join(', ') || 'none'}`);
    }
  }
}

// ---------- benchmarks.md ----------
if (BENCHMARK && TIER === 2) {
  const benchPath = new URL('./benchmarks.md', here);
  if (!existsSync(benchPath)) {
    writeFileSync(benchPath, [
      '# Monitor-bot eval benchmarks',
      '',
      'One row per model per run, appended by `pnpm eval -- --tier 2 --benchmark …`.',
      'Raw per-question reports live in `eval/results/` (gitignored, local only).',
      'Suite = which questions ran (`fast` skips slow/event-scan questions). Codex engine',
      'latencies include OpenClaw session bootstrap; cost `sub` = flat subscription (no per-call price).',
      '',
      '| date (UTC) | engine | model | suite | questions | PASS/PARTIAL/FAIL | facts | median wall | p95 wall | cost | notes |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      '',
    ].join('\n'));
  }
  for (const runSet of allRuns) {
    if (runSet.engine === 'none') continue;
    if (!isValidRunSet(runSet, questions.length)) {
      const failedResult = runSet.results.find((result) => result.runError
        || result.boundaryViolation || result.benchmarkEligible === false);
      const reason = runSet.invalidReason ?? runSet.abortReason
        ?? failedResult?.runError
        ?? (failedResult?.boundaryViolation ? 'MCP boundary violation' : null)
        ?? failedResult?.benchmarkIneligibleReason
        ?? `incomplete ${runSet.results.length}/${questions.length}`;
      console.log(`benchmarks.md ✗ ${runSet.label} r${runSet.repeat} skipped (${reason})`);
      continue;
    }
    const { results } = runSet;
    const boundaryViolations = results.filter((r) => r.boundaryViolation).length;
    const passed = results.filter((r) => r.verdict === 'PASS').length;
    const partial = results.filter((r) => r.verdict === 'PARTIAL').length;
    const failed = results.filter((r) => r.verdict === 'FAIL').length;
    const factsTotal = results.reduce((s, r) => s + (r.facts?.total ?? 0), 0);
    const factsOk = results.reduce((s, r) => s + (r.facts?.matched ?? 0), 0);
    const walls = results.map((r) => r.wallMs).sort((a, b) => a - b);
    const p95 = percentile(walls, 0.95);
    const totalCost = results.reduce((s, r) => s + (r.cost ?? 0), 0);
    const cursorCostVerified = runSet.engine === 'cursor'
      && results.every((result) => result.costStatus === 'verified' && Number.isFinite(result.cost));
    const costStr = runSet.engine === 'codex' ? 'sub'
      : (runSet.engine === 'cursor' && !cursorCostVerified ? 'unverified' : `$${totalCost.toFixed(3)}`);
    const suite = `${FAST ? 'fast' : 'full'}@v${spec.suiteVersion ?? 1}${ONLY ? `(only:${ONLY.join('+')})` : ''}`;
    const cursorNote = runSet.engine === 'cursor'
      ? `; resolved ${[...new Set(results.map((r) => r.resolvedModel).filter(Boolean))].join('+') || '?'} tier ${[...new Set(results.map((r) => r.resolvedServiceTier).filter(Boolean))].join('+') || '?'}; boundary violations ${boundaryViolations}; cost ${cursorCostVerified ? 'verified' : 'unverified'}`
      : '';
    const row = `| ${runId.slice(0, 10)} | ${runSet.engine} | ${runSet.label} | ${suite} | ${results.length} | ${passed}/${partial}/${failed} | ${factsOk}/${factsTotal} | ${(percentile(walls, 0.5) / 1000).toFixed(1)}s | ${(p95 / 1000).toFixed(1)}s | ${costStr} | epoch ${runSet.epochAtRun ?? '?'}; repeat ${runSet.repeat}/${REPEAT}; ${gitState.sha?.slice(0, 8) ?? 'no-sha'}${cursorNote} |`;
    appendFileSync(benchPath, `${row}\n`);
    console.log(`benchmarks.md ← ${runSet.label}`);
  }
}

// One compact batch manifest makes the comparison reproducible without committing
// raw answers/traces. It is written for every tier-2 attempt, including setup,
// canary, auth, boundary, and epoch-drift failures.
if (TIER === 2) {
  const usageKeys = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'total_tokens'];
  const aggregateUsage = (results) => Object.fromEntries(usageKeys.map((key) => [
    key, results.reduce((sum, result) => sum + Number(result.usage?.[key] ?? 0), 0),
  ]));
  const compactRuns = allRuns.map((runSet) => {
    const results = runSet.results;
    const report = resultFiles.find((item) => item.runSet === runSet);
    const costs = results.map((result) => result.cost).filter(Number.isFinite);
    const completeCost = results.length > 0 && costs.length === results.length;
    const cursorVerified = runSet.engine !== 'cursor'
      || (results.length > 0 && results.every((result) => result.costStatus === 'verified' && Number.isFinite(result.cost)));
    return {
      engine: runSet.engine,
      model: runSet.model,
      engineVersion: runSet.engineVersion ?? null,
      preflight: runSet.preflight ?? null,
      repeat: runSet.repeat,
      epochAtRun: runSet.epochAtRun,
      resolvedModels: [...new Set(results.map((result) => result.resolvedModel).filter(Boolean))],
      resolvedServiceTiers: [...new Set(results.map((result) => result.resolvedServiceTier).filter(Boolean))],
      verdicts: Object.fromEntries(results.map((result) => [result.id, result.verdict])),
      facts: {
        matched: results.reduce((sum, result) => sum + Number(result.facts?.matched ?? 0), 0),
        total: results.reduce((sum, result) => sum + Number(result.facts?.total ?? 0), 0),
      },
      questionResults: Object.fromEntries(results.map((result) => [result.id, {
        verdict: result.verdict,
        facts: {
          matched: result.facts?.matched ?? 0,
          total: result.facts?.total ?? 0,
          checks: (result.factDetails ?? []).map((fact) => ({ name: fact.name, matched: fact.matched })),
        },
        runError: result.runError ?? null,
        boundaryViolation: result.boundaryViolation === true,
        benchmarkEligible: result.benchmarkEligible ?? null,
        benchmarkIneligibleReason: result.benchmarkIneligibleReason ?? null,
      }])),
      wallMs: {
        median: percentile(results.map((result) => result.wallMs), 0.5),
        p95: percentile(results.map((result) => result.wallMs), 0.95),
      },
      usage: aggregateUsage(results),
      cost: cursorVerified && completeCost ? costs.reduce((sum, cost) => sum + cost, 0) : null,
      costStatus: runSet.engine === 'codex' ? 'subscription' : (cursorVerified && completeCost ? 'verified' : 'unverified'),
      boundaryViolations: results.filter((result) => result.boundaryViolation).length,
      rawStreamSha256: results.map((result) => result.rawSha256).filter(Boolean),
      aborted: runSet.aborted ?? false,
      abortReason: runSet.abortReason ?? null,
      invalidReason: runSet.invalidReason ?? null,
      driftWarning: runSet.driftWarning ?? null,
      report: report ? {
        json: report.json, jsonSha256: report.jsonSha256,
        markdown: report.markdown, markdownSha256: report.markdownSha256,
      } : null,
    };
  });
  const suite = `${FAST ? 'fast' : 'full'}@v${spec.suiteVersion ?? 1}${ONLY ? `(only:${ONLY.join('+')})` : ''}`;
  const definingFiles = {
    'eval/questions.json': new URL('./questions.json', here),
    'eval/scoring.mjs': new URL('./scoring.mjs', here),
    'eval/run-evals.mjs': new URL('./run-evals.mjs', here),
    'eval/cursor.mjs': new URL('./cursor.mjs', here),
    'eval/reproducibility.mjs': new URL('./reproducibility.mjs', here),
    'eval/cursor-pricing.json': new URL('./cursor-pricing.json', here),
    'deploy/openclaw/SOUL.md': new URL('../deploy/openclaw/SOUL.md', here),
    'deploy/openclaw/EPOCHS.md': new URL('../deploy/openclaw/EPOCHS.md', here),
    'root/bin/cli.js': join(rootDir, 'bin/cli.js'),
    'root/dist/cli.js': join(rootDir, 'dist/cli.js'),
    'mcp/dist/server.js': join(mcpDir, 'dist/server.js'),
  };
  const manifest = {
    runId,
    startedAt: batchStartedAt,
    completedAt: new Date().toISOString(),
    gitSha: gitState.sha,
    dirty: gitState.dirty,
    trackedDirty: gitState.trackedDirty,
    node: process.version,
    tier: TIER,
    suite,
    suiteVersion: spec.suiteVersion ?? 1,
    requested: {
      engines: ENGINES,
      anthropicModels: ANTHROPIC_MODELS,
      cursorModels: CURSOR_MODELS,
      repeat: REPEAT,
      canary: CANARY,
      benchmark: BENCHMARK,
    },
    initialEpoch,
    epochDriftAbort,
    setupFailures,
    canaries: canaryRecords,
    hashes: {
      files: Object.fromEntries(Object.entries(definingFiles).map(([name, url]) => [name, sha256File(url)])),
      mcpToolSchemas: sha256Text(JSON.stringify(mcpTools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema })))),
    },
    repetitions: compactRuns,
  };
  const manifestsDir = new URL('./manifests/', here);
  mkdirSync(manifestsDir, { recursive: true });
  const manifestUrl = new URL(`./${runId}.json`, manifestsDir);
  writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest ← manifests/${runId}.json`);
}

await gtConn.client.close();
if (agentConn) await agentConn.client.close();
const anyFail = setupFailures.length > 0
  || epochDriftAbort
  || allRuns.some((run) => run.aborted || run.invalidReason || run.results.some((result) => result.verdict === 'FAIL'));
process.exit(anyFail ? 1 : 0);
