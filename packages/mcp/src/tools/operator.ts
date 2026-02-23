import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Network, RpcUrl } from '../schemas.js';

export function registerOperatorTools(server: McpServer) {
  server.tool(
    'operator_registry_get_all',
    'List all registered operators from the OperatorRegistry',
    {
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ network, rpcUrl }) => {
      return formatResult(await runCli(
        ['operator-registry', 'get-all'],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'operator_registry_register',
    'Register a new operator in the OperatorRegistry (requires SUZAKU_PK)',
    {
      metadataUrl: z.string().describe('Metadata URL for the operator (https or wss)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ metadataUrl, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('operator_registry_register', { metadataUrl, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['operator-registry', 'register', metadataUrl],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );
}
