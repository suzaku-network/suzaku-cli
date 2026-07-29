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
  readFileSync, mkdirSync, writeFileSync, existsSync, appendFileSync, writeSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { EvalArgumentError, parseEvalArgs } from './args.mjs';
import { bridgedStdioCommand } from './stdio-bridge.mjs';
import { createSpendGuard } from './spend-guard.mjs';
import { runEval } from './runner.mjs';
import { writeAttemptManifest } from './manifest-store.mjs';
import {
  applySchemaDefaults, collectAddresses, parseToolJson, getPath, deepFind, resolveFact, saneValue,
  matchFact, scoreTrace, scoreFormat, scorePolicy, computeCost, gateVerdict,
  verdict, validateFactSpec,
} from './scoring.mjs';
import {
  aggregateRunSets, aggregateUsage, formatUsageCost,
  groundTruthTrustFailure, hasCompleteUsage,
  isCommitReadyBenchmark, isValidRunSet,
  percentile, summarizeUsage, usageTokenCount, validateCanaryPolicy,
} from './reproducibility.mjs';

const execFileP = promisify(execFile);
const here = new URL('.', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('./questions.json', here), 'utf8'));
const contractSpec = JSON.parse(readFileSync(new URL('./question-contracts.json', here), 'utf8'));
const contractById = new Map(contractSpec.contracts.map((contract) => [contract.id, contract]));

// ---------- flags ----------
const USAGE = 'usage: run-evals.mjs --tier 1|2 [--engine anthropic|codex|--engines anthropic,codex] [--models a,b|--anthropic-models a,b] [--repeat N] [--canary|--canary-only] [--only ids] [--fast] [--benchmark] [--confirm-paid --max-cost-usd N] [--dry-run] [--no-build]';
let cli;
try {
  cli = parseEvalArgs(process.argv.slice(2), {
    questionIds: spec.questions.map((question) => question.id),
  });
} catch (error) {
  writeSync(2, `${error instanceof EvalArgumentError ? error.message : String(error)}\n${USAGE}\n`);
  process.exit(2);
}
const {
  tier: TIER,
  only: ONLY,
  fast: FAST,
  engines: ENGINES,
  anthropicModels: ANTHROPIC_MODELS,
  repeat: REPEAT,
  repeatExplicit: REPEAT_EXPLICIT,
  canary: CANARY,
  canaryOnly: CANARY_ONLY,
  runCanary: RUN_CANARY,
  benchmark: BENCHMARK,
  noBuild: NO_BUILD,
  dryRun: DRY_RUN,
  maxCostUsd: MAX_COST_USD,
} = cli;
if (cli.help) {
  writeSync(1, `${USAGE}\n`);
  process.exit(0);
}

const canaryPolicyErrors = validateCanaryPolicy({
  tier: TIER,
  canary: CANARY,
  canaryOnly: CANARY_ONLY,
  benchmark: BENCHMARK,
  only: ONLY,
  repeat: REPEAT,
  repeatExplicit: REPEAT_EXPLICIT,
});
if (canaryPolicyErrors.length > 0) {
  for (const error of canaryPolicyErrors) console.error(error);
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
const CANARY_IDS = ['operators'];

function dryRunSummary() {
  const perTargetCalls = (RUN_CANARY ? CANARY_IDS.length : 0)
    + (CANARY_ONLY ? 0 : questions.length * REPEAT);
  const modelCalls = TIER === 2 ? requestedTargetIds.length * perTargetCalls : 0;
  const meteredCalls = TIER === 2 && ENGINES.includes('anthropic')
    ? ANTHROPIC_MODELS.length * perTargetCalls
    : 0;
  return {
    dryRun: true,
    tier: TIER,
    engines: ENGINES,
    targets: requestedTargetIds,
    anthropicModels: ANTHROPIC_MODELS,
    questions: questions.map((question) => question.id),
    repeat: REPEAT,
    canary: CANARY,
    canaryOnly: CANARY_ONLY,
    benchmark: BENCHMARK,
    calls: {
      perTarget: perTargetCalls,
      totalModelCalls: modelCalls,
      meteredAnthropicCalls: meteredCalls,
    },
    anthropicPricingPerMTok: Object.fromEntries(
      ANTHROPIC_MODELS.map((model) => [model, PRICES[model] ?? null]),
    ),
    spendCeilingUsd: MAX_COST_USD,
    spendEnforcement: meteredCalls > 0
      ? 'required for execution; enforced between calls (one in-flight call can cross the ceiling)'
      : 'not applicable',
  };
}

async function main() {
  if (DRY_RUN) {
    writeSync(1, `${JSON.stringify(dryRunSummary(), null, 2)}\n`);
    return 0;
  }
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
  const spendGuard = createSpendGuard(MAX_COST_USD);

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
        gateVerdict: result.gateVerdict ?? null,
        semanticVerdict: result.semanticVerdict ?? null,
        facts: {
          matched: result.facts?.matched ?? 0,
          total: result.facts?.total ?? 0,
          checks: (result.factDetails ?? []).map((fact) => ({ name: fact.name, matched: fact.matched })),
        },
        policy: result.policy ?? null,
        runError: result.runError ?? null,
        infrastructureError: result.infrastructureError ?? null,
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
      'eval/question-contracts.json': new URL('./question-contracts.json', here),
      'eval/evidence/dexalot-mainnet-2026-07-29.json': new URL('./evidence/dexalot-mainnet-2026-07-29.json', here),
      'eval/args.mjs': new URL('./args.mjs', here),
      'eval/scoring.mjs': new URL('./scoring.mjs', here),
      'eval/run-evals.mjs': new URL('./run-evals.mjs', here),
      'eval/runner.mjs': new URL('./runner.mjs', here),
      'eval/manifest-store.mjs': new URL('./manifest-store.mjs', here),
      'eval/reproducibility.mjs': new URL('./reproducibility.mjs', here),
      'eval/spend-guard.mjs': new URL('./spend-guard.mjs', here),
      'eval/review-workflow.mjs': new URL('./review-workflow.mjs', here),
      'eval/calibration.mjs': new URL('./calibration.mjs', here),
      'eval/stdio-bridge.mjs': new URL('./stdio-bridge.mjs', here),
      'eval/stdio-relay.mjs': new URL('./stdio-relay.mjs', here),
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
      suiteStatus: spec.suiteStatus ?? null,
      requested: {
        engines: ENGINES,
        targets: requestedTargetIds,
        anthropicModels: ANTHROPIC_MODELS,
        questions: questions.map((question) => question.id),
        repeat: REPEAT,
        canary: CANARY,
        canaryOnly: CANARY_ONLY,
        benchmark: BENCHMARK,
        maxCostUsd: MAX_COST_USD,
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
        meteredSpendUsd: spendGuard.spentUsd,
        maxCostUsd: MAX_COST_USD,
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
    const serialized = `${JSON.stringify(createManifest(exitCode, commitReady), null, 2)}\n`;
    const placement = writeAttemptManifest({
      tier: TIER,
      argsValid: true,
      commitReady,
      runId,
      serialized,
      localDir: new URL('./results/manifests/', here),
      canonicalDir: new URL('./manifests/', here),
    });
    for (const item of placement.written) {
      console.log(`manifest (${item.kind}) ← ${item.kind === 'local' ? 'results/manifests' : 'manifests'}/${runId}.json`);
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
  const launch = bridgedStdioCommand(process.execPath, [
    new URL('../dist/server.js', here).pathname,
    '--read-only',
  ]);
  const transport = new StdioClientTransport({
    ...launch,
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
if (contractSpec.suiteVersion !== spec.suiteVersion) {
  preflightErrors.push(`question-contract suite version ${contractSpec.suiteVersion} does not match questions ${spec.suiteVersion}`);
}
const specQuestionIds = new Set(spec.questions.map((question) => question.id));
const contractIds = new Set(contractSpec.contracts.map((contract) => contract.id));
for (const id of specQuestionIds) {
  if (!contractIds.has(id)) preflightErrors.push(`question contract missing: ${id}`);
}
for (const id of contractIds) {
  if (!specQuestionIds.has(id)) preflightErrors.push(`orphan question contract: ${id}`);
}
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
const canaryQuestions = RUN_CANARY
  ? CANARY_IDS.map((id) => spec.questions.find((question) => question.id === id)).filter(Boolean)
  : [];
if (RUN_CANARY && canaryQuestions.length !== CANARY_IDS.length) {
  preflightErrors.push(`canary questions missing: ${CANARY_IDS.filter((id) => !canaryQuestions.some((question) => question.id === id)).join(', ')}`);
}
const preflightQuestions = CANARY_ONLY
  ? canaryQuestions
  : [...new Map([...questions, ...canaryQuestions].map((question) => [question.id, question])).values()];
for (const q of preflightQuestions) {
  if (!contractById.has(q.id)) preflightErrors.push(`question contract missing: ${q.id}`);
  if (![undefined, null, 'no-new'].includes(q.addressPolicy)) {
    preflightErrors.push(`unsupported addressPolicy '${q.addressPolicy}' (question ${q.id})`);
  }
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
    out.push({
      tool: gt.tool,
      args,
      ok: res.ok,
      parsed: data !== null,
      ms: res.ms,
      error: res.ok ? null : res.text.slice(0, 400),
      addresses: [...collectAddresses(data)],
      facts,
    });
  }
  return out;
}

function groundTruthForReview(groups) {
  return groups.map((group) => ({
    tool: group.tool,
    args: group.args,
    ok: group.ok,
    parsed: group.parsed,
    facts: (group.facts ?? []).map((fact) => ({
      name: fact.spec?.name ?? 'unnamed-fact',
      value: fact.value,
      via: fact.via ?? null,
      sane: fact.sane === true,
    })),
  }));
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
  const infrastructureError = groundTruthTrustFailure(gts);
  const allowedAddresses = new Set([
    ...collectAddresses(substitute(q.prompt, vars)),
    ...collectAddresses(spec.deployment),
    ...collectAddresses(q.allowedAddresses ?? []),
    ...gts.flatMap((group) => group.addresses ?? []),
  ]);
  const policy = scorePolicy(run.answer, {
    mustNotContain: q.mustNotContain ?? [],
    addressPolicy: q.addressPolicy ?? null,
    allowedAddresses: [...allowedAddresses],
  });
  const semanticVerdict = 'PENDING_HUMAN';
  if (infrastructureError) {
    const failedFacts = gts.flatMap((group) => group.facts ?? [])
      .filter((fact) => fact.spec?.answerMatch !== false);
    const hardGate = gateVerdict({
      trace: traceScore, format, policy, runError: run.runError, infrastructureError,
    });
    return {
      verdict: 'FAIL',
      gateVerdict: hardGate,
      semanticVerdict,
      traceScore,
      format,
      facts: { total: failedFacts.length, matched: 0, evidenceOnly: true },
      policy,
      groundTruthEvidence: groundTruthForReview(gts),
      factDetails: failedFacts.map((fact) => ({
        name: fact.spec?.name ?? 'unnamed-fact',
        value: previewValue(fact.value),
        via: fact.via,
        matched: null,
        machineCheckable: false,
      })),
      infrastructureError,
    };
  }
  let total = 0;
  let matched = 0;
  const factDetails = [];
  const objectiveMatchTypes = new Set([
    'integer', 'count', 'number', 'address', 'address-set', 'number-set',
  ]);
  for (const g of gts) {
    for (const f of g.facts) {
      if (f.spec.answerMatch === false) continue;
      total += 1;
      const machineCheckable = objectiveMatchTypes.has(f.spec.match);
      const observed = machineCheckable && f.sane && f.value !== undefined
        ? matchFact(run.answer, f.spec, f.value)
        : null;
      if (observed === true) matched += 1;
      factDetails.push({
        name: f.spec.name,
        value: previewValue(f.value),
        via: f.via,
        matched: observed,
        machineCheckable,
      });
    }
  }
  const factsSummary = { total, matched, evidenceOnly: true };
  const hardGate = gateVerdict({
    trace: traceScore, format, policy, runError: run.runError, infrastructureError: null,
  });
  const v = verdict({
    trace: traceScore,
    format,
    policy,
    runError: run.runError,
    semanticVerdict,
  });
  return {
    verdict: v,
    gateVerdict: hardGate,
    semanticVerdict,
    traceScore,
    format,
    facts: factsSummary,
    policy,
    groundTruthEvidence: groundTruthForReview(gts),
    factDetails, infrastructureError: null,
  };
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
      const effectiveInput = applySchemaDefaults(input ?? {}, t.inputSchema);
      const res = await callAgent(t.name, effectiveInput, SLOW_TOOLS.includes(t.name) ? 300_000 : DEFAULT_TOOL_TIMEOUT);
      trace.push({
        name: t.name, args: effectiveInput, ms: res.ms, isError: !res.ok,
      });
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
    const infrastructureError = groundTruthTrustFailure(gts);
    const allCallsOk = gts.every((g) => g.ok);
    const allFacts = gts.flatMap((g) => g.facts);
    const saneFacts = allFacts.filter((f) => f.sane);
    const v = infrastructureError ? 'FAIL'
      : allCallsOk && saneFacts.length === allFacts.length ? 'PASS'
        : allCallsOk && saneFacts.length > 0 ? 'PARTIAL' : 'FAIL';
    results.push({
      id: q.id, verdict: v,
      infrastructureError,
      toolMs: gts.reduce((s, g) => s + g.ms, 0),
      wallMs: Math.round(performance.now() - t0),
      detail: {
        calls: gts.map((g) => ({ tool: g.tool, ok: g.ok, parsed: g.parsed, ms: g.ms, error: g.error })),
        facts: allFacts.map((f) => ({ name: f.spec.name, value: previewValue(f.value), via: f.via, sane: f.sane })),
      },
    });
    console.log(`${pad(v, 8)} ${pad(q.id, 20)} tools ${gts.map((g) => `${g.tool}:${g.ok ? 'ok' : 'ERR'}:${g.ms}ms`).join(' ')}`);
    if (infrastructureError) console.log(`         ↳ infrastructure: ${infrastructureError}`);
    for (const f of allFacts.filter((x) => !x.sane)) {
      console.log(`         ↳ fact '${f.spec.name}' unresolved/insane (via=${f.via ?? 'none'}, value=${previewValue(f.value)})`);
    }
  }
  allRuns.push({ label: 'tier1', engine: 'none', model: null, repeat: 1, epochAtRun: vars.currentEpoch ?? null, results });
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
    gateVerdict: 'FAIL',
    semanticVerdict: 'PENDING_HUMAN',
    traceScore: { ok: false, groupsSatisfied: 0, groupsTotal: 0, calls: 0, erroredCalls: 0, withinBudget: true, forbiddenCalled: [] },
    format: { ok: false, violations: ['run-error'] },
    facts: { total: 0, matched: 0, evidenceOnly: true },
    policy: { ok: false, leaked: false, explicitLeaks: [], newAddresses: [] },
    factDetails: [], groundTruthEvidence: [],
    answer: '', trace: [], scoringTrace: [], usage: null, wallMs: 0, cost: null,
    timedOut: /timed?\s*out|timeout/i.test(error.message),
    authError: /credit balance|billing|authentication|unauthorized|\b401\b/i.test(error.message),
    runError: error.message,
  };
}

function budgetFailureBeforeCall(target) {
  return spendGuard.beforeCall(target.engine);
}

function recordMeteredCost(target, result) {
  return spendGuard.record(target.engine, result.cost);
}

async function executeQuestion(target, q, { repeat, canary = false } = {}) {
  await waitForCodex(target);
  const preCallBudgetFailure = budgetFailureBeforeCall(target);
  if (preCallBudgetFailure) {
    return {
      id: q.id,
      repeat,
      canary,
      ...failedScore(new Error(preCallBudgetFailure)),
      infrastructureError: preCallBudgetFailure,
      budgetError: preCallBudgetFailure,
    };
  }
  let result;
  try {
    const run = await target.run(q, { repeat, canary });
    const score = await scoreRun(q, run, target.traceMode);
    result = { id: q.id, repeat, canary, ...score, ...run, trace: run.trace, answer: run.answer };
  } catch (error) {
    result = { id: q.id, repeat, canary, ...failedScore(error) };
  }
  const budgetError = recordMeteredCost(target, result);
  if (budgetError) {
    result.budgetError = budgetError;
    result.infrastructureError = result.infrastructureError ?? budgetError;
    result.verdict = 'FAIL';
    result.gateVerdict = 'FAIL';
  }
  target.questionsRun += 1;
  return result;
}

function logQuestionResult(target, q, result, { repeat, canary }) {
  const factStr = `evidence ${result.facts.matched}/${result.facts.total} policy=${result.policy?.ok === true ? 'ok' : 'FAIL'} gate=${result.gateVerdict}`;
  const costStr = formatUsageCost(result, target.engine);
  const errStr = result.traceScore.erroredCalls > 0 ? ` errTools=${result.traceScore.erroredCalls}` : '';
  console.log(`${pad(result.verdict, 8)} ${pad(`${target.label}${canary ? ':canary' : `:r${repeat}`}`, 29)} ${pad(q.id, 26)} tools ${result.traceScore.groupsSatisfied}/${result.traceScore.groupsTotal}${result.traceScore.informational ? '*' : ''} calls=${result.traceScore.calls}${errStr} ${factStr} fmt=${result.format.ok ? 'ok' : result.format.violations.join('+')} ${(result.wallMs / 1000).toFixed(1)}s ${costStr}`);
  if (result.runError) console.log(`         ↳ error: ${result.runError.slice(0, 300)}`);
  if (result.infrastructureError) console.log(`         ↳ infrastructure: ${result.infrastructureError}`);
}

if (TIER === 2) {
  targets = [];
  if (ENGINES.includes('codex')) {
    targets.push({
      id: 'codex:gpt-5.5-codex', label: 'gpt-5.5-codex', engine: 'codex', model: 'gpt-5.5 (subscription)',
      run: makeCodexEngine(), traceMode: 'info', questionsRun: 0,
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
          });
        }
      } catch (error) {
        setupFailures.push({ stage: 'engine-setup', engine: 'anthropic', error: `engine setup failed: ${error.message}` });
      }
    }
  }
  const outcome = await runEval({
    requestedTargetIds,
    targets,
    questions,
    canaryQuestions,
    repeats: REPEAT,
    runCanary: RUN_CANARY,
    canaryOnly: CANARY_ONLY,
    benchmark: BENCHMARK,
    initialEpoch,
    setupFailures,
  }, {
    executeQuestion,
    refreshEpoch: async () => {
      await refreshContext();
      return vars.currentEpoch ?? null;
    },
    formatUsageCost,
    onResult: logQuestionResult,
    onEvent: (event) => {
      if (event.type === 'setup-failure') {
        console.error(`setup failed [${event.failure.engine}]: ${event.failure.error}`);
      } else if (event.type === 'canary-start') {
        console.log(`\n=== canary ${event.target.engine} — ${event.target.label} ===`);
      } else if (event.type === 'repeat-start') {
        console.log(`\n=== repeat ${event.repeat}/${event.repeats} — epoch ${event.epoch} ===`);
      } else if (event.type === 'drift') {
        console.warn(`⚠ ${event.message}`);
      } else if (event.type === 'abort') {
        console.log(`⚠ aborting batch: ${event.message}`);
      }
    },
  });
  setupFailures.splice(0, setupFailures.length, ...outcome.setupFailures);
  canaryRecords.push(...outcome.canaries);
  allRuns.push(...outcome.runSets);
  setupComplete = outcome.setupComplete;
  batchAborted = outcome.batchAborted;
  batchAbortReason = outcome.batchAbortReason;
  epochDriftAbort = outcome.epochDriftAbort;
  if (outcome.stopBeforeReports) {
    return finalizeAttempt(outcome.exitCode, outcome.failure);
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
  const pending = results.filter((r) => r.verdict === 'PENDING_HUMAN').length;
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
    schemaVersion: 2,
    runId,
    tier: TIER,
    suiteVersion: spec.suiteVersion ?? 1,
    suiteStatus: spec.suiteStatus ?? null,
    gitSha: gitState.sha,
    trackedDirty: gitState.trackedDirty,
    hashes: {
      questions: sha256File(new URL('./questions.json', here)),
      questionContracts: sha256File(new URL('./question-contracts.json', here)),
      scoring: sha256File(new URL('./scoring.mjs', here)),
      reviewWorkflow: sha256File(new URL('./review-workflow.mjs', here)),
    },
    engine: runSet.engine, model: runSet.model,
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
  md.push(`**${passed} PASS / ${partial} PARTIAL / ${failed} FAIL / ${pending} PENDING_HUMAN** of ${results.length}${runCostLabel}`);
  if (runSet.aborted || runSet.invalidReason) md.push(`\n**INVALID RUN:** ${runSet.invalidReason ?? runSet.abortReason ?? 'aborted'}`);
  else if (runSet.driftWarning) md.push(`\n**DRIFT WARNING:** ${runSet.driftWarning}`);
  md.push('');
  if (TIER === 2) {
    md.push('| question | verdict | hard gate | tool groups | calls | objective evidence | format | wall | cost |');
    md.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of results) {
      const factStr = r.factDetails
        ? r.factDetails.map((f) => `${f.name}:${f.matched === null ? '—' : (f.matched ? '✓' : 'not-seen')}`).join(' ')
        : '';
      const costStr = formatUsageCost(r, runSet.engine);
      md.push(`| ${r.id} | ${r.verdict} | ${r.gateVerdict} | ${r.traceScore.groupsSatisfied}/${r.traceScore.groupsTotal}${r.traceScore.informational ? '*' : ''} | ${r.traceScore.calls} | ${factStr} | ${r.format.ok ? 'ok' : r.format.violations.join(', ')} | ${(r.wallMs / 1000).toFixed(1)}s | ${costStr} |`);
    }
    md.push('');
    for (const r of results) {
      md.push(`## ${r.id} — ${r.verdict}`);
      md.push('');
      md.push(`Trace: ${(r.trace ?? []).map((t) => `${t.kind ?? 'tool'}:${t.server ? `${t.server}:` : ''}${t.name}(${t.ms}ms${t.isError ? ',ERR' : ''})`).join(' → ') || '(no tool calls recorded)'}`);
      if (r.runError) md.push(`\nError: ${r.runError}`);
      if (r.infrastructureError) md.push(`\nInfrastructure error: ${r.infrastructureError}`);
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
  console.log(`\n[${runSet.label}] ${passed} PASS / ${partial} PARTIAL / ${failed} FAIL / ${pending} PENDING_HUMAN of ${results.length}${runCostLabel} → results/${baseName}.md`);
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
      console.log(`${pad(runSets[0].label, 26)} valid ${summary.validRuns}/${summary.attemptedRuns} (${(summary.validRunRate * 100).toFixed(0)}%) · PASS ${summary.passed}/${summary.questions} · PENDING_HUMAN ${summary.pending} · median ${summary.medianWallMs == null ? '—' : `${(summary.medianWallMs / 1000).toFixed(1)}s`} · p95 ${summary.p95WallMs == null ? '—' : `${(summary.p95WallMs / 1000).toFixed(1)}s`} · ${usageSummary} · cost/PASS ${costPerPass}`);
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
  result.verdict === 'FAIL'
  || (TIER === 2 && ['PARTIAL', 'PENDING_HUMAN'].includes(result.verdict))
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

process.exitCode = await main();
