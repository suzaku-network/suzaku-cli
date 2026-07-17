#!/usr/bin/env node
// Monitor-bot eval runner.
//   --tier 1                 deterministic: ground-truth tools only, no LLM, $0
//   --tier 2                 LLM-in-loop, engine selectable:
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
//   --benchmark              append a dated row per model/engine to eval/benchmarks.md
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

const execFileP = promisify(execFile);

// ---------- flags ----------
const argv = process.argv.slice(2);
function flagValue(name, dflt = null) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : dflt;
}
const TIER = Number(flagValue('--tier', '1'));
const ONLY = flagValue('--only') ? flagValue('--only').split(',').map((s) => s.trim()) : null;
const FAST = argv.includes('--fast');
const ENGINE = flagValue('--engine', 'anthropic');
const MODELS = flagValue('--models')
  ? flagValue('--models').split(',').map((s) => s.trim())
  : [flagValue('--model', 'claude-sonnet-4-6')];
const BENCHMARK = argv.includes('--benchmark');
if (TIER !== 1 && TIER !== 2) {
  console.error('usage: run-evals.mjs --tier 1|2 [--engine anthropic|codex|cursor] [--models a,b] [--only ids] [--fast] [--benchmark]');
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
const SLOW_TOOLS = ['deployment_heartbeat', 'middleware_operator_dashboard', 'middleware_network_overview', 'discover_network', 'rewards_get_events', 'rewards_epoch_diagnosis', 'middleware_stake_matrix', 'middleware_epoch_status', 'middleware_get_validator_balances', 'middleware_uptime_report'];

// cursor engine — ⚠ confirm the exact model id via `cursor-agent models` at smoke
const CURSOR_MODEL_DEFAULT = 'composer-2.5';
const CURSOR_RATE_CARDS = {
  'composer-2.5': { input: 0.5, output: 2.5, calibrated: false },
  'composer-2.5-fast': { input: 3, output: 15, calibrated: false },
};
const CURSOR_FLAGS = ['--output-format', 'stream-json', '--approve-mcps', '--trust'];

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
const agentConn = TIER === 2 && ENGINE === 'anthropic' ? makeMcpConnection(30000) : null;
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
  const res = await callGt(ctx.tool, args);
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
    console.error(`context '${ctx.id}': could not extract a number (got ${JSON.stringify(value)})`);
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
    const res = await callGt(gt.tool, args, gt.timeoutMs ?? DEFAULT_TOOL_TIMEOUT);
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
      maxToolCalls: q.maxToolCalls ?? null,
      forbiddenTools: q.forbiddenTools ?? [],
    })
    : { ...scoreTrace(scoringTrace, { expectedTools: [], maxToolCalls: null, forbiddenTools: q.forbiddenTools ?? [] }), informational: true };
  const format = scoreFormat(run.answer);
  let factsSummary;
  const factDetails = [];
  if (q.safety) {
    factsSummary = scoreSafety(run.answer, q);
    factDetails.push(
      { name: 'refusal-early', matched: factsSummary.refusalOk },
      { name: 'no-leak', matched: !factsSummary.leaked },
      { name: 'no-false-success', matched: !factsSummary.falseSuccess },
    );
  } else {
    const gts = await fetchGroundTruth(q); // after the answer, so dedup can't pre-warm the engine
    let total = 0;
    let matched = 0;
    for (const g of gts) {
      for (const f of g.facts) {
        if (f.spec.answerMatch === false) continue;
        total += 1;
        const ok = f.value !== undefined && matchFact(run.answer, f.spec, f.value);
        if (ok) matched += 1;
        factDetails.push({ name: f.spec.name, value: previewValue(f.value), via: f.via, matched: ok });
      }
    }
    factsSummary = { total, matched };
  }
  const v = run.runError || run.boundaryViolation
    ? 'FAIL'
    : verdict({ trace: traceScore, facts: factsSummary, format, safety: q.safety === true });
  return { verdict: v, traceScore, format, facts: factsSummary, factDetails };
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
      trace.push({ name: t.name, ms: res.ms, isError: !res.ok });
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
      trace: trace.map((t) => ({ name: t.name, ms: t.ms, isError: t.isError })),
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
      const needsToolEvidence = (q.expectedTools ?? []).length > 0;
      const benchmarkEligible = !boundary.boundaryViolation
        && parsed.resolvedModel != null
        && (!needsToolEvidence || boundary.argsVisible === true);
      return {
        answer: parsed.answer,
        runError,
        authError,
        stopReason: boundary.boundaryViolation ? 'boundary-violation' : (runError ? 'error' : 'ok'),
        usage: parsed.usage ?? {},
        wallMs: parsed.durationMs ?? Math.round(performance.now() - t0),
        trace: parsed.trace,
        scoringTrace,
        cost: null,
        costStatus: 'unverified',
        rateCard: CURSOR_RATE_CARDS[model] ?? null,
        resolvedModel: parsed.resolvedModel,
        cursorInit: parsed.init,
        rawSha256: parsed.rawSha256,
        toolArgsVisible: boundary.argsVisible,
        benchmarkEligible,
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
function median(nums) {
  if (nums.length === 0) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const allRuns = []; // { label, engine, model, results }

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
  allRuns.push({ label: 'tier1', engine: 'none', model: null, results });
}

if (TIER === 2) {
  const engines = ENGINE === 'codex'
    ? [{ label: 'gpt-5.5-codex', engine: 'codex', model: 'gpt-5.5 (subscription)', run: makeCodexEngine(), traceMode: 'info' }]
    : [];
  if (ENGINE === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('tier 2 --engine anthropic needs ANTHROPIC_API_KEY in the environment');
      process.exit(2);
    }
    for (const model of MODELS) {
      engines.push({ label: model, engine: 'anthropic', model, run: await makeAnthropicEngine(model), traceMode: 'full' });
    }
  }
  if (ENGINE === 'cursor') {
    if (!process.env.CURSOR_API_KEY) {
      console.error('tier 2 --engine cursor needs CURSOR_API_KEY in the environment');
      process.exit(2);
    }
    let cursorHarness;
    try {
      cursorHarness = await prepareCursorHarness();
      const { stdout: version } = await execFileP(cursorHarness.cursorAgentPath, ['--version'], { timeout: 15_000 });
      cursorHarness.version = version.trim();
      console.log(`Cursor preflight: ${cursorHarness.preflight.tools} exact Suzaku tools + args (${cursorHarness.version})`);
    } catch (error) {
      console.error(`Cursor MCP preflight failed before paid inference: ${error.message}`);
      process.exit(2);
    }
    // default to Composer when no model was explicitly requested
    const cursorModels = (flagValue('--models') || flagValue('--model')) ? MODELS : [CURSOR_MODEL_DEFAULT];
    for (const model of cursorModels) {
      engines.push({
        label: model, engine: 'cursor', model,
        run: makeCursorEngine(model, cursorHarness), traceMode: 'full',
        engineVersion: cursorHarness.version, preflight: cursorHarness.preflight,
      });
    }
  }

  for (const eng of engines) {
    console.log(`\n=== engine ${eng.engine} — ${eng.label} ===`);
    const results = [];
    let consecutiveApiFailures = 0;
    let aborted = false;
    for (const q of questions) {
      if (aborted) break;
      // between codex questions: settle, then require the container to be responsive
      // (fork-able) before creating the next job — otherwise a still-grinding previous
      // turn cascades into exec failures for everything that follows
      if (eng.engine === 'codex' && results.length > 0) {
        await new Promise((r) => setTimeout(r, 8_000));
        const readyDeadline = Date.now() + 5 * 60_000;
        let ready = false;
        while (Date.now() < readyDeadline) {
          try {
            await botExec('echo ok', 30_000, 1);
            ready = true;
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 20_000));
          }
        }
        if (!ready) console.log('⚠ container unresponsive for 5 min — proceeding anyway');
      }
      const run = await eng.run(q);
      const score = await scoreRun(q, run, eng.traceMode);
      results.push({ id: q.id, ...score, ...run, trace: run.trace, answer: run.answer });
      const factStr = q.safety
        ? `refusal=${score.facts.refusalOk} leak=${score.facts.leaked} fabricated=${score.facts.falseSuccess}`
        : `facts ${score.facts.matched}/${score.facts.total}`;
      const costStr = run.costStatus === 'unverified'
        ? `cost=unverified ${Math.round(tokCount(run.usage) / 1000)}k tok`
        : (run.cost == null ? `${Math.round(tokCount(run.usage) / 1000)}k tok` : `$${run.cost.toFixed(4)}`);
      const errStr = score.traceScore.erroredCalls > 0 ? ` errTools=${score.traceScore.erroredCalls}` : '';
      console.log(`${pad(score.verdict, 8)} ${pad(q.id, 26)} tools ${score.traceScore.groupsSatisfied}/${score.traceScore.groupsTotal}${score.traceScore.informational ? '*' : ''} calls=${score.traceScore.calls}${errStr} ${factStr} fmt=${score.format.ok ? 'ok' : score.format.violations.join('+')} ${(run.wallMs / 1000).toFixed(1)}s ${costStr}`);
      if (run.runError) console.log(`         ↳ error: ${run.runError.slice(0, 300)}`);
      if (run.boundaryViolation) {
        console.log(`         ↳ BOUNDARY FAIL: ${run.boundaryViolations.map((v) => `${v.code}:${v.detail}`).join(' | ').slice(0, 500)}`);
      }
      // a dead key / empty balance fails every remaining question in 0s — abort the
      // model instead of logging 19 billing errors and polluting the benchmark table
      // structured authError (cursor) OR the anthropic billing-error phrasing — NOT bare
      // domain words, which would false-trip on legitimate codex/anthropic op failures
      if (run.runError && (run.authError || /credit balance|billing|authentication_error|invalid x-api-key/i.test(run.runError))) {
        consecutiveApiFailures += 1;
        if (consecutiveApiFailures >= 2) {
          console.log(`⚠ aborting ${eng.label}: repeated API billing/auth failures — no benchmark row will be written for this model`);
          aborted = true;
        }
      } else {
        consecutiveApiFailures = 0;
      }
    }
    allRuns.push({
      label: eng.label, engine: eng.engine, model: eng.model, results, aborted,
      engineVersion: eng.engineVersion ?? null, preflight: eng.preflight ?? null,
    });
  }
}

// ---------- report ----------
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const resultsDir = new URL('./results/', here);
mkdirSync(resultsDir, { recursive: true });

for (const runSet of allRuns) {
  const { results } = runSet;
  const passed = results.filter((r) => r.verdict === 'PASS').length;
  const partial = results.filter((r) => r.verdict === 'PARTIAL').length;
  const failed = results.filter((r) => r.verdict === 'FAIL').length;
  const totalCost = results.reduce((s, r) => s + (r.cost ?? 0), 0);
  const suffix = TIER === 1 ? 'tier1' : `tier2-${runSet.label.replace(/[^a-zA-Z0-9.-]+/g, '_')}`;
  const baseName = `${runId}-${suffix}`;
  writeFileSync(new URL(`./${baseName}.json`, resultsDir), JSON.stringify({
    runId, tier: TIER, engine: runSet.engine, model: runSet.model,
    engineVersion: runSet.engineVersion ?? null, preflight: runSet.preflight ?? null,
    vars, results,
  }, null, 2));

  const md = [];
  md.push(`# Eval run ${runId} — ${suffix}`);
  md.push('');
  md.push(`**${passed} PASS / ${partial} PARTIAL / ${failed} FAIL** of ${results.length}${runSet.engine === 'anthropic' ? ` — total cost $${totalCost.toFixed(3)}` : ''}`);
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
  writeFileSync(new URL(`./${baseName}.md`, resultsDir), md.join('\n'));
  console.log(`\n[${runSet.label}] ${passed} PASS / ${partial} PARTIAL / ${failed} FAIL of ${results.length}${runSet.engine === 'anthropic' ? ` — cost $${totalCost.toFixed(3)}` : ''} → results/${baseName}.md`);
}

// cross-model comparison (multiple tier-2 runs)
if (TIER === 2 && allRuns.length > 1) {
  console.log(`\n${pad('question', 20)} ${allRuns.map((r) => pad(r.label, 26)).join(' ')}`);
  for (let i = 0; i < questions.length; i++) {
    const cells = allRuns.map((r) => {
      const res = r.results[i];
      if (!res) return pad('— (aborted)', 26);
      const costStr = res.cost == null ? '' : ` $${res.cost.toFixed(3)}`;
      return pad(`${res.verdict} ${(res.wallMs / 1000).toFixed(0)}s${costStr}`, 26);
    });
    console.log(`${pad(questions[i].id, 20)} ${cells.join(' ')}`);
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
    if (runSet.aborted) {
      console.log(`benchmarks.md ✗ ${runSet.label} skipped (run aborted on API errors)`);
      continue;
    }
    const { results } = runSet;
    const boundaryViolations = results.filter((r) => r.boundaryViolation).length;
    if (runSet.engine === 'cursor' && results.length > 0 && boundaryViolations === results.length) {
      console.log(`benchmarks.md ✗ ${runSet.label} skipped (every question violated the MCP boundary; harness wiring invalid)`);
      continue;
    }
    if (runSet.engine === 'cursor' && results.some((r) => r.benchmarkEligible !== true)) {
      console.log(`benchmarks.md ✗ ${runSet.label} skipped (resolved model/tool arguments were not observable on every applicable run)`);
      continue;
    }
    const passed = results.filter((r) => r.verdict === 'PASS').length;
    const partial = results.filter((r) => r.verdict === 'PARTIAL').length;
    const failed = results.filter((r) => r.verdict === 'FAIL').length;
    const factsTotal = results.reduce((s, r) => s + (r.facts?.total ?? 0), 0);
    const factsOk = results.reduce((s, r) => s + (r.facts?.matched ?? 0), 0);
    const walls = results.map((r) => r.wallMs).sort((a, b) => a - b);
    const p95 = walls[Math.min(walls.length - 1, Math.ceil(0.95 * walls.length) - 1)];
    const totalCost = results.reduce((s, r) => s + (r.cost ?? 0), 0);
    const costStr = runSet.engine === 'codex' ? 'sub'
      : (runSet.engine === 'cursor' ? 'unverified' : `$${totalCost.toFixed(3)}`);
    const suite = `${FAST ? 'fast' : 'full'}@v${spec.suiteVersion ?? 1}${ONLY ? `(only:${ONLY.join('+')})` : ''}`;
    const cursorNote = runSet.engine === 'cursor'
      ? `; resolved ${[...new Set(results.map((r) => r.resolvedModel).filter(Boolean))].join('+') || '?'}; boundary violations ${boundaryViolations}; cost unverified`
      : '';
    const row = `| ${runId.slice(0, 10)} | ${runSet.engine} | ${runSet.label} | ${suite} | ${results.length} | ${passed}/${partial}/${failed} | ${factsOk}/${factsTotal} | ${(median(walls) / 1000).toFixed(1)}s | ${(p95 / 1000).toFixed(1)}s | ${costStr} | epoch ${vars.currentEpoch ?? '?'}${cursorNote} |`;
    appendFileSync(benchPath, `${row}\n`);
    console.log(`benchmarks.md ← ${runSet.label}`);
  }
}

await gtConn.client.close();
if (agentConn) await agentConn.client.close();
const anyFail = allRuns.some((r) => r.results.some((x) => x.verdict === 'FAIL'));
process.exit(anyFail ? 1 : 0);
