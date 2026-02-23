import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Hex, NodeID, Network, RpcUrl } from '../schemas.js';

export function registerBalancerTools(server: McpServer) {
  // ── Reads ──

  server.tool(
    'balancer_get_security_modules',
    'Get all security modules registered on a BalancerValidatorManager',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ balancerAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['balancer', 'get-security-modules', balancerAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'balancer_get_security_module_weights',
    'Get the weight configuration for a specific security module on a BalancerValidatorManager',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      securityModule: Address.describe('Security module address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ balancerAddress, securityModule, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['balancer', 'get-security-module-weights', balancerAddress, securityModule],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'balancer_get_validator_status',
    'Get validator status by node ID from a BalancerValidatorManager (Unknown, PendingAdded, Active, PendingRemoved, Completed, Invalidated, PendingStakeUpdated)',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      nodeId: NodeID,
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true, destructiveHint: false },
    async ({ balancerAddress, nodeId, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['balancer', 'get-validator-status', balancerAddress, nodeId],
        { network, rpcUrl },
      ));
    },
  );

  // ── Writes ──

  server.tool(
    'balancer_set_up_security_module',
    'Set up a security module on a BalancerValidatorManager with a max weight (requires SUZAKU_PK)',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      middlewareAddress: Address.describe('Middleware/security module contract address'),
      maxWeight: z.string().describe('Maximum weight for the security module (bigint)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ balancerAddress, middlewareAddress, maxWeight, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('balancer_set_up_security_module', { balancerAddress, middlewareAddress, maxWeight, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['balancer', 'set-up-security-module', balancerAddress, middlewareAddress, maxWeight],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'balancer_resend_validator_registration',
    'Resend a validator registration warp message that may not have been delivered (requires SUZAKU_PK)',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      nodeId: NodeID,
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ balancerAddress, nodeId, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('balancer_resend_validator_registration', { balancerAddress, nodeId, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['balancer', 'resend-validator-registration', balancerAddress, nodeId],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'balancer_resend_weight_update',
    'Resend a validator weight update warp message that may not have been delivered (requires SUZAKU_PK)',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      nodeId: NodeID,
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ balancerAddress, nodeId, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('balancer_resend_weight_update', { balancerAddress, nodeId, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['balancer', 'resend-weight-update', balancerAddress, nodeId],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'balancer_resend_validator_removal',
    'Resend a validator removal warp message that may not have been delivered (requires SUZAKU_PK)',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      nodeId: NodeID,
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ balancerAddress, nodeId, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('balancer_resend_validator_removal', { balancerAddress, nodeId, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['balancer', 'resend-validator-removal', balancerAddress, nodeId],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'balancer_transfer_l1_ownership',
    'Transfer ownership of the ValidatorManager, BalancerValidatorManager, and all its security modules to a new owner (requires SUZAKU_PK)',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      newOwner: Address.describe('New owner address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ balancerAddress, newOwner, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('balancer_transfer_l1_ownership', { balancerAddress, newOwner, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['balancer', 'transfer-l1-ownership', balancerAddress, newOwner],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );
}
