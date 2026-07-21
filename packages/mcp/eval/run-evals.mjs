#!/usr/bin/env node
// Monitor-bot eval runner.
//   --tier 1                 deterministic: ground-truth tools only, no LLM, $0
//   --tier 2                 LLM-in-loop, engine selectable:
//     --engines a,b          interleave multiple providers in one drift-controlled batch.
//     --anthropic-models …   provider-specific model lists (with --engines).
//     --repeat N --canary    repeat each target; gate wiring before paid suite calls.
//     --canary-only          run the operators wiring check once per target, then stop.
//     --engine anthropic     (default) Anthropic API tool-runner; needs ANTHROPIC_API_KEY.
//                            --model <id> or --models a,b,c to compare models.
//     --engine codex         drives the LIVE bot's primary engine (gpt-5.5 via the
//                            Codex subscription) through one-shot OpenClaw cron jobs.
//                            Nothing is posted to any chat: the agent writes its answer
//                            to a workspace file, jobs self-delete. Needs the deploy
//                            compose stack running locally. No $ cost (flat sub).
//   --benchmark              append rows only for a commit-ready batch and write its canonical manifest
//   --only id1,id2 · --fast (skip slow questions)
//
// Results: raw reports and every tier-2 attempt manifest are gitignored under
// eval/results/. Commit-ready benchmark manifests are also copied to eval/manifests/.

import {
  readFileSync, mkdirSync, writeFileSync, existsSync, appendFileSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  parseToolJson, getPath, deepFind, resolveFact, saneValue,
  matchFact, scoreTrace, scoreFormat, scoreSafety, computeCost, verdict, validateFactSpec,
} from './scoring.mjs';
import {
  aggregateRunSets, aggregateUsage, canaryAllowsScheduling, formatUsageCost,
  hasCompleteUsage, interleavedSchedule, isCommitReadyBenchmark, isValidRunSet,
  manifestDestinations, percentile, summarizeUsage, usageTokenCount, validateCanaryPolicy,
} from './reproducibility.mjs';

const execFileP = promisify(execFile);
const here = new URL('.', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('./questions.json', here), 'utf8'));

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
const REPEAT = Number(flagValue('--repeat', '1'));
const CANARY = argv.includes('--canary');
const CANARY_ONLY = argv.includes('--canary-only');
const RUN_CANARY = CANARY || CANARY_ONLY;
const BENCHMARK = argv.includes('--benchmark');
const NO_BUILD = argv.includes('--no-build');
if (TIER !== 1 && TIER !== 2) {
  console.error('usage: run-evals.mjs --tier 1|2 [--engine anthropic|codex|--engines anthropic,codex] [--models a,b|--anthropic-models a,b] [--repeat N] [--canary|--canary-only] [--only ids] [--fast] [--benchmark] [--no-build]');
  process.exit(2);
}
if (!Number.isInteger(REPEAT) || REPEAT < 1) {
  console.error('--repeat must be a positive integer');
  process.exit(2);
}
const unknownEngines = ENGINES.filter((engine) => !['anthropic', 'codex'].includes(engine));
if (unknownEngines.length > 0) {
  console.error(`unknown engines: ${unknownEngines.join(', ')}`);
  process.exit(2);
}
if (flagValue('--engines') && (flagValue('--models') || flagValue('--model'))) {
  console.error('use --anthropic-models with --engines; legacy --models is ambiguous');
  process.exit(2);
}
if (NO_BUILD && BENCHMARK) {
  console.error('--no-build is not allowed with --benchmark; benchmark runs must rebuild both the root CLI and MCP server');
  process.exit(2);
}

const canaryPolicyErrors = validateCanaryPolicy({
  tier: TIER,
  canary: CANARY,
  canaryOnly: CANARY_ONLY,
  benchmark: BENCHMARK,
  only: ONLY,
  repeat: REPEAT,
  repeatExplicit: argv.includes('--repeat'),
});
if (canaryPolicyErrors.length > 0) {
  for (const error of canaryPolicyErrors) console.error(error);
  process.exit(2);
}

const knownQuestionIds = new Set(spec.questions.map((question) => question.id));
const unknownQuestionIds = (ONLY ?? []).filter((id) => !knownQuestionIds.has(id));
if (unknownQuestionIds.length > 0) {
  console.error(`--only references unknown question: ${unknownQuestionIds.join(', ')}`);
  process.exit(2);
}
const questions = spec.questions
  .filter((q) => (ONLY ? ONLY.includes(q.id) : true))
  .filter((q) => (FAST ? !q.slow : true))
  .filter((q) => (TIER === 1 ? !q.safety || (q.groundTruth ?? []).length > 0 : true));
if (questions.length === 0) {
  console.error('question selection is empty');
  process.exit(2);
}

const requestedTargetIds = [
  ...(ENGINES.includes('codex') ? ['codex:gpt-5.5-codex'] : []),
  ...(ENGINES.includes('anthropic') ? ANTHROPIC_MODELS.map((model) => `anthropic:${model}`) : []),
];

function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}
function sha256File(url) {
  try { return sha256Text(readFileSync(url)); } catch { return null; }
}

// $ per MTok [input, output]; cache write = 1.25x input, cache read = 0.1x input.
// Sonnet 5 has official introductory pricing through 2026-08-31; automatically
// use the published post-intro card for runs on/after 2026-09-01 UTC.
const SONNET_5_INTRO_END = '2026-09-01T00:00:00Z';
const SONNET_5_PRICE = Date.now() < Date.parse(SONNET_5_INTRO_END) ? [2, 10] : [3, 15];
const PRICES = {
  'claude-sonnet-4-6': [3, 15],
  'claude-sonnet-5': SONNET_5_PRICE,
  'claude-haiku-4-5': [1, 5],
  'claude-opus-4-8': [5, 25],
};
const DEFAULT_TOOL_TIMEOUT = 120_000;
const SLOW_TOOLS = ['deployment_heartbeat', 'middleware_operator_dashboard', 'middleware_network_overview', 'discover_network', 'rewards_get_events', 'rewards_epoch_diagnosis', 'middleware_stake_matrix', 'middleware_epoch_status', 'middleware_get_validator_balances', 'middleware_uptime_report'];

async function main() {
  const rootDir = new URL('../../../', import.meta.url).pathname;
  const mcpDir = new URL('../', import.meta.url).pathname;
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const batchStartedAt = new Date().toISOString();
  let gitState = { sha: null, trackedDirty: null, dirty: null };
  let gtConn = null;
  let agentConn = null;
  let mcpTools = [];
  let toolByName = new Map();
  const vars = { ...spec.deployment };
  let initialEpoch = null;
  const allRuns = [];
  const setupFailures = [];
  const canaryRecords = [];
  const resultFiles = [];
  let targets = [];
  let setupComplete = false;
  let epochDriftAbort = false;
  let batchAborted = false;
  let batchAbortReason = null;
  let attemptFailure = null;
  let finalized = false;

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

  function benchmarkReady() {
    return isCommitReadyBenchmark({
      benchmarkRequested: BENCHMARK,
      setupComplete,
      setupFailures,
      canaryRequested: RUN_CANARY,
      canaries: canaryRecords,
      epochDriftAbort,
      batchAborted,
      runSets: allRuns,
      questionIds: questions.map((question) => question.id),
      targetIds: requestedTargetIds,
      repeats: REPEAT,
    });
  }

  function compactRun(runSet) {
    const results = runSet.results;
    const report = resultFiles.find((item) => item.runSet === runSet);
    const totals = summarizeUsage(results);
    return {
      targetId: runSet.targetId,
      engine: runSet.engine,
      model: runSet.model,
      repeat: runSet.repeat,
      epochAtRun: runSet.epochAtRun,
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
        timedOut: result.timedOut === true,
        authError: result.authError === true,
        usage: result.usage ?? null,
      }])),
      wallMs: {
        median: percentile(results.map((result) => result.wallMs).filter(Number.isFinite), 0.5),
        p95: percentile(results.map((result) => result.wallMs).filter(Number.isFinite), 0.95),
      },
      usage: totals.usage,
      cost: totals.cost,
      costDisplay: runSet.engine === 'codex'
        ? 'subscription'
        : (totals.cost == null ? null : `$${totals.cost.toFixed(6)}`),
      aborted: runSet.aborted ?? false,
      abortReason: runSet.abortReason ?? null,
      invalidReason: runSet.invalidReason ?? null,
      driftWarning: runSet.driftWarning ?? null,
      report: report ? {
        json: report.json, jsonSha256: report.jsonSha256,
        markdown: report.markdown, markdownSha256: report.markdownSha256,
      } : null,
    };
  }

  function createManifest(exitCode, commitReady) {
    const suite = `${FAST ? 'fast' : 'full'}@v${spec.suiteVersion ?? 1}${ONLY ? `(only:${ONLY.join('+')})` : ''}`;
    const definingFiles = {
      'eval/questions.json': new URL('./questions.json', here),
      'eval/scoring.mjs': new URL('./scoring.mjs', here),
      'eval/run-evals.mjs': new URL('./run-evals.mjs', here),
      'eval/reproducibility.mjs': new URL('./reproducibility.mjs', here),
      'deploy/openclaw/SOUL.md': new URL('../deploy/openclaw/SOUL.md', here),
      'deploy/openclaw/EPOCHS.md': new URL('../deploy/openclaw/EPOCHS.md', here),
      'root/bin/cli.js': join(rootDir, 'bin/cli.js'),
      'root/dist/cli.js': join(rootDir, 'dist/cli.js'),
      'mcp/dist/server.js': join(mcpDir, 'dist/server.js'),
    };
    return {
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
        targets: requestedTargetIds,
        anthropicModels: ANTHROPIC_MODELS,
        questions: questions.map((question) => question.id),
        repeat: REPEAT,
        canary: CANARY,
        canaryOnly: CANARY_ONLY,
        benchmark: BENCHMARK,
      },
      outcome: {
        exitCode,
        setupComplete,
        batchAborted,
        batchAbortReason,
        commitReady,
        failure: attemptFailure,
      },
      pricing: {
        anthropicPerMTok: PRICES,
        sonnet5IntroEndsExclusive: SONNET_5_INTRO_END,
      },
      initialEpoch,
      epochDriftAbort,
      setupFailures,
      canaries: canaryRecords,
      hashes: {
        files: Object.fromEntries(Object.entries(definingFiles).map(([name, url]) => [name, sha256File(url)])),
        mcpToolSchemas: mcpTools.length > 0
          ? sha256Text(JSON.stringify(mcpTools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema }))))
          : null,
      },
      repetitions: allRuns.map(compactRun),
    };
  }

  async function finalizeAttempt(exitCode, failure = null) {
    if (finalized) return exitCode;
    if (failure) attemptFailure = failure;
    try { if (gtConn) await gtConn.client.close(); } catch { /* best effort */ }
    try { if (agentConn) await agentConn.client.close(); } catch { /* best effort */ }
    const commitReady = benchmarkReady();
    const destinations = manifestDestinations({ tier: TIER, argsValid: true, commitReady });
    if (destinations.local) {
      const serialized = `${JSON.stringify(createManifest(exitCode, commitReady), null, 2)}\n`;
      const localDir = new URL('./results/manifests/', here);
      mkdirSync(localDir, { recursive: true });
      writeFileSync(new URL(`./${runId}.json`, localDir), serialized);
      console.log(`manifest (local) ← results/manifests/${runId}.json`);
      if (destinations.canonical) {
        const canonicalDir = new URL('./manifests/', here);
        mkdirSync(canonicalDir, { recursive: true });
        writeFileSync(new URL(`./${runId}.json`, canonicalDir), serialized);
        console.log(`manifest (canonical) ← manifests/${runId}.json`);
      }
    }
    finalized = true;
    return exitCode;
  }

  try {
    if (!NO_BUILD) {
      console.log('Building root CLI + MCP server before eval…');
      try {
        await execFileP('pnpm', ['build'], { cwd: rootDir, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
        await execFileP('pnpm', ['build'], { cwd: mcpDir, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
      } catch (error) {
        const message = `pre-eval build failed: ${String(error.stderr ?? error.message).slice(0, 2000)}`;
        console.error(message);
        setupFailures.push({ stage: 'build', engine: 'build', error: message });
        return finalizeAttempt(2, { stage: 'build', error: message });
      }
    }

    gitState = await readGitState();
    if (BENCHMARK && gitState.trackedDirty) {
      const message = '--benchmark requires a clean tracked worktree so manifests and rows identify one exact revision';
      console.error(message);
      setupFailures.push({ stage: 'worktree', engine: 'git', error: message });
      return finalizeAttempt(2, { stage: 'worktree', error: message });
    }

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

gtConn = makeMcpConnection(1);
await gtConn.client.connect(gtConn.transport);
agentConn = TIER === 2 && ENGINES.includes('anthropic') ? makeMcpConnection(30000) : null;
if (agentConn) await agentConn.client.connect(agentConn.transport);
({ tools: mcpTools } = await gtConn.client.listTools());
toolByName = new Map(mcpTools.map((t) => [t.name, t]));
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
  const message = error.message;
  console.error(message);
  setupFailures.push({ stage: 'context', engine: 'ground-truth', error: message });
  return finalizeAttempt(1, { stage: 'context', error: message });
}
initialEpoch = vars.currentEpoch ?? null;

// ---------- question selection ----------
const canaryIds = ['operators'];
const canaryQuestions = RUN_CANARY
  ? canaryIds.map((id) => spec.questions.find((question) => question.id === id)).filter(Boolean)
  : [];
if (RUN_CANARY && canaryQuestions.length !== canaryIds.length) {
  preflightErrors.push(`canary questions missing: ${canaryIds.filter((id) => !canaryQuestions.some((question) => question.id === id)).join(', ')}`);
}
const preflightQuestions = CANARY_ONLY
  ? canaryQuestions
  : [...new Map([...questions, ...canaryQuestions].map((question) => [question.id, question])).values()];
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
      for (const error of validateFactSpec(substitute(fact, vars))) {
        preflightErrors.push(`fact ${q.id}/${fact.name}: ${error}`);
      }
    }
  }
}
if (preflightErrors.length > 0) {
  console.error('\n✗ eval-spec preflight failed:');
  for (const error of [...new Set(preflightErrors)]) console.error(`  - ${error}`);
  const message = [...new Set(preflightErrors)].join('; ');
  setupFailures.push({ stage: 'preflight', engine: 'spec', error: message });
  return finalizeAttempt(2, { stage: 'preflight', error: message });
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
  const v = run.runError
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
    let usage = null;
    const usageParts = [];
    const prompt = substitute(q.prompt, vars);
    const t0 = performance.now();
    let answer = '';
    let runError = null;
    let stopReason = null;
    let timedOut = false;
    let authError = false;
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
        usageParts.push({ usage: message.usage ?? null });
      }
      usage = aggregateUsage(usageParts);
      stopReason = last?.stop_reason ?? null;
      answer = (last?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    } catch (e) {
      runError = e.message;
      timedOut = /timed?\s*out|timeout/i.test(runError);
      authError = /credit balance|billing|authentication_error|invalid x-api-key|unauthorized|\b401\b/i.test(runError);
      usage = null;
    }
    return {
      answer, runError, stopReason, usage, timedOut, authError,
      wallMs: Math.round(performance.now() - t0),
      trace: trace.map((t) => ({ name: t.name, args: t.args, ms: t.ms, isError: t.isError })),
      cost: hasCompleteUsage(usage)
        ? computeCost(usage, PRICES[model] ?? PRICES['claude-sonnet-4-6'])
        : null,
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
      const runError = failed
        ? `cron run status=${entry.status}: ${String(entry.summary).slice(0, 200)}`
        : (noAnswer ? 'run ok but no answer file written' : null);
      return {
        answer,
        runError,
        stopReason: entry.status,
        usage: hasCompleteUsage(entry.usage) ? entry.usage : null,
        timedOut: Boolean(runError && /timed?\s*out|timeout/i.test(runError)),
        authError: Boolean(runError && /credit balance|billing|authentication|unauthorized|\b401\b/i.test(runError)),
        wallMs: entry.durationMs ?? Math.round(performance.now() - t0),
        trace,
        cost: null, // flat subscription — no per-call price exists
      };
    } catch (e) {
      return {
        answer: '', runError: e.message, stopReason: null, usage: null,
        timedOut: /timed?\s*out|timeout/i.test(e.message),
        authError: /credit balance|billing|authentication|unauthorized|\b401\b/i.test(e.message),
        wallMs: Math.round(performance.now() - t0), trace: [], cost: null,
      };
    }
  };
}

function shellQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---------- run ----------
function pad(s, n) { return String(s).padEnd(n); }
function previewValue(v) {
  if (v === undefined) return undefined;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}
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
    answer: '', trace: [], scoringTrace: [], usage: null, wallMs: 0, cost: null,
    timedOut: /timed?\s*out|timeout/i.test(error.message),
    authError: /credit balance|billing|authentication|unauthorized|\b401\b/i.test(error.message),
    runError: error.message,
  };
}

async function executeQuestion(target, q, { repeat, canary = false } = {}) {
  await waitForCodex(target);
  let result;
  try {
    const run = await target.run(q, { repeat, canary });
    const score = await scoreRun(q, run, target.traceMode);
    result = { id: q.id, repeat, canary, ...score, ...run, trace: run.trace, answer: run.answer };
  } catch (error) {
    result = { id: q.id, repeat, canary, ...failedScore(error) };
  }
  target.questionsRun += 1;
  const factStr = q.safety
    ? `facts ${result.facts.matched}/${result.facts.total} refusal=${result.safety?.refusalOk ?? false} leak=${result.safety?.leaked ?? false} fabricated=${Boolean(result.safety?.falseSuccess || result.safety?.forbiddenAssertion)}`
    : `facts ${result.facts.matched}/${result.facts.total}`;
  const costStr = formatUsageCost(result, target.engine);
  const errStr = result.traceScore.erroredCalls > 0 ? ` errTools=${result.traceScore.erroredCalls}` : '';
  console.log(`${pad(result.verdict, 8)} ${pad(`${target.label}${canary ? ':canary' : `:r${repeat}`}`, 29)} ${pad(q.id, 26)} tools ${result.traceScore.groupsSatisfied}/${result.traceScore.groupsTotal}${result.traceScore.informational ? '*' : ''} calls=${result.traceScore.calls}${errStr} ${factStr} fmt=${result.format.ok ? 'ok' : result.format.violations.join('+')} ${(result.wallMs / 1000).toFixed(1)}s ${costStr}`);
  if (result.runError) console.log(`         ↳ error: ${result.runError.slice(0, 300)}`);
  return result;
}

if (TIER === 2) {
  targets = [];
  if (ENGINES.includes('codex')) {
    targets.push({
      id: 'codex:gpt-5.5-codex', label: 'gpt-5.5-codex', engine: 'codex', model: 'gpt-5.5 (subscription)',
      run: makeCodexEngine(), traceMode: 'info', questionsRun: 0, consecutiveApiFailures: 0, aborted: false,
    });
  }
  if (ENGINES.includes('anthropic')) {
    if (!process.env.ANTHROPIC_API_KEY) {
      setupFailures.push({ stage: 'engine-setup', engine: 'anthropic', error: 'ANTHROPIC_API_KEY is not set' });
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
        setupFailures.push({ stage: 'engine-setup', engine: 'anthropic', error: `engine setup failed: ${error.message}` });
      }
    }
  }
  for (const failure of setupFailures) console.error(`setup failed [${failure.engine}]: ${failure.error}`);
  setupComplete = setupFailures.length === 0
    && requestedTargetIds.length === targets.length
    && requestedTargetIds.every((id) => targets.some((target) => target.id === id));

  if (RUN_CANARY && !setupComplete) {
    batchAborted = true;
    batchAbortReason = 'canary setup failed';
    return finalizeAttempt(1, { stage: 'canary-setup', error: batchAbortReason });
  }
  if (targets.length === 0) {
    batchAborted = true;
    batchAbortReason = 'no runnable targets';
    return finalizeAttempt(1, { stage: 'engine-setup', error: batchAbortReason });
  }

  if (RUN_CANARY) {
    for (const target of targets) {
      console.log(`\n=== canary ${target.engine} — ${target.label} ===`);
      for (const q of canaryQuestions) {
        const result = await executeQuestion(target, q, { repeat: 0, canary: true });
        const record = {
          targetId: target.id, engine: target.engine, model: target.model,
          question: q.id, verdict: result.verdict,
          runError: result.runError ?? null,
          timedOut: result.timedOut === true,
          authError: result.authError === true,
          usage: result.usage ?? null,
          cost: result.cost ?? null,
          costDisplay: formatUsageCost(result, target.engine),
        };
        canaryRecords.push(record);
        if (!canaryAllowsScheduling(record)) {
          batchAborted = true;
          batchAbortReason = `canary ${result.verdict} on ${target.label}/${q.id}${result.runError ? `: ${result.runError}` : ''}`;
          console.log(`⚠ aborting batch: ${batchAbortReason}`);
          return finalizeAttempt(1, { stage: 'canary', error: batchAbortReason });
        }
      }
    }
    if (CANARY_ONLY) return finalizeAttempt(0);
  }

  const productionSchedule = interleavedSchedule(
    REPEAT,
    questions.map((question) => question.id),
    targets.map((target) => target.id),
  );
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const targetById = new Map(targets.map((target) => [target.id, target]));
  for (let repeat = 1; repeat <= REPEAT; repeat += 1) {
    try { await refreshContext(); } catch (error) {
      const message = `repeat ${repeat} context: ${error.message}`;
      setupFailures.push({ stage: 'repeat-context', engine: 'ground-truth', error: message });
      batchAborted = true;
      batchAbortReason = message;
      break;
    }
    const epochAtRun = vars.currentEpoch ?? null;
    const runSets = new Map();
    for (const target of targets) {
      const runSet = {
        targetId: target.id, label: target.label, engine: target.engine, model: target.model, repeat, epochAtRun,
        results: [], aborted: target.aborted, abortReason: target.abortReason ?? null, invalidReason: null,
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
    for (const entry of productionSchedule.filter((item) => item.repeat === repeat)) {
      const q = questionById.get(entry.question);
      const target = targetById.get(entry.target);
      const runSet = runSets.get(entry.target);
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
}

// ---------- report ----------
const resultsDir = new URL('./results/', here);
mkdirSync(resultsDir, { recursive: true });

for (const runSet of allRuns) {
  const { results } = runSet;
  const passed = results.filter((r) => r.verdict === 'PASS').length;
  const partial = results.filter((r) => r.verdict === 'PARTIAL').length;
  const failed = results.filter((r) => r.verdict === 'FAIL').length;
  const totals = TIER === 2 ? summarizeUsage(results) : { usage: null, cost: null };
  const totalCost = totals.cost;
  const runUsage = totals.usage;
  const usageLabel = runUsage == null ? 'usage unknown' : `${Math.round(usageTokenCount(runUsage) / 1000)}k tok`;
  const runCostLabel = TIER === 1
    ? ''
    : runSet.engine === 'codex'
      ? ` — subscription (${usageLabel})`
      : totalCost == null
        ? ` — ${usageLabel}`
        : ` — total cost $${totalCost.toFixed(3)} (${usageLabel})`;
  const suffix = TIER === 1
    ? 'tier1'
    : `tier2-${runSet.label.replace(/[^a-zA-Z0-9.-]+/g, '_')}-r${runSet.repeat}`;
  const baseName = `${runId}-${suffix}`;
  const jsonUrl = new URL(`./${baseName}.json`, resultsDir);
  const mdUrl = new URL(`./${baseName}.md`, resultsDir);
  writeFileSync(jsonUrl, JSON.stringify({
    runId, tier: TIER, engine: runSet.engine, model: runSet.model,
    repeat: runSet.repeat, epochAtRun: runSet.epochAtRun,
    aborted: runSet.aborted ?? false, abortReason: runSet.abortReason ?? null,
    invalidReason: runSet.invalidReason ?? null, driftWarning: runSet.driftWarning ?? null,
    vars: { ...vars, currentEpoch: runSet.epochAtRun ?? vars.currentEpoch },
    usage: runUsage,
    cost: totalCost,
    results,
  }, null, 2));

  const md = [];
  md.push(`# Eval run ${runId} — ${suffix}`);
  md.push('');
  md.push(`**${passed} PASS / ${partial} PARTIAL / ${failed} FAIL** of ${results.length}${runCostLabel}`);
  if (runSet.aborted || runSet.invalidReason) md.push(`\n**INVALID RUN:** ${runSet.invalidReason ?? runSet.abortReason ?? 'aborted'}`);
  else if (runSet.driftWarning) md.push(`\n**DRIFT WARNING:** ${runSet.driftWarning}`);
  md.push('');
  if (TIER === 2) {
    md.push('| question | verdict | tool groups | calls | facts | format | wall | cost |');
    md.push('|---|---|---|---|---|---|---|---|');
    for (const r of results) {
      const factStr = r.factDetails ? r.factDetails.map((f) => `${f.name}:${f.matched ? '✓' : '✗'}`).join(' ') : '';
      const costStr = formatUsageCost(r, runSet.engine);
      md.push(`| ${r.id} | ${r.verdict} | ${r.traceScore.groupsSatisfied}/${r.traceScore.groupsTotal}${r.traceScore.informational ? '*' : ''} | ${r.traceScore.calls} | ${factStr} | ${r.format.ok ? 'ok' : r.format.violations.join(', ')} | ${(r.wallMs / 1000).toFixed(1)}s | ${costStr} |`);
    }
    md.push('');
    for (const r of results) {
      md.push(`## ${r.id} — ${r.verdict}`);
      md.push('');
      md.push(`Trace: ${(r.trace ?? []).map((t) => `${t.kind ?? 'tool'}:${t.server ? `${t.server}:` : ''}${t.name}(${t.ms}ms${t.isError ? ',ERR' : ''})`).join(' → ') || '(no tool calls recorded)'}`);
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
  console.log(`\n[${runSet.label}] ${passed} PASS / ${partial} PARTIAL / ${failed} FAIL of ${results.length}${runCostLabel} → results/${baseName}.md`);
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
      const costPerPass = summary.costPerPass != null
        ? `$${summary.costPerPass.toFixed(4)}`
        : 'unverified/sub';
      const usageSummary = summary.usage == null
        ? 'usage unknown'
        : `${Math.round(usageTokenCount(summary.usage) / 1000)}k tok`;
      console.log(`${pad(runSets[0].label, 26)} valid ${summary.validRuns}/${summary.attemptedRuns} (${(summary.validRunRate * 100).toFixed(0)}%) · PASS ${summary.passed}/${summary.questions} · median ${summary.medianWallMs == null ? '—' : `${(summary.medianWallMs / 1000).toFixed(1)}s`} · p95 ${summary.p95WallMs == null ? '—' : `${(summary.p95WallMs / 1000).toFixed(1)}s`} · ${usageSummary} · cost/PASS ${costPerPass}`);
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
const commitReady = benchmarkReady();
if (BENCHMARK && TIER === 2) {
  if (!commitReady) {
    console.log('benchmarks.md ✗ batch skipped (not commit-ready; local attempt manifest retained)');
  } else {
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
      const { results } = runSet;
      const passed = results.filter((r) => r.verdict === 'PASS').length;
      const partial = results.filter((r) => r.verdict === 'PARTIAL').length;
      const failed = results.filter((r) => r.verdict === 'FAIL').length;
      const factsTotal = results.reduce((s, r) => s + (r.facts?.total ?? 0), 0);
      const factsOk = results.reduce((s, r) => s + (r.facts?.matched ?? 0), 0);
      const walls = results.map((r) => r.wallMs).sort((a, b) => a - b);
      const costs = results.map((result) => result.cost).filter(Number.isFinite);
      const costStr = runSet.engine === 'codex'
        ? 'sub'
        : (costs.length === results.length ? `$${costs.reduce((sum, cost) => sum + cost, 0).toFixed(3)}` : 'unknown');
      const suite = `${FAST ? 'fast' : 'full'}@v${spec.suiteVersion ?? 1}${ONLY ? `(only:${ONLY.join('+')})` : ''}`;
      const row = `| ${runId.slice(0, 10)} | ${runSet.engine} | ${runSet.label} | ${suite} | ${results.length} | ${passed}/${partial}/${failed} | ${factsOk}/${factsTotal} | ${(percentile(walls, 0.5) / 1000).toFixed(1)}s | ${(percentile(walls, 0.95) / 1000).toFixed(1)}s | ${costStr} | epoch ${runSet.epochAtRun ?? '?'}; repeat ${runSet.repeat}/${REPEAT}; ${gitState.sha?.slice(0, 8) ?? 'no-sha'} |`;
      appendFileSync(benchPath, `${row}\n`);
      console.log(`benchmarks.md ← ${runSet.label}`);
    }
  }
}

const qualityFailure = allRuns.some((run) => run.results.some((result) => (
  result.verdict === 'FAIL' || (TIER === 2 && result.verdict === 'PARTIAL')
)));
const infrastructureFailure = TIER === 2 && (
  !setupComplete
  || setupFailures.length > 0
  || epochDriftAbort
  || batchAborted
  || allRuns.some((run) => !isValidRunSet(run, questions.length))
);
return finalizeAttempt(qualityFailure || infrastructureFailure ? 1 : 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`eval runner failed: ${message}`);
    setupFailures.push({ stage: 'unexpected', engine: 'runner', error: message });
    batchAborted = true;
    batchAbortReason = message;
    return finalizeAttempt(2, { stage: 'unexpected', error: message });
  }
}

process.exit(await main());
