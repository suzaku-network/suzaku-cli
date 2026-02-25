import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, CliResult } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Network, RpcUrl } from '../schemas.js';

export function extractL1s(result: CliResult): { balancer: string; middleware: string; metadataUrl: string }[] {
  if (!result.success || result.data == null || typeof result.data !== 'object') return [];
  const data = result.data as Record<string, unknown>;

  // Prefer labeled data if present
  if (Array.isArray(data.l1s) && data.l1s.length > 0) {
    return (data.l1s as { Balancer: string; Middleware: string; MetadataUrl: string }[]).map(l1 => ({
      balancer: l1.Balancer,
      middleware: l1.Middleware,
      metadataUrl: l1.MetadataUrl,
    }));
  }

  // Fallback: parse from receipt arrays — order matches registerL1(l1/balancer, middleware, metadataURL)
  const receipt = data.receipt as { result?: unknown[] } | undefined;
  if (receipt?.result && Array.isArray(receipt.result) && receipt.result.length >= 3) {
    const [balancers, middlewares, urls] = receipt.result as [string[], string[], string[]];
    return balancers.map((b, i) => ({
      balancer: b,
      middleware: middlewares[i],
      metadataUrl: urls[i],
    }));
  }

  return [];
}

export function registerL1RegistryTools(server: McpServer) {
  server.tool(
    'l1_registry_get_all',
    'List all registered L1s from the L1Registry. Returns labeled entries: balancer (BalancerValidatorManager address), middleware (L1Middleware address), and metadataUrl.',
    {
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ network, rpcUrl }) => {
      const result = await runCli(
        ['l1-registry', 'get-all'],
        { network, rpcUrl },
      );
      const l1s = extractL1s(result);
      return formatResult({ success: result.success, data: { l1s }, error: result.error });
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
