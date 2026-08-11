import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderConfig } from '../deploy/openclaw/render-config.mjs';

const load = (name) => JSON.parse(readFileSync(new URL(`../deploy/openclaw/${name}`, import.meta.url), 'utf8'));
const baseEnv = {
  MOONSHOT_API_KEY: 'moonshot-test-key',
  TELEGRAM_BOT_TOKEN: 'telegram-test-token',
  TELEGRAM_ADMIN_USER_ID: '123456789',
  TELEGRAM_GROUP_ID: '-1001234567890',
  OPENCLAW_GATEWAY_TOKEN: 'gateway-test-token',
};

describe('OpenClaw monitor config rendering', () => {
  it('renders Kimi-only by default and removes every active Anthropic reference', () => {
    const config = renderConfig(load('openclaw.json'), baseEnv);
    expect(config.agents.defaults.model).toEqual({ primary: 'moonshot/kimi-k3' });
    expect(config.models.providers.moonshot.models).toEqual([
      { id: 'kimi-k3', name: 'Kimi K3' },
    ]);
    expect(config.models.providers.moonshot).toMatchObject({
      baseUrl: 'https://api.moonshot.ai/v1',
      apiKey: '${MOONSHOT_API_KEY}',
      api: 'openai-completions',
    });
    expect(config.agents.defaults.models['anthropic/claude-sonnet-4-6']).toBeUndefined();
    expect(config.plugins.allow).not.toContain('anthropic');
    expect(config.channels.telegram.allowFrom).toEqual(['tg:123456789']);
    expect(config.channels.telegram.groups['-1001234567890']).toEqual({
      groupPolicy: 'open',
      requireMention: true,
    });
    expect(config.channels.telegram.botToken).toBe('${TELEGRAM_BOT_TOKEN}');
    expect(config.mcp.servers.suzaku.env).not.toHaveProperty('ETHERSCAN_API_KEY');
    expect(config.mcp.servers.suzaku.env).not.toHaveProperty('SNOWSCAN_API_KEY');
  });

  it('keeps only optional explorer references backed by a real environment value', () => {
    const canonical = renderConfig(load('openclaw.json'), {
      ...baseEnv,
      ETHERSCAN_API_KEY: 'etherscan-test-key',
    });
    expect(canonical.mcp.servers.suzaku.env.ETHERSCAN_API_KEY).toBe('${ETHERSCAN_API_KEY}');
    expect(canonical.mcp.servers.suzaku.env).not.toHaveProperty('SNOWSCAN_API_KEY');

    const legacy = renderConfig(load('openclaw.json'), {
      ...baseEnv,
      SNOWSCAN_API_KEY: 'snowscan-test-key',
    });
    expect(legacy.mcp.servers.suzaku.env.SNOWSCAN_API_KEY).toBe('${SNOWSCAN_API_KEY}');
    expect(legacy.mcp.servers.suzaku.env).not.toHaveProperty('ETHERSCAN_API_KEY');
  });

  it('enables the pinned Anthropic fallback only with explicit opt-in and a key', () => {
    const config = renderConfig(load('openclaw.json'), {
      ...baseEnv,
      SUZAKU_ENABLE_ANTHROPIC_FALLBACK: 'true',
      ANTHROPIC_API_KEY: 'anthropic-test-key',
    });
    expect(config.agents.defaults.model.fallbacks).toEqual(['anthropic/claude-sonnet-4-6']);
    expect(config.plugins.allow).toContain('anthropic');

    expect(() => renderConfig(load('openclaw.json'), {
      ...baseEnv,
      SUZAKU_ENABLE_ANTHROPIC_FALLBACK: 'true',
    })).toThrow('ANTHROPIC_API_KEY is required');
  });

  it('keeps Codex as a separately rendered inactive option without requiring Moonshot', () => {
    const { MOONSHOT_API_KEY: _unused, ...codexEnv } = baseEnv;
    const config = renderConfig(load('openclaw-codex.json'), codexEnv);
    expect(config.agents.defaults.model).toEqual({ primary: 'openai/gpt-5.5' });
    expect(config.plugins.allow).toContain('codex');
    expect(config.plugins.allow).not.toContain('moonshot');
    expect(config.plugins.allow).not.toContain('anthropic');
  });

  it('fails before startup for missing credentials, malformed IDs, or invalid fallback settings', () => {
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, MOONSHOT_API_KEY: '' })).toThrow('MOONSHOT_API_KEY');
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, TELEGRAM_BOT_TOKEN: '' })).toThrow('TELEGRAM_BOT_TOKEN');
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, OPENCLAW_GATEWAY_TOKEN: '' })).toThrow('OPENCLAW_GATEWAY_TOKEN');
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, TELEGRAM_GROUP_ID: '' })).toThrow('TELEGRAM_GROUP_ID');
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, TELEGRAM_ADMIN_USER_ID: '@admin' })).toThrow('positive numeric Telegram ID');
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, TELEGRAM_ADMIN_USER_ID: '-123' })).toThrow('positive numeric Telegram ID');
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, TELEGRAM_GROUP_ID: '123' })).toThrow('negative numeric Telegram chat ID');
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, TELEGRAM_TOPIC_ID: '-5' })).toThrow('positive numeric Telegram topic ID');
    expect(() => renderConfig(load('openclaw.json'), { ...baseEnv, SUZAKU_ENABLE_ANTHROPIC_FALLBACK: 'yes' })).toThrow('must be true or false');
  });
});
