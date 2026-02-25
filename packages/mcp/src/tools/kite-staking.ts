import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, WARP_TIMEOUT } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Hex, NodeID, Network, RpcUrl } from '../schemas.js';

export function registerKiteStakingTools(server: McpServer) {
  // ── Config ──

  server.tool(
    'kite_update_staking_config',
    'Update staking configuration on a KiteStakingManager (requires SUZAKU_PK)',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      minimumStakeAmount: z.string().describe('Minimum stake amount in AVAX (human-readable, e.g. "25")'),
      maximumStakeAmount: z.string().describe('Maximum stake amount in AVAX (human-readable)'),
      minimumStakeDuration: z.string().describe('Minimum stake duration in seconds'),
      minimumDelegationFeeBips: z.string().describe('Minimum delegation fee in basis points'),
      maximumStakeMultiplier: z.string().describe('Maximum stake multiplier'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ kiteStakingManagerAddress, minimumStakeAmount, maximumStakeAmount, minimumStakeDuration, minimumDelegationFeeBips, maximumStakeMultiplier, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_update_staking_config', { kiteStakingManagerAddress, minimumStakeAmount, maximumStakeAmount, minimumStakeDuration, minimumDelegationFeeBips, maximumStakeMultiplier, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['kite-staking-manager', 'update-staking-config', kiteStakingManagerAddress,
          minimumStakeAmount, maximumStakeAmount, minimumStakeDuration, minimumDelegationFeeBips, maximumStakeMultiplier],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  // ── Validator Registration (two-phase) ──

  server.tool(
    'kite_initiate_validator_registration',
    'Initiate validator registration on KiteStakingManager — first step of two-phase registration (requires SUZAKU_PK)',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      nodeId: NodeID,
      blsKey: Hex.describe('BLS public key (hex)'),
      delegationFeeBips: z.string().describe('Delegation fee in basis points'),
      minStakeDuration: z.string().describe('Minimum stake duration in seconds'),
      rewardRecipient: Address.describe('Address to receive staking rewards'),
      stakeAmount: z.string().describe('Stake amount in AVAX (human-readable) — sent as msg.value'),
      pchainRemainingBalanceOwnerThreshold: z.number().optional().describe('P-Chain remaining balance owner threshold (default: 1)'),
      pchainDisableOwnerThreshold: z.number().optional().describe('P-Chain disable owner threshold (default: 1)'),
      pchainRemainingBalanceOwnerAddresses: z.array(z.string()).optional().describe('P-Chain remaining balance owner addresses (hex)'),
      pchainDisableOwnerAddresses: z.array(z.string()).optional().describe('P-Chain disable owner addresses (hex)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ kiteStakingManagerAddress, nodeId, blsKey, delegationFeeBips, minStakeDuration, rewardRecipient, stakeAmount, pchainRemainingBalanceOwnerThreshold, pchainDisableOwnerThreshold, pchainRemainingBalanceOwnerAddresses, pchainDisableOwnerAddresses, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_initiate_validator_registration', { kiteStakingManagerAddress, nodeId, blsKey, delegationFeeBips, minStakeDuration, rewardRecipient, stakeAmount, network, rpcUrl }, 'stakeAmount');
      if (guardErr) return formatGuardError(guardErr);
      const args = ['kite-staking-manager', 'initiate-validator-registration',
        kiteStakingManagerAddress, nodeId, blsKey, delegationFeeBips, minStakeDuration, rewardRecipient, stakeAmount];
      if (pchainRemainingBalanceOwnerThreshold !== undefined) args.push('--pchain-remaining-balance-owner-threshold', String(pchainRemainingBalanceOwnerThreshold));
      if (pchainDisableOwnerThreshold !== undefined) args.push('--pchain-disable-owner-threshold', String(pchainDisableOwnerThreshold));
      for (const addr of pchainRemainingBalanceOwnerAddresses ?? []) args.push('--pchain-remaining-balance-owner-address', addr);
      for (const addr of pchainDisableOwnerAddresses ?? []) args.push('--pchain-disable-owner-address', addr);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'kite_complete_validator_registration',
    'Complete validator registration — second step, involves cross-chain warp message to P-Chain (requires SUZAKU_PK)',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      initiateTxHash: Hex.describe('Transaction hash from initiate-validator-registration'),
      blsProofOfPossession: z.string().regex(/^0x[0-9a-fA-F]{192}$/).describe('BLS Proof of Possession (96-byte hex)'),
      initialBalance: z.string().optional().describe('Initial nAVAX balance for node (default: "0.01")'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for validator to appear on P-Chain API'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ kiteStakingManagerAddress, initiateTxHash, blsProofOfPossession, initialBalance, skipWaitApi, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_complete_validator_registration', { kiteStakingManagerAddress, initiateTxHash, blsProofOfPossession, initialBalance, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['kite-staking-manager', 'complete-validator-registration',
        kiteStakingManagerAddress, initiateTxHash, blsProofOfPossession];
      if (initialBalance) args.push('--initial-balance', initialBalance);
      if (skipWaitApi) args.push('--skip-wait-api');
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );

  // ── Validator Removal (two-phase) ──

  server.tool(
    'kite_initiate_validator_removal',
    'Initiate validator removal from KiteStakingManager (requires SUZAKU_PK)',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      nodeId: NodeID,
      includeUptimeProof: z.boolean().optional().describe('Include uptime proof in transaction'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ kiteStakingManagerAddress, nodeId, includeUptimeProof, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_initiate_validator_removal', { kiteStakingManagerAddress, nodeId, includeUptimeProof, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['kite-staking-manager', 'initiate-validator-removal', kiteStakingManagerAddress, nodeId];
      if (includeUptimeProof) args.push('--include-uptime-proof');
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'kite_complete_validator_removal',
    'Complete validator removal — involves cross-chain warp message to P-Chain (requires SUZAKU_PK)',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      initiateRemovalTxHash: Hex.describe('Transaction hash from initiate-validator-removal'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for validator removal on P-Chain API'),
      nodeIds: z.array(z.string()).optional().describe('Filter which validators to process (NodeID format)'),
      initiateTxHashes: z.array(z.string()).optional().describe('Initiate validator registration tx hashes for justification (array — KiteStakingManager supports batch processing multiple validators)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ kiteStakingManagerAddress, initiateRemovalTxHash, skipWaitApi, nodeIds, initiateTxHashes, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_complete_validator_removal', { kiteStakingManagerAddress, initiateRemovalTxHash, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['kite-staking-manager', 'complete-validator-removal', kiteStakingManagerAddress, initiateRemovalTxHash];
      if (skipWaitApi) args.push('--skip-wait-api');
      for (const nid of nodeIds ?? []) args.push('--node-id', nid);
      for (const tx of initiateTxHashes ?? []) args.push('--initiate-tx', tx);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );

  // ── Delegator Registration (two-phase) ──

  server.tool(
    'kite_initiate_delegator_registration',
    'Initiate delegator registration on a validator via KiteStakingManager (requires SUZAKU_PK)',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      nodeId: NodeID,
      rewardRecipient: Address.describe('Address to receive delegation rewards'),
      stakeAmount: z.string().describe('Delegation amount in AVAX (human-readable) — sent as msg.value'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ kiteStakingManagerAddress, nodeId, rewardRecipient, stakeAmount, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_initiate_delegator_registration', { kiteStakingManagerAddress, nodeId, rewardRecipient, stakeAmount, network, rpcUrl }, 'stakeAmount');
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['kite-staking-manager', 'initiate-delegator-registration',
          kiteStakingManagerAddress, nodeId, rewardRecipient, stakeAmount],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'kite_complete_delegator_registration',
    'Complete delegator registration — involves cross-chain warp + uptime proof (requires SUZAKU_PK)',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      initiateTxHash: Hex.describe('Transaction hash from initiate-delegator-registration'),
      uptimeRpcUrl: z.string().describe('RPC URL for fetching validator uptime proof'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ kiteStakingManagerAddress, initiateTxHash, uptimeRpcUrl, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_complete_delegator_registration', { kiteStakingManagerAddress, initiateTxHash, uptimeRpcUrl, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['kite-staking-manager', 'complete-delegator-registration',
        kiteStakingManagerAddress, initiateTxHash, uptimeRpcUrl];
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );

  // ── Delegator Removal (two-phase) ──

  server.tool(
    'kite_initiate_delegator_removal',
    'Initiate delegator removal from KiteStakingManager (requires SUZAKU_PK). Note: uptimeRpcUrl overrides rpcUrl because the CLI uses a single --rpc-url flag — do not set both.',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      delegationId: Hex.describe('Delegation ID (hex)'),
      includeUptimeProof: z.boolean().optional().describe('Attach uptime proof in transaction'),
      uptimeRpcUrl: z.string().optional().describe('RPC URL for uptime proof (required if includeUptimeProof is true). Overrides rpcUrl — do not set both.'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ kiteStakingManagerAddress, delegationId, includeUptimeProof, uptimeRpcUrl, network, rpcUrl }) => {
      if (uptimeRpcUrl && rpcUrl) {
        return formatGuardError('Cannot set both rpcUrl and uptimeRpcUrl — the CLI uses a single --rpc-url flag. Use uptimeRpcUrl for uptime proof, or rpcUrl for the network endpoint.');
      }
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_initiate_delegator_removal', { kiteStakingManagerAddress, delegationId, includeUptimeProof, uptimeRpcUrl, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['kite-staking-manager', 'initiate-delegator-removal', kiteStakingManagerAddress, delegationId];
      if (includeUptimeProof) args.push('--include-uptime-proof');
      if (uptimeRpcUrl) args.push('--rpc-url', uptimeRpcUrl);
      return formatResult(await runCli(args, { network, rpcUrl: uptimeRpcUrl ? undefined : rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'kite_complete_delegator_removal',
    'Complete delegator removal — involves cross-chain warp message to P-Chain (requires SUZAKU_PK)',
    {
      kiteStakingManagerAddress: Address.describe('KiteStakingManager contract address'),
      initiateRemovalTxHash: Hex.describe('Transaction hash from initiate-delegator-removal'),
      uptimeRpcUrl: z.string().describe('RPC URL for fetching validator uptime proof'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for weight update on P-Chain API'),
      delegationIds: z.array(z.string()).optional().describe('Filter which delegations to process (hex IDs)'),
      initiateTx: z.string().optional().describe('Initiate delegator registration tx hash for justification (single value — one delegation at a time)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ kiteStakingManagerAddress, initiateRemovalTxHash, uptimeRpcUrl, skipWaitApi, delegationIds, initiateTx, network, rpcUrl }) => {
      if (uptimeRpcUrl && rpcUrl) {
        return formatGuardError('Cannot set both rpcUrl and uptimeRpcUrl — the CLI uses a single --rpc-url flag. Use uptimeRpcUrl for uptime proof, or rpcUrl for the network endpoint.');
      }
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('kite_complete_delegator_removal', { kiteStakingManagerAddress, initiateRemovalTxHash, uptimeRpcUrl, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['kite-staking-manager', 'complete-delegator-removal',
        kiteStakingManagerAddress, initiateRemovalTxHash, uptimeRpcUrl];
      if (skipWaitApi) args.push('--skip-wait-api');
      for (const did of delegationIds ?? []) args.push('--delegation-id', did);
      if (initiateTx) args.push('--initiate-tx', initiateTx);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );
}
