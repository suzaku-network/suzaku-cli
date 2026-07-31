export class EvalArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EvalArgumentError';
    this.exitCode = 2;
  }
}

const BOOLEAN_FLAGS = new Set([
  '--benchmark',
  '--canary',
  '--canary-only',
  '--confirm-paid',
  '--dry-run',
  '--fast',
  '--help',
  '--no-build',
]);

const VALUE_FLAGS = new Set([
  '--anthropic-models',
  '--engine',
  '--engines',
  '--kimi-models',
  '--max-cost-usd',
  '--model',
  '--models',
  '--only',
  '--repeat',
  '--tier',
]);

const ALL_FLAGS = new Set([...BOOLEAN_FLAGS, ...VALUE_FLAGS]);
const ENGINES = new Set(['anthropic', 'codex', 'kimi']);
const METERED_ENGINES = new Set(['anthropic', 'kimi']);

function listValue(values, name) {
  const raw = values.get(name);
  if (raw == null) return null;
  const items = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw new EvalArgumentError(`${name} requires at least one value`);
  if (new Set(items).size !== items.length) {
    throw new EvalArgumentError(`${name} contains duplicate values`);
  }
  return items;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new EvalArgumentError(`${name} must be a positive integer`);
  }
  return parsed;
}

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new EvalArgumentError(`${name} must be a positive number`);
  }
  return parsed;
}

function parseTokens(rawArgv) {
  const argv = [...rawArgv];
  if (argv[0] === '--') argv.shift();
  if (argv.includes('--')) {
    throw new EvalArgumentError("the pnpm '--' separator is only valid as the first token");
  }

  const booleans = new Set();
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new EvalArgumentError(`unexpected positional argument: ${token}`);
    }
    if (!ALL_FLAGS.has(token)) throw new EvalArgumentError(`unknown flag: ${token}`);
    if (booleans.has(token) || values.has(token)) {
      throw new EvalArgumentError(`duplicate flag: ${token}`);
    }
    if (BOOLEAN_FLAGS.has(token)) {
      booleans.add(token);
      continue;
    }
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      throw new EvalArgumentError(`${token} requires a value`);
    }
    values.set(token, value);
    index += 1;
  }
  return { booleans, values };
}

export function parseEvalArgs(rawArgv, { questionIds = [] } = {}) {
  const { booleans, values } = parseTokens(rawArgv);
  const present = (name) => booleans.has(name) || values.has(name);
  const help = booleans.has('--help');

  const tier = positiveInteger(values.get('--tier') ?? '1', '--tier');
  if (![1, 2].includes(tier)) throw new EvalArgumentError('--tier must be 1 or 2');

  if (present('--engine') && present('--engines')) {
    throw new EvalArgumentError('--engine and --engines are mutually exclusive');
  }
  const engine = values.get('--engine') ?? 'anthropic';
  const engines = listValue(values, '--engines') ?? [engine];
  const unknownEngines = engines.filter((item) => !ENGINES.has(item));
  if (unknownEngines.length > 0) {
    throw new EvalArgumentError(`unknown engines: ${unknownEngines.join(', ')}`);
  }

  if (present('--model') && present('--models')) {
    throw new EvalArgumentError('--model and --models are mutually exclusive');
  }
  const genericModelFlag = present('--model') || present('--models');
  if (genericModelFlag
    && (engines.length !== 1 || !METERED_ENGINES.has(engines[0]))) {
    throw new EvalArgumentError('--model/--models require one metered API engine (anthropic or kimi)');
  }
  if (genericModelFlag && (present('--anthropic-models') || present('--kimi-models'))) {
    throw new EvalArgumentError('--model/--models cannot be combined with provider-specific model flags');
  }
  if (present('--anthropic-models') && !engines.includes('anthropic')) {
    throw new EvalArgumentError('--anthropic-models requires the anthropic engine');
  }
  if (present('--kimi-models') && !engines.includes('kimi')) {
    throw new EvalArgumentError('--kimi-models requires the kimi engine');
  }
  const genericModels = listValue(values, '--models')
    ?? (values.has('--model') ? [values.get('--model')] : null);
  const anthropicModels = listValue(values, '--anthropic-models')
    ?? (engines.length === 1 && engines[0] === 'anthropic' ? genericModels : null)
    ?? ['claude-sonnet-4-6'];
  const kimiModels = listValue(values, '--kimi-models')
    ?? (engines.length === 1 && engines[0] === 'kimi' ? genericModels : null)
    ?? ['kimi-k3'];

  const only = listValue(values, '--only');
  const knownQuestions = new Set(questionIds);
  const unknownQuestions = (only ?? []).filter((id) => !knownQuestions.has(id));
  if (unknownQuestions.length > 0) {
    throw new EvalArgumentError(`--only references unknown question: ${unknownQuestions.join(', ')}`);
  }

  const repeat = positiveInteger(values.get('--repeat') ?? '1', '--repeat');
  const benchmark = booleans.has('--benchmark');
  const canary = booleans.has('--canary');
  const canaryOnly = booleans.has('--canary-only');
  const dryRun = booleans.has('--dry-run');
  const noBuild = booleans.has('--no-build');

  if ((canary || canaryOnly) && tier !== 2) {
    throw new EvalArgumentError('canaries require --tier 2');
  }
  if (canary && canaryOnly) {
    throw new EvalArgumentError('--canary and --canary-only are mutually exclusive');
  }
  if (canaryOnly && benchmark) {
    throw new EvalArgumentError('--canary-only is incompatible with --benchmark');
  }
  if (canaryOnly && only) {
    throw new EvalArgumentError('--canary-only is incompatible with --only');
  }
  if (canaryOnly && present('--repeat') && repeat !== 1) {
    throw new EvalArgumentError('--canary-only requires --repeat 1');
  }
  if (benchmark && tier !== 2) {
    throw new EvalArgumentError('--benchmark requires --tier 2');
  }
  if (benchmark && !canary) {
    throw new EvalArgumentError('--benchmark requires --canary');
  }
  if (benchmark && noBuild) {
    throw new EvalArgumentError('--no-build is not allowed with --benchmark');
  }

  const metered = tier === 2 && engines.some((item) => METERED_ENGINES.has(item));
  const confirmPaid = booleans.has('--confirm-paid');
  const maxCostUsd = values.has('--max-cost-usd')
    ? positiveNumber(values.get('--max-cost-usd'), '--max-cost-usd')
    : null;
  if (metered && !dryRun && !help && !confirmPaid) {
    throw new EvalArgumentError('metered API runs require --confirm-paid');
  }
  if (metered && !dryRun && !help && maxCostUsd == null) {
    throw new EvalArgumentError('metered API runs require --max-cost-usd');
  }
  if (!metered && (confirmPaid || maxCostUsd != null)) {
    throw new EvalArgumentError('--confirm-paid/--max-cost-usd require a metered API tier-2 target');
  }

  return {
    tier,
    only,
    fast: booleans.has('--fast'),
    engines: [...new Set(engines)],
    anthropicModels: [...new Set(anthropicModels)],
    kimiModels: [...new Set(kimiModels)],
    repeat,
    repeatExplicit: present('--repeat'),
    canary,
    canaryOnly,
    runCanary: canary || canaryOnly,
    benchmark,
    noBuild,
    dryRun,
    confirmPaid,
    maxCostUsd,
    metered,
    help,
  };
}
