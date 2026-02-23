import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Network, RpcUrl } from '../schemas.js';

export function registerL1RegistryTools(server: McpServer) {
  server.tool(
    'l1_registry_get_all',
    'List all registered L1s from the L1Registry',
    {
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ network, rpcUrl }) => {
      return formatResult(await runCli(
        ['l1-registry', 'get-all'],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'l1_registry_register',
    'Register a new L1 in the L1Registry (requires SUZAKU_PK)',
    {
      balancerAddress: Address.describe('BalancerValidatorManager contract address'),
      l1Middleware: Address.describe('L1Middleware contract address'),
      metadataUrl: z.string().describe('Metadata URL for the L1 (https or wss)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ balancerAddress, l1Middleware, metadataUrl, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('l1_registry_register', { balancerAddress, l1Middleware, metadataUrl, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['l1-registry', 'register', balancerAddress, l1Middleware, metadataUrl],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );
}
