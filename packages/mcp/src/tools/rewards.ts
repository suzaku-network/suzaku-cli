import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Network, RpcUrl } from '../schemas.js';

export function registerRewardsTools(server: McpServer) {
  // ── Reads ──

  server.tool(
    'rewards_get_epoch_rewards',
    'Get reward details for a specific epoch',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch number'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ rewardsAddress, epoch, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['rewards', 'get-epoch-rewards', rewardsAddress, epoch],
        { network, rpcUrl },
      ));
    },
  );

  // ── Writes ──

  server.tool(
    'rewards_distribute',
    'Distribute rewards for an epoch (requires SUZAKU_PK)',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      epoch: z.string().describe('Epoch number'),
      batchSize: z.string().describe('Positive integer — number of operators to process in this distribution batch'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ rewardsAddress, epoch, batchSize, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('rewards_distribute', { rewardsAddress, epoch, batchSize, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['rewards', 'distribute', rewardsAddress, epoch, batchSize],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'rewards_claim',
    'Claim available staker rewards (requires SUZAKU_PK)',
    {
      rewardsAddress: Address.describe('Rewards contract address'),
      recipient: Address.optional().describe('Recipient address for claimed rewards (defaults to signer)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ rewardsAddress, recipient, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('rewards_claim', { rewardsAddress, recipient, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['rewards', 'claim', rewardsAddress];
      if (recipient) args.push('--recipient', recipient);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );
}
