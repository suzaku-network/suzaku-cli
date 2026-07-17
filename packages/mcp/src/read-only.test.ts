import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMiddlewareTools, registerMiddlewarePublicCacheTools } from './tools/middleware.js';
import { registerVaultTools } from './tools/vault.js';
import { registerOperatorTools } from './tools/operator.js';
import { registerL1RegistryTools } from './tools/l1-registry.js';
import { registerOptInTools } from './tools/opt-in.js';
import { registerRewardsTools } from './tools/rewards.js';
import { registerKiteStakingTools } from './tools/kite-staking.js';
import { registerStakingVaultTools } from './tools/staking-vault.js';
import { registerBalancerTools } from './tools/balancer.js';
import { registerPoaSecurityModuleTools } from './tools/poa-security-module.js';
import { registerLstWrapperTools } from './tools/lst-wrapper.js';
import { registerVaultHelperTools } from './tools/vault-helper.js';
import { registerUptimeTools } from './tools/uptime.js';
import { registerHeartbeatTools } from './tools/heartbeat.js';
import {
  EXPECTED_PROFILE_TOOL_NAMES,
  FULL_WRITE_TOOL_NAMES,
  PROPOSE_TOOL_NAMES,
  PUBLIC_WRITE_TOOL_NAMES,
} from './test-support/tool-surfaces.js';

const WRITE_TOOLS: readonly string[] = FULL_WRITE_TOOL_NAMES;
const PUBLIC_WRITE_TOOLS: readonly string[] = PUBLIC_WRITE_TOOL_NAMES;
const ALL_WRITE_TOOLS = [...WRITE_TOOLS, ...PUBLIC_WRITE_TOOLS];

function getToolNames(server: McpServer): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys((server as any)._registeredTools);
}

// Mirrors the registration wiring in server.ts
function registerAllTools(server: McpServer, readOnly: boolean, proposeOnly = false, publicWrite = false) {
  const suppressWrites = readOnly || proposeOnly || publicWrite;
  registerMiddlewareTools(server, suppressWrites);
  if (publicWrite) registerMiddlewarePublicCacheTools(server);
  registerVaultTools(server, suppressWrites);
  registerOperatorTools(server, suppressWrites);
  registerL1RegistryTools(server, suppressWrites);
  registerOptInTools(server, suppressWrites);
  registerRewardsTools(server, readOnly || publicWrite, proposeOnly);
  registerKiteStakingTools(server, suppressWrites);
  registerStakingVaultTools(server, suppressWrites);
  registerBalancerTools(server, suppressWrites);
  if (!suppressWrites) registerPoaSecurityModuleTools(server);
  registerLstWrapperTools(server, suppressWrites);
  registerVaultHelperTools(server);
  registerUptimeTools(server, suppressWrites);
  registerHeartbeatTools(server);
}

describe('--read-only mode', () => {
  it('registers zero write tools when readOnly is true', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, true);

    const tools = getToolNames(server);
    const writeToolsPresent = tools.filter(t => ALL_WRITE_TOOLS.includes(t));
    expect(writeToolsPresent).toEqual([]);
  });

  it('registers all read tools when readOnly is true', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, true);

    const tools = getToolNames(server);
    // Every registered tool should be a read tool (not in WRITE_TOOLS)
    for (const tool of tools) {
      expect(ALL_WRITE_TOOLS).not.toContain(tool);
    }
    // health_check is registered directly in server.ts, outside registerAllTools.
    expect([...tools, 'health_check'].sort()).toEqual(EXPECTED_PROFILE_TOOL_NAMES.readOnly);
  });

  it('registers no tool with destructiveHint when readOnly is true (catches unguarded future write tools)', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registered = (server as any)._registeredTools as Record<string, { annotations?: { destructiveHint?: boolean } }>;
    const destructive = Object.entries(registered)
      .filter(([, t]) => t.annotations?.destructiveHint === true)
      .map(([name]) => name);
    expect(destructive).toEqual([]);
  });

  it('registers all tools (read + write) when readOnly is false', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, false);

    const tools = getToolNames(server);
    // All write tools should be present
    for (const writeTool of WRITE_TOOLS) {
      expect(tools).toContain(writeTool);
    }
    expect([...tools, 'health_check'].sort()).toEqual(EXPECTED_PROFILE_TOOL_NAMES.full);
  });
});

describe('--propose-only mode', () => {
  const PROPOSE_TOOLS: readonly string[] = PROPOSE_TOOL_NAMES;

  it('registers exactly the two propose tools out of the write surface', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, false, true);

    const tools = getToolNames(server);
    const writeToolsPresent = tools.filter(t => ALL_WRITE_TOOLS.includes(t));
    expect(writeToolsPresent.sort()).toEqual([...PROPOSE_TOOLS].sort());
  });

  it('registers no destructive tool beyond the two propose tools (catches future write leakage)', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, false, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registered = (server as any)._registeredTools as Record<string, { annotations?: { destructiveHint?: boolean } }>;
    const destructive = Object.entries(registered)
      .filter(([, t]) => t.annotations?.destructiveHint === true)
      .map(([name]) => name);
    expect(destructive.sort()).toEqual([...PROPOSE_TOOLS].sort());
  });

  it('keeps the full read surface available', () => {
    const readOnlyServer = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(readOnlyServer, true);
    const proposeServer = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(proposeServer, false, true);

    const readTools = getToolNames(readOnlyServer);
    const proposeTools = getToolNames(proposeServer);
    for (const tool of readTools) {
      expect(proposeTools).toContain(tool);
    }
    expect([...proposeTools, 'health_check'].sort()).toEqual(EXPECTED_PROFILE_TOOL_NAMES.proposeOnly);
  });
});

describe('--public-write mode', () => {
  it('registers exactly the public cache tool out of the write surface', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, false, false, true);

    const tools = getToolNames(server);
    const writeToolsPresent = tools.filter(t => ALL_WRITE_TOOLS.includes(t));
    expect(writeToolsPresent.sort()).toEqual([...PUBLIC_WRITE_TOOLS].sort());
  });

  it('registers no destructive tool beyond the public cache tool', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, false, false, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registered = (server as any)._registeredTools as Record<string, { annotations?: { destructiveHint?: boolean } }>;
    const destructive = Object.entries(registered)
      .filter(([, t]) => t.annotations?.destructiveHint === true)
      .map(([name]) => name);
    expect(destructive.sort()).toEqual([...PUBLIC_WRITE_TOOLS].sort());
  });

  it('keeps the full read surface available', () => {
    const readOnlyServer = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(readOnlyServer, true);
    const publicWriteServer = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(publicWriteServer, false, false, true);

    const readTools = getToolNames(readOnlyServer);
    const publicWriteTools = getToolNames(publicWriteServer);
    for (const tool of readTools) {
      expect(publicWriteTools).toContain(tool);
    }
    expect([...publicWriteTools, 'health_check'].sort()).toEqual(EXPECTED_PROFILE_TOOL_NAMES.publicWrite);
  });
});
