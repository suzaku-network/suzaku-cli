import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the active monitor profile`);
  return value;
}

function positiveTelegramId(env, name) {
  const value = required(env, name);
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive numeric Telegram ID`);
  return value;
}

function groupTelegramId(env, name) {
  const value = required(env, name);
  if (!/^-[1-9]\d*$/.test(value)) throw new Error(`${name} must be a negative numeric Telegram chat ID`);
  return value;
}

function replaceIdentifiers(value, replacements) {
  if (typeof value === 'string') {
    return Object.entries(replacements).reduce(
      (out, [name, replacement]) => out.replaceAll(`\${${name}}`, replacement),
      value,
    );
  }
  if (Array.isArray(value)) return value.map((item) => replaceIdentifiers(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(
      ([key, item]) => [replaceIdentifiers(key, replacements), replaceIdentifiers(item, replacements)],
    ));
  }
  return value;
}

export function renderConfig(template, env = process.env) {
  required(env, 'TELEGRAM_BOT_TOKEN');
  required(env, 'OPENCLAW_GATEWAY_TOKEN');
  const adminId = positiveTelegramId(env, 'TELEGRAM_ADMIN_USER_ID');
  const topicId = env.TELEGRAM_TOPIC_ID?.trim();
  if (topicId && !/^[1-9]\d*$/.test(topicId)) {
    throw new Error('TELEGRAM_TOPIC_ID must be a positive numeric Telegram topic ID when set');
  }
  const serialized = JSON.stringify(template);
  const groupId = serialized.includes('${TELEGRAM_GROUP_ID}')
    ? groupTelegramId(env, 'TELEGRAM_GROUP_ID')
    : undefined;

  const fallbackSetting = env.SUZAKU_ENABLE_ANTHROPIC_FALLBACK?.trim() || 'false';
  if (!['true', 'false'].includes(fallbackSetting)) {
    throw new Error('SUZAKU_ENABLE_ANTHROPIC_FALLBACK must be true or false');
  }

  const config = replaceIdentifiers(structuredClone(template), {
    TELEGRAM_ADMIN_USER_ID: adminId,
    ...(groupId ? { TELEGRAM_GROUP_ID: groupId } : {}),
  });
  const primary = config.agents?.defaults?.model?.primary;
  if (typeof primary !== 'string') throw new Error('active profile has no primary model');
  if (primary.startsWith('moonshot/')) required(env, 'MOONSHOT_API_KEY');
  if (primary.startsWith('anthropic/')) required(env, 'ANTHROPIC_API_KEY');

  const model = config.agents.defaults.model;
  const models = config.agents.defaults.models ?? {};
  const plugins = config.plugins ?? {};
  if (fallbackSetting === 'true') {
    required(env, 'ANTHROPIC_API_KEY');
    if (!Array.isArray(model.fallbacks) || !model.fallbacks.includes('anthropic/claude-sonnet-4-6')) {
      throw new Error('active profile does not define the pinned Anthropic fallback');
    }
    if (!models['anthropic/claude-sonnet-4-6']) {
      throw new Error('active profile does not define the pinned Anthropic fallback model');
    }
    plugins.allow = [...new Set([...(plugins.allow ?? []), 'anthropic'])];
  } else {
    delete model.fallbacks;
    delete models['anthropic/claude-sonnet-4-6'];
    plugins.allow = (plugins.allow ?? []).filter((name) => name !== 'anthropic');
    if (plugins.entries) delete plugins.entries.anthropic;
  }

  return config;
}

export function renderConfigFile(templatePath, outputPath, env = process.env) {
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  const rendered = renderConfig(template, env);
  const temporary = `${outputPath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(rendered, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, outputPath);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [, , templatePath, outputPath] = process.argv;
  if (!templatePath || !outputPath) {
    console.error('usage: render-config.mjs <template> <output>');
    process.exit(2);
  }
  try {
    renderConfigFile(templatePath, outputPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
