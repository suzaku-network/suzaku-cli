import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Network, RpcUrl } from '../schemas.js';

export function registerOptInTools(server: McpServer, readOnly?: boolean) {
  // ── Reads ──

  server.tool(
    'check_opt_in_l1',
    'Pre-flight check: answers "is operator X currently opted in to this L1?" — run before registering an operator or diagnosing why an operator is inactive on a validator manager.',
    {
      operator: Address.describe('Operator address to check'),
      validatorManagerAddress: Address.describe('L1 validator manager contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ operator, validatorManagerAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['opt-in', 'check-l1', operator, validatorManagerAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'check_opt_in_vault',
    'Pre-flight check: answers "is operator X currently opted in to this vault?" — run before staking or diagnosing why an operator is not receiving delegated stake from a vault.',
    {
      operator: Address.describe('Operator address to check'),
      vaultAddress: Address.describe('Vault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ operator, vaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['opt-in', 'check-vault', operator, vaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  if (readOnly) return;

  // ── Writes ──

  server.tool(
    'opt_in_l1',
    'Opt an operator into an L1 — required before the operator can participate in that L1\'s validator set (requires SUZAKU_PK)',
    {
      l1Address: Address.describe('L1 address to opt into'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ l1Address, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('opt_in_l1', { l1Address, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['opt-in', 'l1-in', l1Address],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'opt_out_l1',
    'Opt an operator out of an L1 — removes eligibility to participate in the L1\'s validator set (requires SUZAKU_PK)',
    {
      l1Address: Address.describe('L1 address to opt out of'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ l1Address, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('opt_out_l1', { l1Address, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['opt-in', 'l1-out', l1Address],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'opt_in_vault',
    'Opt an operator into a vault — required before the operator can receive delegated stake from that vault (requires SUZAKU_PK)',
    {
      vaultAddress: Address.describe('Vault address to opt into'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ vaultAddress, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('opt_in_vault', { vaultAddress, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['opt-in', 'vault-in', vaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'opt_out_vault',
    'Opt an operator out of a vault — stops receiving delegated stake from that vault (requires SUZAKU_PK)',
    {
      vaultAddress: Address.describe('Vault address to opt out of'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ vaultAddress, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('opt_out_vault', { vaultAddress, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['opt-in', 'vault-out', vaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );
}
