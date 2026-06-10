import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, WARP_TIMEOUT } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, NodeID, Network, RpcUrl, isPrivateHost } from '../schemas.js';

/** SSRF guard for the public read tool: reject L1 RPC URLs pointing at private/loopback/link-local hosts.
 *  The write tools intentionally permit private hosts (operator-run internal L1 RPCs) and are not exposed read-only. */
function rejectPrivateL1Rpc(l1RpcUrl: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(l1RpcUrl).hostname;
  } catch {
    return `Invalid l1RpcUrl: ${l1RpcUrl}`;
  }
  if (isPrivateHost(hostname)) {
    return 'l1RpcUrl must not point to a private, loopback, or link-local address';
  }
  return null;
}

export function registerUptimeTools(server: McpServer, readOnly?: boolean) {
  // ── Reads ──

  server.tool(
    'uptime_get_validation_uptime_message',
    'Fetch the signed uptime proof for a validator from the L1 RPC without submitting it on-chain — useful to check what uptime a validator would report before calling uptime_report_validator. The l1RpcUrl is the L1\'s own RPC endpoint (not the C-Chain RPC). Requires SIG_AGG_URL env for signature aggregation (defaults to Glacier API).',
    {
      l1RpcUrl: z.string()
        .regex(/^https?:\/\/.+/)
        .describe('RPC URL of the L1 (e.g. https://your-l1-rpc.example.com) — the CLI appends /ext/bc/<blockchainId> internally'),
      blockchainId: z.string().describe('Blockchain ID of the L1 in CB58 format'),
      nodeId: NodeID,
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true },
    async ({ l1RpcUrl, blockchainId, nodeId, network, rpcUrl }) => {
      const ssrfErr = rejectPrivateL1Rpc(l1RpcUrl);
      if (ssrfErr) return formatGuardError(ssrfErr);
      return formatResult(await runCli(
        ['uptime', 'get-validation-uptime-message', l1RpcUrl, blockchainId, nodeId],
        { network, rpcUrl },
      ));
    },
  );

  if (readOnly) return;

  // ── Writes ──

  server.tool(
    'uptime_report_validator',
    'Step 1 of the Dexalot weekly epoch workflow: fetch the signed uptime proof from the L1 RPC and submit it to the UptimeTracker contract on-chain. The l1RpcUrl positional is the L1\'s own RPC (not the C-Chain RPC). Requires SIG_AGG_URL env for signature aggregation (defaults to Glacier API). Takes up to 5 minutes due to warp signature collection.',
    {
      l1RpcUrl: z.string()
        .regex(/^https?:\/\/.+/)
        .describe('RPC URL of the L1 whose validators produce uptime proofs (e.g. https://your-l1-rpc.example.com)'),
      blockchainId: z.string().describe('Blockchain ID of the L1 in CB58 format'),
      nodeId: NodeID,
      uptimeTrackerAddress: Address.describe('UptimeTracker contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ l1RpcUrl, blockchainId, nodeId, uptimeTrackerAddress, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('uptime_report_validator', { l1RpcUrl, blockchainId, nodeId, uptimeTrackerAddress, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['uptime', 'report-uptime-validator', l1RpcUrl, blockchainId, nodeId, uptimeTrackerAddress],
        { network, rpcUrl, privateKey: true, timeout: WARP_TIMEOUT },
      ));
    },
  );

  server.tool(
    'uptime_compute_operator_uptime',
    'Step 2 of the Dexalot weekly epoch workflow: compute an operator\'s uptime score for a given epoch from the validator uptime reports already recorded on-chain (run uptime_report_validator for each validator first). Must be called once per operator per epoch before rewards can be distributed.',
    {
      uptimeTrackerAddress: Address.describe('UptimeTracker contract address'),
      operator: Address.describe('Operator address to compute uptime for'),
      epoch: z.string().describe('Epoch number (integer string, e.g. "35")'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ uptimeTrackerAddress, operator, epoch, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('uptime_compute_operator_uptime', { uptimeTrackerAddress, operator, epoch, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['uptime', 'compute-operator-uptime', uptimeTrackerAddress, operator, epoch],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );
}
