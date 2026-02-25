import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, CliResult } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Network, RpcUrl } from '../schemas.js';

export function extractOperators(result: CliResult): { address: string; metadataUrl: string }[] {
  if (!result.success || result.data == null || typeof result.data !== 'object') return [];
  const data = result.data as Record<string, unknown>;

  // Prefer labeled data if present
  if (Array.isArray(data.operators) && data.operators.length > 0) {
    return data.operators as { address: string; metadataUrl: string }[];
  }

  // Fallback: parse from receipt arrays — order matches registerOperator(metadataUrl) → [addresses[], urls[]]
  const receipt = data.receipt as { result?: unknown[] } | undefined;
  if (receipt?.result && Array.isArray(receipt.result) && receipt.result.length >= 2) {
    const [addresses, urls] = receipt.result as [string[], string[]];
    return addresses.map((addr, i) => ({
      address: addr,
      metadataUrl: urls[i],
    }));
  }

  return [];
}

export function registerOperatorTools(server: McpServer) {
  server.tool(
    'operator_registry_get_all',
    'List all registered operators from the OperatorRegistry. Returns labeled entries: address (operator address) and metadataUrl.',
    {
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ network, rpcUrl }) => {
      const result = await runCli(
        ['operator-registry', 'get-all'],
        { network, rpcUrl },
      );
      const operators = extractOperators(result);
      return formatResult({ success: result.success, data: { operators }, error: result.error });
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
