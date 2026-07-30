import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { bridgedStdioCommand } from '../eval/stdio-bridge.mjs';
import {
  EXPECTED_PROFILE_TOOL_NAMES,
  PROPOSE_TOOL_NAMES,
  PUBLIC_WRITE_TOOL_NAMES,
} from './test-support/tool-surfaces.js';
import { resolveProfileConfig } from './profile-config.js';

const SERVER_PATH = new URL('../dist/server.js', import.meta.url).pathname;
const DUMMY_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const MIDDLEWARE = '0x9411307279456450ABF9B5181aA7a02271f0DC34';

type ProfileName = keyof typeof EXPECTED_PROFILE_TOOL_NAMES;
interface Profile {
  name: ProfileName;
  args: string[];
  env: Record<string, string>;
  flags: { readOnly: boolean; proposeOnly: boolean; publicWrite: boolean };
}

let tempRoot: string;
let fakeCli: string;

beforeAll(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'suzaku-mcp-stdio-test-'));
  fakeCli = join(tempRoot, 'fake-cli.mjs');
  writeFileSync(fakeCli, [
    '#!/usr/bin/env node',
    "process.stdout.write(JSON.stringify({ success: true, data: { fakeCli: true, args: process.argv.slice(2) } }));",
  ].join('\n'));
  chmodSync(fakeCli, 0o700);
});

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: tempRoot,
    SUZAKU_CLI_PATH: fakeCli,
    SUZAKU_MCP_AUDIT_DIR: tempRoot,
    ...extra,
  };
}

function profiles(): Profile[] {
  return [
    {
      name: 'full', args: [], env: baseEnv({ SUZAKU_PK: DUMMY_KEY }),
      flags: { readOnly: false, proposeOnly: false, publicWrite: false },
    },
    {
      name: 'readOnly', args: ['--read-only'], env: baseEnv(),
      flags: { readOnly: true, proposeOnly: false, publicWrite: false },
    },
    {
      name: 'proposeOnly', args: ['--propose-only'], env: baseEnv({ SUZAKU_MAX_REWARDS_AMOUNT: '1000' }),
      flags: { readOnly: false, proposeOnly: true, publicWrite: false },
    },
    {
      name: 'publicWrite', args: ['--public-write'], env: baseEnv({ SUZAKU_PK: DUMMY_KEY, SUZAKU_MIDDLEWARE_ADDRESS: MIDDLEWARE }),
      flags: { readOnly: false, proposeOnly: false, publicWrite: true },
    },
  ];
}

function parseToolPayload(result: { content?: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const text = result.content?.filter((item) => item.type === 'text').map((item) => item.text ?? '').join('\n') ?? '';
  return JSON.parse(text) as Record<string, unknown>;
}

describe('built stdio profile contract', () => {
  for (const profileName of ['full', 'readOnly', 'proposeOnly', 'publicWrite'] as const) {
    it(`${profileName} exposes the exact surface and executes health_check`, async () => {
      const profile = profiles().find((item) => item.name === profileName)!;
      const launch = bridgedStdioCommand(process.execPath, [SERVER_PATH, ...profile.args]);
      const transport = new StdioClientTransport({
        ...launch,
        env: profile.env,
      });
      const client = new Client({ name: `profile-test-${profile.name}`, version: '0.0.1' });
      await client.connect(transport);
      try {
        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_PROFILE_TOOL_NAMES[profile.name]);

        const destructive = tools
          .filter((tool) => tool.annotations?.destructiveHint === true)
          .map((tool) => tool.name)
          .sort();
        if (profile.name === 'readOnly') expect(destructive).toEqual([]);
        if (profile.name === 'proposeOnly') expect(destructive).toEqual([...PROPOSE_TOOL_NAMES].sort());
        if (profile.name === 'publicWrite') expect(destructive).toEqual([...PUBLIC_WRITE_TOOL_NAMES].sort());

        const health = await client.callTool({ name: 'health_check', arguments: {} });
        expect(health.isError).not.toBe(true);
        const payload = parseToolPayload(health as Parameters<typeof parseToolPayload>[0]);
        expect(payload).toMatchObject({ server: 'ok', version: '0.1.0', cli: 'ok', ...profile.flags });
      } finally {
        await client.close();
      }
    }, 30_000);
  }

  it('read-only model-visible surfaces contain no internal configuration names', async () => {
    // The read-only profile is the public monitor bot: nothing it shows the model
    // may name server env vars. The full profile intentionally documents signer
    // requirements in its private write-tool descriptions and is not swept here.
    const INTERNAL_NAME =
      /\b(?:SUZAKU_[A-Z0-9_]+|SAFE_API_KEY(?:_FILE)?|ANTHROPIC_API_KEY|SNOWSCAN_API_KEY|OPENCLAW_GATEWAY_TOKEN|GNUPGHOME|SIG_AGG_URL|PASSWORD_STORE_DIR|PK_PCHAIN)\b/;
    const profile = profiles().find((item) => item.name === 'readOnly')!;
    const launch = bridgedStdioCommand(process.execPath, [SERVER_PATH, ...profile.args]);
    const transport = new StdioClientTransport({ ...launch, env: profile.env });
    const client = new Client({ name: 'leak-sweep-test', version: '0.0.1' });
    await client.connect(transport);
    try {
      const surfaces: string[] = [];
      const { tools } = await client.listTools();
      for (const tool of tools) surfaces.push(JSON.stringify(tool));
      surfaces.push(client.getInstructions() ?? '');
      const { prompts } = await client.listPrompts();
      for (const prompt of prompts) {
        const args: Record<string, string> = {};
        for (const arg of prompt.arguments ?? []) {
          args[arg.name] =
            arg.name.endsWith('Address') ? MIDDLEWARE :
            arg.name === 'operation' ? 'register' :
            arg.name === 'manager' ? 'kite' :
            arg.name === 'network' ? 'fuji' :
            arg.name === 'epoch' ? '1' : 'placeholder';
        }
        const rendered = await client.getPrompt({ name: prompt.name, arguments: args });
        surfaces.push(JSON.stringify(rendered.messages));
      }
      for (const surface of surfaces) {
        expect(surface.match(INTERNAL_NAME)?.[0] ?? null).toBeNull();
      }
    } finally {
      await client.close();
    }
  }, 30_000);

  it('fails closed at startup when constrained-profile bounds are absent', () => {
    const cases = [
      { args: ['--propose-only'], env: baseEnv(), marker: 'requires SUZAKU_MAX_REWARDS_AMOUNT' },
      { args: ['--public-write'], env: baseEnv({ SUZAKU_MIDDLEWARE_ADDRESS: MIDDLEWARE }), marker: 'requires a signing method' },
      { args: ['--read-only', '--propose-only'], env: baseEnv({ SUZAKU_MAX_REWARDS_AMOUNT: '1000' }), marker: 'mutually exclusive' },
    ];
    for (const testCase of cases) {
      expect(() => resolveProfileConfig(testCase.args, testCase.env)).toThrow(testCase.marker);
    }
  });
});
