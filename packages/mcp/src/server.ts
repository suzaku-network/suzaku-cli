#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

import { setMcpServer } from './cli-runner.js';
import { setGuardServer } from './guard.js';
import { registerMiddlewareTools } from './tools/middleware.js';
import { registerVaultTools } from './tools/vault.js';
import { registerOperatorTools } from './tools/operator.js';
import { registerL1RegistryTools } from './tools/l1-registry.js';
import { registerOptInTools } from './tools/opt-in.js';
import { registerRewardsTools } from './tools/rewards.js';
import { registerBalancerTools } from './tools/balancer.js';
import { registerKiteStakingTools } from './tools/kite-staking.js';
import { registerStakingVaultTools } from './tools/staking-vault.js';

const server = new McpServer({
  name: 'suzaku',
  version: '0.1.0',
});

// Wire up MCP protocol logging
setMcpServer(server);
setGuardServer(server);

// ── Resources ──

server.resource(
  'networks',
  'config://networks',
  {
    description: 'Supported networks and their RPC endpoints',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify({
        mainnet: { chainId: 43114, name: 'Avalanche Mainnet', rpcUrl: 'https://api.avax.network/ext/bc/C/rpc' },
        fuji: { chainId: 43113, name: 'Avalanche Fuji Testnet', rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc' },
        anvil: { name: 'Local Anvil (development)', rpcUrl: 'http://127.0.0.1:8545' },
        kitetestnet: { chainId: 2368, name: 'Kite Testnet', rpcUrl: 'https://rpc-testnet.gokite.ai/' },
      }, null, 2),
      mimeType: 'application/json',
    }],
  }),
);

server.resource(
  'contracts',
  'config://contracts',
  {
    description: 'Known contract addresses per network',
    mimeType: 'application/json',
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      text: JSON.stringify({
        _note: 'Contract addresses are deployment-specific. Use the registry tools (operator_registry_get_all, l1_registry_get_all) to discover live addresses, or pass addresses directly when calling tools.',
        registries: {
          operatorRegistry: 'Use operator_registry_get_all to list registered operators',
          l1Registry: 'Use l1_registry_get_all to list registered L1s',
        },
      }, null, 2),
      mimeType: 'application/json',
    }],
  }),
);

// ── Prompts ──

server.prompt(
  'check-operator-health',
  'Check the health of an operator: get stake, active nodes, and epoch status',
  {
    middlewareAddress: z.string().describe('L1Middleware contract address'),
    operatorAddress: z.string().describe('Operator address to check'),
    network: z.string().optional().describe('Network (mainnet, fuji, anvil, kitetestnet)'),
  },
  ({ middlewareAddress, operatorAddress, network }) => ({
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Check the health of operator ${operatorAddress} on middleware ${middlewareAddress}${network ? ` (network: ${network})` : ''}. Please:\n1. Get the current epoch using middleware_get_current_epoch\n2. Get the operator's account info using middleware_account_info\n3. Get locked stake using middleware_get_operator_locked_stake\n4. Get available stake using middleware_get_operator_available_stake\n5. Get active nodes for the current epoch using middleware_get_active_nodes\nSummarize the operator's health status.`,
      },
    }],
  }),
);

server.prompt(
  'register-new-operator',
  'Step-by-step guide for the full operator registration workflow',
  {
    network: z.string().optional().describe('Network (mainnet, fuji, anvil, kitetestnet)'),
  },
  ({ network }) => ({
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Guide me through registering a new operator on the Suzaku protocol${network ? ` on ${network}` : ''}. The steps are:\n1. Register in the OperatorRegistry using operator_registry_register (requires a metadata URL)\n2. Opt into an L1 using opt_in_l1 (required before participating in that L1's validator set)\n3. Opt into a vault using opt_in_vault (required before receiving delegated stake)\n4. Register as an operator in the L1Middleware using middleware_register_operator\n5. Add validator nodes using middleware_add_node\nFor each step, ask me for the required parameters before proceeding.`,
      },
    }],
  }),
);

server.prompt(
  'validator-lifecycle',
  'Guide through the two-phase validator registration or removal process',
  {
    operation: z.string().describe('Operation: "register" or "remove"'),
    manager: z.string().optional().describe('Manager type: "kite" (KiteStakingManager) or "vault" (StakingVault). Defaults to "kite"'),
  },
  ({ operation, manager }) => {
    const mgr = manager === 'vault' ? 'staking vault' : 'KiteStakingManager';
    const prefix = manager === 'vault' ? 'staking_vault' : 'kite';

    if (operation === 'remove') {
      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Guide me through removing a validator via ${mgr}. This is a two-phase process:\n\nPhase 1 — Initiate removal:\n- Use ${prefix}_initiate_validator_removal with the contract address and nodeId\n- Save the transaction hash from the response\n\nPhase 2 — Complete removal:\n- Use ${prefix}_complete_validator_removal with the contract address and the initiate tx hash\n- This involves a cross-chain warp message to the P-Chain (may take several minutes)\n\nAsk me for the required parameters before each step.`,
          },
        }],
      };
    }

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Guide me through registering a new validator via ${mgr}. This is a two-phase process:\n\nPhase 1 — Initiate registration:\n- Use ${prefix}_initiate_validator_registration with the contract address, nodeId, BLS key, and stake amount\n- Save the transaction hash from the response\n\nPhase 2 — Complete registration:\n- Use ${prefix}_complete_validator_registration with the contract address, initiate tx hash, and BLS proof of possession\n- This involves a cross-chain warp message to the P-Chain (may take several minutes)\n\nAsk me for the required parameters before each step.`,
        },
      }],
    };
  },
);

// ── Tool Groups ──

registerMiddlewareTools(server);
registerVaultTools(server);
registerOperatorTools(server);
registerL1RegistryTools(server);
registerOptInTools(server);
registerRewardsTools(server);
registerBalancerTools(server);
registerKiteStakingTools(server);
registerStakingVaultTools(server);

// Start the server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
