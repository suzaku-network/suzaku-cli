import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Network, RpcUrl } from '../schemas.js';

export function registerVaultTools(server: McpServer) {
  // ── Reads ──

  server.tool(
    'vault_get_balance',
    'Get token balance for an address in a vault',
    {
      vaultAddress: Address.describe('Vault contract address'),
      account: Address.optional().describe('Account address to query (defaults to signer)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultAddress, account, network, rpcUrl }) => {
      const args = ['vault', 'get-balance', vaultAddress];
      if (account) args.push('--account', account);
      return formatResult(await runCli(args, { network, rpcUrl }));
    },
  );

  server.tool(
    'vault_get_active_balance',
    'Get active (staked) balance for an address in a vault',
    {
      vaultAddress: Address.describe('Vault contract address'),
      account: Address.optional().describe('Account address to query (defaults to signer)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultAddress, account, network, rpcUrl }) => {
      const args = ['vault', 'get-active-balance', vaultAddress];
      if (account) args.push('--account', account);
      return formatResult(await runCli(args, { network, rpcUrl }));
    },
  );

  server.tool(
    'vault_get_total_supply',
    'Get total token supply of a vault',
    {
      vaultAddress: Address.describe('Vault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['vault', 'get-total-supply', vaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'vault_get_deposit_limit',
    'Get current deposit limit for a vault',
    {
      vaultAddress: Address.describe('Vault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['vault', 'get-deposit-limit', vaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'vault_get_withdrawals',
    'Get withdrawal amount for an account at a specific epoch in a vault',
    {
      vaultAddress: Address.describe('Vault contract address'),
      epoch: z.string().describe('Epoch number (bigint)'),
      account: Address.optional().describe('Account address to filter (defaults to signer)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ vaultAddress, epoch, account, network, rpcUrl }) => {
      const args = ['vault', 'get-withdrawals', vaultAddress, epoch];
      if (account) args.push('--account', account);
      return formatResult(await runCli(args, { network, rpcUrl }));
    },
  );

  // ── Writes ──

  server.tool(
    'vault_deposit',
    'Deposit tokens into a vault (requires SUZAKU_PK)',
    {
      vaultAddress: Address.describe('Vault contract address'),
      amount: z.string().describe('Amount to deposit (human-readable, e.g. "1.5")'),
      onBehalfOf: Address.optional().describe('Deposit on behalf of this address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ vaultAddress, amount, onBehalfOf, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('vault_deposit', { vaultAddress, amount, onBehalfOf, network, rpcUrl }, 'amount');
      if (guardErr) return formatGuardError(guardErr);
      const args = ['vault', 'deposit', vaultAddress, amount];
      if (onBehalfOf) args.push('--onBehalfOf', onBehalfOf);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'vault_withdraw',
    'Request a withdrawal from a vault (requires SUZAKU_PK)',
    {
      vaultAddress: Address.describe('Vault contract address'),
      amount: z.string().describe('Amount to withdraw (human-readable)'),
      claimer: Address.optional().describe('Address that can claim the withdrawal'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ vaultAddress, amount, claimer, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('vault_withdraw', { vaultAddress, amount, claimer, network, rpcUrl }, 'amount');
      if (guardErr) return formatGuardError(guardErr);
      const args = ['vault', 'withdraw', vaultAddress, amount];
      if (claimer) args.push('--claimer', claimer);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'vault_claim',
    'Claim a completed withdrawal from a vault (requires SUZAKU_PK)',
    {
      vaultAddress: Address.describe('Vault contract address'),
      epoch: z.string().describe('Epoch of the withdrawal to claim (bigint)'),
      recipient: Address.optional().describe('Recipient address for claimed tokens'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ vaultAddress, epoch, recipient, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('vault_claim', { vaultAddress, epoch, recipient, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['vault', 'claim', vaultAddress, epoch];
      if (recipient) args.push('--recipient', recipient);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );
}
