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

/** Tool names known to be write operations (destructiveHint: true). */
const WRITE_TOOLS = [
  // middleware
  'middleware_register_operator', 'middleware_add_node', 'middleware_init_stake_update', 'middleware_weight_sync',
  // vault
  'vault_deposit', 'vault_withdraw', 'vault_claim',
  // operator
  'operator_registry_register',
  // l1-registry
  'l1_registry_register',
  // opt-in (all write)
  'opt_in_l1', 'opt_out_l1', 'opt_in_vault', 'opt_out_vault',
  // rewards
  'rewards_distribute', 'rewards_claim',
  // kite-staking (all write)
  'kite_update_staking_config', 'kite_initiate_validator_registration', 'kite_complete_validator_registration',
  'kite_initiate_validator_removal', 'kite_complete_validator_removal',
  'kite_initiate_delegator_registration', 'kite_complete_delegator_registration',
  'kite_initiate_delegator_removal', 'kite_complete_delegator_removal',
  // staking-vault (write subset)
  'staking_vault_deposit', 'staking_vault_request_withdrawal', 'staking_vault_claim_withdrawal',
  'staking_vault_process_epoch', 'staking_vault_add_operator', 'staking_vault_update_operator_allocations',
  'staking_vault_initiate_validator_registration', 'staking_vault_complete_validator_registration',
  'staking_vault_initiate_validator_removal', 'staking_vault_complete_validator_removal',
  'staking_vault_initiate_delegator_registration', 'staking_vault_complete_delegator_registration',
  'staking_vault_initiate_delegator_removal', 'staking_vault_complete_delegator_removal',
  // balancer
  'balancer_set_up_security_module', 'balancer_resend_validator_registration',
  'balancer_resend_weight_update', 'balancer_resend_validator_removal', 'balancer_transfer_l1_ownership',
  // poa-security-module (all write)
  'poa_add_node', 'poa_complete_validator_registration', 'poa_remove_node',
  'poa_complete_validator_removal', 'poa_init_weight_update', 'poa_complete_weight_update',
  // rewards (new write tools)
  'rewards_set_amount', 'rewards_claim_undistributed',
  // rewards (Safe propose tools — off-chain proposal, humans sign in the Safe UI)
  'rewards_set_amount_propose', 'rewards_distribute_propose',
  // lst-wrapper (write subset)
  'lst_wrapper_deposit', 'lst_wrapper_redeem', 'lst_wrapper_harvest',
  // uptime (write subset)
  'uptime_report_validator', 'uptime_compute_operator_uptime',
];

function getToolNames(server: McpServer): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys((server as any)._registeredTools);
}

// Mirrors the registration wiring in server.ts
function registerAllTools(server: McpServer, readOnly: boolean, proposeOnly = false) {
  const suppressWrites = readOnly || proposeOnly;
  registerMiddlewareTools(server, suppressWrites);
  registerVaultTools(server, suppressWrites);
  registerOperatorTools(server, suppressWrites);
  registerL1RegistryTools(server, suppressWrites);
  registerOptInTools(server, suppressWrites);
  registerRewardsTools(server, readOnly, proposeOnly);
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
    // Should have a meaningful number of read tools (64 read tools expected across all tool files)
    expect(tools.length).toBeGreaterThanOrEqual(60);
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
    // Total should be read + write
    expect(tools.length).toBeGreaterThan(WRITE_TOOLS.length);
  });
});

describe('--propose-only mode', () => {
  const PROPOSE_TOOLS = ['rewards_set_amount_propose', 'rewards_distribute_propose'];

  it('registers exactly the two propose tools out of the write surface', () => {
    const server = new McpServer({ name: 'test', version: '0.1.0' });
    registerAllTools(server, false, true);

    const tools = getToolNames(server);
    const writeToolsPresent = tools.filter(t => WRITE_TOOLS.includes(t));
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
    expect(proposeTools.length).toBe(readTools.length + PROPOSE_TOOLS.length);
  });
});
