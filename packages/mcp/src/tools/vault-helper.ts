import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runCli, formatResult } from '../cli-runner.js';
import { Address, Network, RpcUrl } from '../schemas.js';

export function registerVaultHelperTools(server: McpServer) {
  // ── Reads ──

  server.tool(
    'vault_helper_info',
    'Get the factory addresses (VaultFactory and LSTWrapperFactory) registered in a VaultHelper contract',
    {
      vaultHelperAddress: Address.describe('VaultHelper contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultHelperAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['vault-helper', 'info', vaultHelperAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'vault_helper_get_pending_withdraws',
    'List all pending (unclaimed) withdrawals for a user across epochs in a vault — use this to answer "what is waiting to be claimed?"',
    {
      vaultHelperAddress: Address.describe('VaultHelper contract address'),
      vaultAddress: Address.describe('Vault contract address'),
      user: Address.describe('User address whose pending withdrawals to query'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultHelperAddress, vaultAddress, user, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['vault-helper', 'get-pending-withdraws', vaultHelperAddress, vaultAddress, '--user', user],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'vault_helper_get_claimable_reward',
    'Get the total claimable reward amount (raw wei, token address included) for a staker across all unclaimed epochs — use this to answer "how much reward is ready to claim?"',
    {
      vaultHelperAddress: Address.describe('VaultHelper contract address'),
      vaultAddress: Address.describe('Vault contract address'),
      rewardsAddress: Address.describe('RewardsNativeToken contract address'),
      rewardTokenAddress: Address.describe('Reward token ERC-20 address'),
      staker: Address.describe('Staker address whose claimable reward to query'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultHelperAddress, vaultAddress, rewardsAddress, rewardTokenAddress, staker, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['vault-helper', 'get-claimable-reward', vaultHelperAddress, vaultAddress, rewardsAddress, rewardTokenAddress, '--staker', staker],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'vault_helper_get_latest_distributed_rewards',
    'Get the most recent distributed rewards amount (raw wei) for a vault — use this to check what was last distributed before deciding whether to run another distribution',
    {
      vaultHelperAddress: Address.describe('VaultHelper contract address'),
      vaultAddress: Address.describe('Vault contract address'),
      rewardsAddress: Address.describe('RewardsNativeToken contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultHelperAddress, vaultAddress, rewardsAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['vault-helper', 'get-latest-distributed-rewards', vaultHelperAddress, vaultAddress, rewardsAddress],
        { network, rpcUrl },
      ));
    },
  );
}
