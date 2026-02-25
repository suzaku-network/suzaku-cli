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

import { setMcpServer, runCli, formatResult } from './cli-runner.js';
import { setGuardServer } from './guard.js';
import { Network, RpcUrl } from './schemas.js';
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

const server = new McpServer({
  name: 'suzaku',
  version: '0.1.0',
});

// Wire up MCP server references.
// Both modules hold a reference to the same server instance for different purposes:
// cli-runner uses it for protocol logging + mainnet elicitation; guard uses it for
// testnet write confirmation elicitation. Kept separate to avoid coupling these concerns.
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
        _note: 'Static values mirrored from src/lib/chainList.ts. Use --rpc-url with network=custom to override.',
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
        _note: 'Contract addresses are deployment-specific. Use discovery tools to find live addresses.',
        discovery: {
          entryPoint: 'discover_network — returns all addresses for a network (no address input needed)',
          fromMiddleware: 'middleware_operator_dashboard or middleware_network_overview — resolves linked addresses automatically',
          manual: {
            l1Registry: 'l1_registry_get_all — lists all (balancer, middleware, metadataUrl) tuples',
            operatorRegistry: 'operator_registry_get_all — lists all global operators',
            balancer: 'balancer_get_security_modules — lists security modules from a balancer address',
            middleware: 'Use get-linked-addresses (via discover_network) to find balancer, vaultManager, primaryAsset',
          },
        },
        notDiscoverable: [
          'UptimeTracker — pass explicitly to middleware_operator_dashboard/middleware_uptime_report',
          'RewardsNativeToken — pass explicitly to middleware_epoch_rewards_report',
          'KiteStakingManager — no registry, must be known out-of-band',
          'StakingVault — may appear in VaultManager listing, but address must be provided to staking_vault_* tools',
        ],
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
        text: `Check the health of operator ${operatorAddress} on middleware ${middlewareAddress}${network ? ` (network: ${network})` : ''}. Please:\n0. If you don't have the middlewareAddress, call discover_network first to list all L1s and their middleware addresses.\n1. Get the current epoch using middleware_get_current_epoch\n2. Get the operator's account info using middleware_account_info\n3. Get locked stake using middleware_get_operator_locked_stake\n4. Get available stake using middleware_get_operator_available_stake\n5. Get active nodes for the current epoch using middleware_get_active_nodes\nSummarize the operator's health status.`,
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
        text: `Guide me through registering a new operator on the Suzaku protocol${network ? ` on ${network}` : ''}. The steps are:\n0. Start by calling discover_network to discover the operatorRegistry, L1Middleware, and available vaults for the target network.\n1. Register in the OperatorRegistry using operator_registry_register (requires a metadata URL)\n2. Opt into an L1 using opt_in_l1 (required before participating in that L1's validator set)\n3. Opt into a vault using opt_in_vault (required before receiving delegated stake)\n4. Register as an operator in the L1Middleware using middleware_register_operator\n5. Add validator nodes using middleware_add_node\nFor each step, ask me for the required parameters before proceeding.`,
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
            text: `Guide me through removing a validator via ${mgr}. If you don't have the contract address, call discover_network to find the middleware, then use middleware_operator_dashboard to get the operator's linked addresses.\n\nThis is a two-phase process:\n\nPhase 1 — Initiate removal:\n- Use ${prefix}_initiate_validator_removal with the contract address and nodeId\n- Save the transaction hash from the response\n\nPhase 2 — Complete removal:\n- Use ${prefix}_complete_validator_removal with the contract address and the initiate tx hash\n- This involves a cross-chain warp message to the P-Chain (may take several minutes)\n\nAsk me for the required parameters before each step.`,
          },
        }],
      };
    }

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Guide me through registering a new validator via ${mgr}. If you don't have the contract address, call discover_network to find the middleware, then use middleware_operator_dashboard to get the operator's linked addresses.\n\nThis is a two-phase process:\n\nPhase 1 — Initiate registration:\n- Use ${prefix}_initiate_validator_registration with the contract address, nodeId, BLS key, and stake amount\n- Save the transaction hash from the response\n\nPhase 2 — Complete registration:\n- Use ${prefix}_complete_validator_registration with the contract address, initiate tx hash, and BLS proof of possession\n- This involves a cross-chain warp message to the P-Chain (may take several minutes)\n\nAsk me for the required parameters before each step.`,
        },
      }],
    };
  },
);

// ── Health Check ──

server.tool(
  'health_check',
  'Verify MCP server setup: CLI reachable, signing method configured, optional network connectivity test',
  {
    network: Network.optional(),
    rpcUrl: RpcUrl,
  },
  { readOnlyHint: true, idempotentHint: true },
  async ({ network, rpcUrl }) => {
    const status: Record<string, unknown> = { server: 'ok', version: '0.1.0' };

    // Check signing method
    if (process.env.SUZAKU_MCP_LEDGER === 'true') {
      status.signer = 'ledger';
    } else if (process.env.SUZAKU_SECRET_NAME) {
      status.signer = 'gpg-keystore';
      status.secretName = '[configured]';
    } else if (process.env.SUZAKU_PK) {
      status.signer = 'private-key';
    } else {
      status.signer = 'none';
      status.signerWarning = 'No signing method configured. Write operations will fail. Set SUZAKU_PK, SUZAKU_SECRET_NAME, or SUZAKU_MCP_LEDGER=true.';
    }

    if (process.env.SUZAKU_SAFE_ADDRESS) {
      status.safeAddress = process.env.SUZAKU_SAFE_ADDRESS;
    }
    if (process.env.SUZAKU_PCHAIN_PK) {
      status.pchainSigner = 'configured';
    }

    // Use operator-registry get-all as a connectivity + CLI health probe
    if (network || rpcUrl) {
      const probe = await runCli(
        ['operator-registry', 'get-all'],
        { network: network ?? undefined, rpcUrl },
      );
      status.cli = probe.success ? 'ok' : 'error';
      if (!probe.success) {
        status.cliError = probe.error;
      }
      status.network = network ?? 'mainnet';
    } else {
      // Without a network, just verify the CLI binary is reachable by invoking --help
      const probe = await runCli(['--help'], {});
      status.cli = probe.success ? 'ok' : 'unreachable';
      if (!probe.success) {
        status.cliError = probe.error;
      }
    }

    // Report guard config
    const guardConfig: Record<string, string> = {};
    if (process.env.SUZAKU_MCP_SUGGEST) guardConfig.suggest = process.env.SUZAKU_MCP_SUGGEST;
    if (process.env.SUZAKU_MCP_REQUIRE_CONFIRM) guardConfig.requireConfirm = process.env.SUZAKU_MCP_REQUIRE_CONFIRM;
    if (process.env.SUZAKU_MCP_MAX_AVAX_PER_TX) guardConfig.maxAvaxPerTx = process.env.SUZAKU_MCP_MAX_AVAX_PER_TX;
    if (process.env.SUZAKU_MCP_ALLOW_TOOLS) guardConfig.allowTools = process.env.SUZAKU_MCP_ALLOW_TOOLS;
    if (process.env.SUZAKU_MCP_DENY_TOOLS) guardConfig.denyTools = process.env.SUZAKU_MCP_DENY_TOOLS;
    if (process.env.SUZAKU_MCP_DRY_RUN) guardConfig.dryRun = process.env.SUZAKU_MCP_DRY_RUN;
    if (Object.keys(guardConfig).length > 0) {
      status.guardConfig = guardConfig;
    }

    return formatResult({ success: true, data: status });
  },
);

// ── Tool Groups ──

registerMiddlewareTools(server);
registerVaultTools(server);
registerOperatorTools(server);
registerL1RegistryTools(server);
registerOptInTools(server);
registerRewardsTools(server);
registerKiteStakingTools(server);
registerStakingVaultTools(server);
registerBalancerTools(server);
registerPoaSecurityModuleTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
