import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, WARP_TIMEOUT } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Hex, NodeID, Network, RpcUrl } from '../schemas.js';

export function registerPoaSecurityModuleTools(server: McpServer) {
  server.tool(
    'poa_add_node',
    'Add a new validator node to an L1 via PoA Security Module — initiates validator registration (requires SUZAKU_PK)',
    {
      poaSecurityModuleAddress: Address.describe('PoA Security Module contract address'),
      nodeId: NodeID,
      blsKey: Hex.describe('BLS public key (hex)'),
      initialWeight: z.string().describe('Initial weight of the validator (bigint)'),
      registrationExpiry: z.string().optional().describe('Expiry timestamp (default: now + 12 hours)'),
      pchainRemainingBalanceOwnerThreshold: z.number().optional().describe('P-Chain remaining balance owner threshold (default: 1)'),
      pchainDisableOwnerThreshold: z.number().optional().describe('P-Chain disable owner threshold (default: 1)'),
      pchainRemainingBalanceOwnerAddresses: z.array(z.string()).optional().describe('P-Chain remaining balance owner addresses (hex)'),
      pchainDisableOwnerAddresses: z.array(z.string()).optional().describe('P-Chain disable owner addresses (hex)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ poaSecurityModuleAddress, nodeId, blsKey, initialWeight, registrationExpiry, pchainRemainingBalanceOwnerThreshold, pchainDisableOwnerThreshold, pchainRemainingBalanceOwnerAddresses, pchainDisableOwnerAddresses, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('poa_add_node', { poaSecurityModuleAddress, nodeId, blsKey, initialWeight, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['poa', 'add-node', poaSecurityModuleAddress, nodeId, blsKey, initialWeight];
      if (registrationExpiry) args.push('--registration-expiry', registrationExpiry);
      if (pchainRemainingBalanceOwnerThreshold !== undefined) args.push('--pchain-remaining-balance-owner-threshold', String(pchainRemainingBalanceOwnerThreshold));
      if (pchainDisableOwnerThreshold !== undefined) args.push('--pchain-disable-owner-threshold', String(pchainDisableOwnerThreshold));
      for (const addr of pchainRemainingBalanceOwnerAddresses ?? []) args.push('--pchain-remaining-balance-owner-address', addr);
      for (const addr of pchainDisableOwnerAddresses ?? []) args.push('--pchain-disable-owner-address', addr);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'poa_complete_validator_registration',
    'Complete validator registration on P-Chain after adding a node via PoA Security Module — cross-chain warp (requires SUZAKU_PK + SUZAKU_PCHAIN_PK)',
    {
      poaSecurityModuleAddress: Address.describe('PoA Security Module contract address'),
      addNodeTxHash: Hex.describe('Transaction hash from add-node (initiate validator registration)'),
      blsProofOfPossession: z.string().regex(/^0x[0-9a-fA-F]{192}$/).describe('BLS Proof of Possession (96-byte hex)'),
      initialBalance: z.string().optional().describe('Initial nAVAX balance for node (default: "0.01")'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for validator to appear on P-Chain API'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ poaSecurityModuleAddress, addNodeTxHash, blsProofOfPossession, initialBalance, skipWaitApi, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('poa_complete_validator_registration', { poaSecurityModuleAddress, addNodeTxHash, blsProofOfPossession, initialBalance, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['poa', 'complete-validator-registration', poaSecurityModuleAddress, addNodeTxHash, blsProofOfPossession];
      if (initialBalance) args.push('--initial-balance', initialBalance);
      if (skipWaitApi) args.push('--skip-wait-api');
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );

  server.tool(
    'poa_remove_node',
    'Initiate validator removal via PoA Security Module (requires SUZAKU_PK)',
    {
      poaSecurityModuleAddress: Address.describe('PoA Security Module contract address'),
      nodeId: NodeID,
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ poaSecurityModuleAddress, nodeId, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('poa_remove_node', { poaSecurityModuleAddress, nodeId, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['poa', 'remove-node', poaSecurityModuleAddress, nodeId],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'poa_complete_validator_removal',
    'Complete validator removal on P-Chain via PoA Security Module — cross-chain warp (requires SUZAKU_PK + SUZAKU_PCHAIN_PK)',
    {
      poaSecurityModuleAddress: Address.describe('PoA Security Module contract address'),
      removeNodeTxHash: Hex.describe('Transaction hash from remove-node (initiate validator removal)'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for validator removal on P-Chain API'),
      nodeIds: z.array(z.string()).optional().describe('Filter which validators to process (NodeID format)'),
      addNodeTxHashes: z.array(z.string()).optional().describe('Add-node transaction hashes for justification'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ poaSecurityModuleAddress, removeNodeTxHash, skipWaitApi, nodeIds, addNodeTxHashes, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('poa_complete_validator_removal', { poaSecurityModuleAddress, removeNodeTxHash, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['poa', 'complete-validator-removal', poaSecurityModuleAddress, removeNodeTxHash];
      if (skipWaitApi) args.push('--skip-wait-api');
      for (const nid of nodeIds ?? []) args.push('--node-id', nid);
      for (const tx of addNodeTxHashes ?? []) args.push('--add-node-tx', tx);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );

  server.tool(
    'poa_init_weight_update',
    'Initiate a validator weight update via PoA Security Module (requires SUZAKU_PK)',
    {
      poaSecurityModuleAddress: Address.describe('PoA Security Module contract address'),
      nodeId: NodeID,
      newWeight: z.string().describe('New weight for the validator (bigint)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ poaSecurityModuleAddress, nodeId, newWeight, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('poa_init_weight_update', { poaSecurityModuleAddress, nodeId, newWeight, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['poa', 'init-weight-update', poaSecurityModuleAddress, nodeId, newWeight],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'poa_complete_weight_update',
    'Complete a validator weight update on P-Chain via PoA Security Module — cross-chain warp (requires SUZAKU_PK + SUZAKU_PCHAIN_PK)',
    {
      poaSecurityModuleAddress: Address.describe('PoA Security Module contract address'),
      weightUpdateTxHash: Hex.describe('Transaction hash from init-weight-update'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for weight update on P-Chain API'),
      nodeIds: z.array(z.string()).optional().describe('Filter which validators to process (NodeID format)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ poaSecurityModuleAddress, weightUpdateTxHash, skipWaitApi, nodeIds, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('poa_complete_weight_update', { poaSecurityModuleAddress, weightUpdateTxHash, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['poa', 'complete-weight-update', poaSecurityModuleAddress, weightUpdateTxHash];
      if (skipWaitApi) args.push('--skip-wait-api');
      for (const nid of nodeIds ?? []) args.push('--node-id', nid);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );
}
