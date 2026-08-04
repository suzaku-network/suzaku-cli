import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMiddlewareTools } from './tools/middleware.js';
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
} from './test-support/tool-surfaces.js';

const WRITE_TOOLS: readonly string[] = FULL_WRITE_TOOL_NAMES;

function getToolNames(server: McpServer): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys((server as any)._registeredTools);
}

// Mirrors the registration wiring in server.ts
function registerAllTools(server: McpServer, readOnly: boolean) {
  registerMiddlewareTools(server, readOnly);
  registerVaultTools(server, readOnly);
  registerOperatorTools(server, readOnly);
  registerL1RegistryTools(server, readOnly);
  registerOptInTools(server, readOnly);
  registerRewardsTools(server, readOnly);
  registerKiteStakingTools(server, readOnly);
  registerStakingVaultTools(server, readOnly);
  registerBalancerTools(server, readOnly);
  if (!readOnly) registerPoaSecurityModuleTools(server);
  registerLstWrapperTools(server, readOnly);
  registerVaultHelperTools(server);
  registerUptimeTools(server, readOnly);
  registerHeartbeatTools(server);
}

describe('--read-only mode', () => {
  it('registers zero write tools when readOnly is true', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, true);

    const tools = getToolNames(server);
    const writeToolsPresent = tools.filter(t => WRITE_TOOLS.includes(t));
    expect(writeToolsPresent).toEqual([]);
  });

  it('registers all read tools when readOnly is true', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, true);

    const tools = getToolNames(server);
    // Every registered tool should be a read tool (not in WRITE_TOOLS)
    for (const tool of tools) {
      expect(WRITE_TOOLS).not.toContain(tool);
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
