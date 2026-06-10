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
];

function getToolNames(server: McpServer): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.keys((server as any)._registeredTools);
}

function registerAllTools(server: McpServer, readOnly: boolean) {
  registerMiddlewareTools(server, readOnly);
  registerVaultTools(server, readOnly);
  registerOperatorTools(server, readOnly);
  registerL1RegistryTools(server, readOnly);
  if (!readOnly) registerOptInTools(server);
  registerRewardsTools(server, readOnly);
  if (!readOnly) registerKiteStakingTools(server);
  registerStakingVaultTools(server, readOnly);
  registerBalancerTools(server, readOnly);
  if (!readOnly) registerPoaSecurityModuleTools(server);
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
    // Should have a meaningful number of read tools (37 read tools expected)
    expect(tools.length).toBeGreaterThanOrEqual(35);
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
