import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner, WARP_TIMEOUT } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Hex, NodeID, Network, RpcUrl } from '../schemas.js';

export function registerStakingVaultTools(server: McpServer, readOnly?: boolean) {
  // ── Read / Info ──

  server.tool(
    'staking_vault_info',
    'Get general vault info: total pooled stake, supply, exchange rate, available/validator/delegated stake, withdrawals, epochs',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['staking-vault', 'info', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'staking_vault_fees_info',
    'Get fee configuration: protocol fee, operator fee, liquidity buffer, accrued fees',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['staking-vault', 'info-fees', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'staking_vault_operators_info',
    'Get all operators: allocation, active stake, accrued fees, validators, delegations per operator',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['staking-vault', 'info-operators', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'staking_vault_validators_info',
    'Get all validators per operator: stake amounts and pending removal status',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['staking-vault', 'info-validators', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'staking_vault_delegators_info',
    'Get all delegators per operator: validation IDs, vault-owned flag, operator assignment',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['staking-vault', 'info-delegators', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'staking_vault_withdrawals_info',
    'Get withdrawal queue info: queue length, pending/claimable withdrawals, total exit debt',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['staking-vault', 'info-withdrawals', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'staking_vault_epoch_info',
    'Get epoch info: current epoch, duration, last processed, epochs behind, min stake duration',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['staking-vault', 'info-epoch', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'staking_vault_full_info',
    'Composite: one call replaces the 7 individual staking_vault_*_info reads (info, fees, operators, validators, delegators, withdrawals, epoch) — prefer this over calling them separately. ' +
    'Returns the complete vault report.',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['staking-vault', 'info-full', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl },
      ));
    },
  );

  if (readOnly) return;

  // ── Deposit / Withdrawal ──

  server.tool(
    'staking_vault_deposit',
    'Deposit AVAX into a staking vault (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      amount: z.string().describe('Amount in AVAX (human-readable, e.g. "1.5") — sent as msg.value'),
      minShares: z.string().describe('Minimum shares expected (bigint, slippage protection)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, amount, minShares, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_deposit', { stakingVaultAddress, amount, minShares, network, rpcUrl }, 'amount');
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'deposit', amount, minShares, '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'staking_vault_request_withdrawal',
    'Request a withdrawal from a staking vault (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      shares: z.string().describe('Number of shares to withdraw (human-readable, e.g. "1.5")'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, shares, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_request_withdrawal', { stakingVaultAddress, shares, network, rpcUrl }, 'shares');
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'request-withdrawal', shares, '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'staking_vault_claim_withdrawal',
    'Claim a completed withdrawal using its request ID (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      requestId: z.string().describe('Withdrawal request ID (bigint)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, requestId, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_claim_withdrawal', { stakingVaultAddress, requestId, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'claim-withdrawal', requestId, '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'staking_vault_process_epoch',
    'Process the current epoch — advances state, fulfills pending withdrawals (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_process_epoch', { stakingVaultAddress, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'process-epoch', '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  // ── Operator Management ──

  server.tool(
    'staking_vault_add_operator',
    'Add an operator to the staking vault (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      operator: Address.describe('Operator address'),
      allocationBips: z.string().describe('Allocation in basis points (e.g. "5000" for 50%)'),
      feeRecipient: Address.describe('Fee recipient address for this operator'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, operator, allocationBips, feeRecipient, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_add_operator', { stakingVaultAddress, operator, allocationBips, feeRecipient, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'add-operator', operator, allocationBips, feeRecipient, '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'staking_vault_update_operator_allocations',
    'Update allocation basis points for an operator (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      operator: Address.describe('Operator address'),
      allocationBips: z.string().describe('New allocation in basis points'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, operator, allocationBips, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_update_operator_allocations', { stakingVaultAddress, operator, allocationBips, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'update-operator-allocations', operator, allocationBips, '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  // ── Validator Registration (two-phase) ──

  server.tool(
    'staking_vault_initiate_validator_registration',
    'Initiate validator registration via staking vault — first step of two-phase registration (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      nodeId: NodeID,
      blsKey: Hex.describe('BLS public key (hex)'),
      stakeAmount: z.string().describe('Stake amount in AVAX (human-readable)'),
      pchainRemainingBalanceOwnerThreshold: z.number().optional().describe('P-Chain remaining balance owner threshold (default: 1)'),
      pchainDisableOwnerThreshold: z.number().optional().describe('P-Chain disable owner threshold (default: 1)'),
      pchainRemainingBalanceOwnerAddresses: z.array(z.string()).optional().describe('P-Chain remaining balance owner addresses (hex)'),
      pchainDisableOwnerAddresses: z.array(z.string()).optional().describe('P-Chain disable owner addresses (hex)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, nodeId, blsKey, stakeAmount, pchainRemainingBalanceOwnerThreshold, pchainDisableOwnerThreshold, pchainRemainingBalanceOwnerAddresses, pchainDisableOwnerAddresses, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_initiate_validator_registration', { stakingVaultAddress, nodeId, blsKey, stakeAmount, network, rpcUrl }, 'stakeAmount');
      if (guardErr) return formatGuardError(guardErr);
      const args = ['staking-vault', 'initiate-validator-registration',
        nodeId, blsKey, stakeAmount, '--staking-vault-address', stakingVaultAddress];
      if (pchainRemainingBalanceOwnerThreshold !== undefined) args.push('--pchain-remaining-balance-owner-threshold', String(pchainRemainingBalanceOwnerThreshold));
      if (pchainDisableOwnerThreshold !== undefined) args.push('--pchain-disable-owner-threshold', String(pchainDisableOwnerThreshold));
      for (const addr of pchainRemainingBalanceOwnerAddresses ?? []) args.push('--pchain-remaining-balance-owner-address', addr);
      for (const addr of pchainDisableOwnerAddresses ?? []) args.push('--pchain-disable-owner-address', addr);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'staking_vault_complete_validator_registration',
    'Complete validator registration via staking vault — cross-chain warp to P-Chain (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      initiateTxHash: Hex.describe('Transaction hash from initiate-validator-registration'),
      blsProofOfPossession: z.string().regex(/^0x[0-9a-fA-F]{192}$/).describe('BLS Proof of Possession (96-byte hex)'),
      initialBalance: z.string().optional().describe('Initial nAVAX balance for node (default: "0.01")'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for validator to appear on P-Chain API'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ stakingVaultAddress, initiateTxHash, blsProofOfPossession, initialBalance, skipWaitApi, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_complete_validator_registration', { stakingVaultAddress, initiateTxHash, blsProofOfPossession, initialBalance, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['staking-vault', 'complete-validator-registration',
        initiateTxHash, blsProofOfPossession, '--staking-vault-address', stakingVaultAddress];
      if (initialBalance) args.push('--initial-balance', initialBalance);
      if (skipWaitApi) args.push('--skip-wait-api');
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );

  // ── Validator Removal (two-phase) ──

  server.tool(
    'staking_vault_initiate_validator_removal',
    'Initiate validator removal via staking vault (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      nodeId: NodeID,
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, nodeId, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_initiate_validator_removal', { stakingVaultAddress, nodeId, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'initiate-validator-removal', nodeId, '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'staking_vault_complete_validator_removal',
    'Complete validator removal via staking vault — cross-chain warp to P-Chain (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      initiateRemovalTxHash: Hex.describe('Transaction hash from initiate-validator-removal'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for validator removal on P-Chain API'),
      nodeIds: z.array(z.string()).optional().describe('Filter which validators to process (NodeID format)'),
      initiateTx: z.string().optional().describe('Initiate validator registration tx hash for justification (single value — StakingVault processes one validator at a time)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ stakingVaultAddress, initiateRemovalTxHash, skipWaitApi, nodeIds, initiateTx, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_complete_validator_removal', { stakingVaultAddress, initiateRemovalTxHash, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['staking-vault', 'complete-validator-removal', initiateRemovalTxHash, '--staking-vault-address', stakingVaultAddress];
      if (skipWaitApi) args.push('--skip-wait-api');
      for (const nid of nodeIds ?? []) args.push('--node-id', nid);
      if (initiateTx) args.push('--initiate-tx', initiateTx);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );

  // ── Delegator Registration (two-phase) ──

  server.tool(
    'staking_vault_initiate_delegator_registration',
    'Initiate delegator registration via staking vault (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      nodeId: NodeID,
      amount: z.string().describe('Delegation amount in AVAX (human-readable)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, nodeId, amount, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_initiate_delegator_registration', { stakingVaultAddress, nodeId, amount, network, rpcUrl }, 'amount');
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'initiate-delegator-registration', nodeId, amount, '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'staking_vault_complete_delegator_registration',
    'Complete delegator registration via staking vault — cross-chain warp + uptime proof (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      initiateTxHash: Hex.describe('Transaction hash from initiate-delegator-registration'),
      uptimeRpcUrl: z.string().describe('RPC URL for fetching validator uptime proof'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ stakingVaultAddress, initiateTxHash, uptimeRpcUrl, network, rpcUrl }) => {
      if (uptimeRpcUrl && rpcUrl) {
        return formatGuardError('Cannot set both rpcUrl and uptimeRpcUrl — the CLI uses a single --rpc-url flag. Use uptimeRpcUrl for uptime proof, or rpcUrl for the network endpoint.');
      }
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_complete_delegator_registration', { stakingVaultAddress, initiateTxHash, uptimeRpcUrl, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['staking-vault', 'complete-delegator-registration',
        initiateTxHash, uptimeRpcUrl, '--staking-vault-address', stakingVaultAddress];
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );

  // ── Delegator Removal (two-phase) ──

  server.tool(
    'staking_vault_initiate_delegator_removal',
    'Initiate delegator removal via staking vault (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      delegationId: Hex.describe('Delegation ID (hex)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ stakingVaultAddress, delegationId, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_initiate_delegator_removal', { stakingVaultAddress, delegationId, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['staking-vault', 'initiate-delegator-removal', delegationId, '--staking-vault-address', stakingVaultAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );

  server.tool(
    'staking_vault_complete_delegator_removal',
    'Complete delegator removal via staking vault — cross-chain warp to P-Chain (requires SUZAKU_PK)',
    {
      stakingVaultAddress: Address.describe('StakingVault contract address'),
      initiateRemovalTxHash: Hex.describe('Transaction hash from initiate-delegator-removal'),
      skipWaitApi: z.boolean().optional().describe('Skip waiting for weight update on P-Chain API'),
      delegationIds: z.array(z.string()).optional().describe('Filter which delegations to process (hex IDs)'),
      initiateTx: z.string().optional().describe('Initiate delegator registration tx hash for justification (single value — one delegation at a time)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true, openWorldHint: true },
    async ({ stakingVaultAddress, initiateRemovalTxHash, skipWaitApi, delegationIds, initiateTx, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('staking_vault_complete_delegator_removal', { stakingVaultAddress, initiateRemovalTxHash, skipWaitApi, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      const args = ['staking-vault', 'complete-delegator-removal', initiateRemovalTxHash, '--staking-vault-address', stakingVaultAddress];
      if (skipWaitApi) args.push('--skip-wait-api');
      for (const did of delegationIds ?? []) args.push('--delegation-id', did);
      if (initiateTx) args.push('--initiate-tx', initiateTx);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true, pchainPrivateKey: true, timeout: WARP_TIMEOUT }));
    },
  );
}
