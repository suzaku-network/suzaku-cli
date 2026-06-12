import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runCli, formatResult, formatGuardError, requireSigner } from '../cli-runner.js';
import { guardWriteOperation } from '../guard.js';
import { Address, Network, RpcUrl } from '../schemas.js';
import { augmentLstInfo } from './payload-augment.js';

export function registerLstWrapperTools(server: McpServer, readOnly?: boolean) {
  // ── Reads ──

  server.tool(
    'lst_wrapper_info',
    'Get a full snapshot of an LSTWrapper (wsALOT): name, symbol, decimals, linked vault/collateral/rewards addresses, total assets (raw wei), total supply (raw wei), pause state, and owner. Use this to confirm the wrapper is pointed at the right sALOT vault before any deposit.',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address (e.g. wsALOT: 0xDc1c4428F3145286f262980d36C640285c0DA403)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ lstWrapperAddress, network, rpcUrl }) => {
      const result = await runCli(
        ['lst-wrapper', 'info', lstWrapperAddress],
        { network, rpcUrl },
      );
      if (result.success && result.data) return formatResult({ ...result, data: augmentLstInfo(result.data) });
      return formatResult(result);
    },
  );

  server.tool(
    'lst_wrapper_get_balance',
    'Get the wsALOT (LST share) balance of an account — determines how many shares can be redeemed and the current voting weight. Returns raw wei (18 decimals).',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address'),
      account: Address.describe('Account address to query'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ lstWrapperAddress, account, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['lst-wrapper', 'get-balance', lstWrapperAddress, '--account', account],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'lst_wrapper_preview_deposit',
    'Simulate a deposit: returns how many wsALOT shares would be minted for a given ALOT asset amount. Use before depositing to check the current exchange rate. Both assets and the returned shares are in raw wei (18 decimals).',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address'),
      assets: z.string().describe('Amount of collateral assets to simulate depositing (raw integer, wei — 18 decimals; e.g. "1000000000000000000" = 1 ALOT)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ lstWrapperAddress, assets, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['lst-wrapper', 'preview-deposit', lstWrapperAddress, assets],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'lst_wrapper_preview_redeem',
    'Simulate a redemption: returns how many ALOT collateral assets would be received for burning a given number of wsALOT shares. Reflects the current exchange rate including any accrued rewards. Both shares and the returned assets are in raw wei (18 decimals).',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address'),
      shares: z.string().describe('Amount of LST shares to simulate redeeming (raw integer, wei — 18 decimals; e.g. "1000000000000000000" = 1 wsALOT)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ lstWrapperAddress, shares, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['lst-wrapper', 'preview-redeem', lstWrapperAddress, shares],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'lst_wrapper_max_deposit',
    'Check the remaining deposit capacity for an account before the vault collateral limit is reached. Returns 0 when deposits are paused or during the seed phase (no supply yet). Returns raw wei (18 decimals).',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address'),
      account: Address.describe('Account address to check capacity for'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ lstWrapperAddress, account, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['lst-wrapper', 'max-deposit', lstWrapperAddress, '--account', account],
        { network, rpcUrl },
      ));
    },
  );

  server.tool(
    'lst_wrapper_paused',
    'Check whether new deposits into the LSTWrapper are currently blocked. Returns true when paused. Existing wsALOT shares are always redeemable regardless of this flag.',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { readOnlyHint: true, idempotentHint: true },
    async ({ lstWrapperAddress, network, rpcUrl }) => {
      return formatResult(await runCli(
        ['lst-wrapper', 'paused', lstWrapperAddress],
        { network, rpcUrl },
      ));
    },
  );

  if (readOnly) return;

  // ── Writes ──

  server.tool(
    'lst_wrapper_deposit',
    'Deposit ALOT collateral assets into the LSTWrapper and receive wsALOT shares. This is the user-facing entry point for wsALOT since direct sALOT vault deposits are whitelist-gated. Assets amount is in raw wei (18 decimals). Requires SUZAKU_PK.',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address (e.g. wsALOT: 0xDc1c4428F3145286f262980d36C640285c0DA403)'),
      assets: z.string().describe('Amount of collateral assets to deposit (raw integer, wei — 18 decimals; e.g. "1000000000000000000" = 1 ALOT)'),
      receiver: Address.optional().describe('Address to receive the minted wsALOT shares (defaults to signer)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ lstWrapperAddress, assets, receiver, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('lst_wrapper_deposit', { lstWrapperAddress, assets, receiver, network, rpcUrl }, 'assets');
      if (guardErr) return formatGuardError(guardErr);
      const args = ['lst-wrapper', 'deposit', lstWrapperAddress, assets];
      if (receiver) args.push('--receiver', receiver);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'lst_wrapper_redeem',
    'Burn wsALOT shares and receive ALOT collateral assets. Reduces the owner\'s voting weight and reward exposure. Shares amount is in raw wei (18 decimals). Requires SUZAKU_PK.',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address'),
      shares: z.string().describe('Amount of wsALOT shares to burn (raw integer, wei — 18 decimals; e.g. "1000000000000000000" = 1 wsALOT)'),
      receiver: Address.optional().describe('Address to receive the redeemed ALOT assets (defaults to signer)'),
      owner: Address.optional().describe('Address that owns the shares being redeemed (defaults to signer)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ lstWrapperAddress, shares, receiver, owner, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('lst_wrapper_redeem', { lstWrapperAddress, shares, receiver, owner, network, rpcUrl }, 'shares');
      if (guardErr) return formatGuardError(guardErr);
      const args = ['lst-wrapper', 'redeem', lstWrapperAddress, shares];
      if (receiver) args.push('--receiver', receiver);
      if (owner) args.push('--owner', owner);
      return formatResult(await runCli(args, { network, rpcUrl, privateKey: true }));
    },
  );

  server.tool(
    'lst_wrapper_harvest',
    'Step 5 of the Dexalot epoch workflow: collect accrued native staking rewards from the sALOT vault and compound them as vault shares, raising the wsALOT exchange rate for all holders. Permissionless — any signer can call this. Requires SUZAKU_PK.',
    {
      lstWrapperAddress: Address.describe('LSTWrapper contract address (e.g. wsALOT: 0xDc1c4428F3145286f262980d36C640285c0DA403)'),
      network: Network,
      rpcUrl: RpcUrl,
    },
    { destructiveHint: true },
    async ({ lstWrapperAddress, network, rpcUrl }) => {
      const pkErr = requireSigner();
      if (pkErr) return pkErr;
      const guardErr = await guardWriteOperation('lst_wrapper_harvest', { lstWrapperAddress, network, rpcUrl });
      if (guardErr) return formatGuardError(guardErr);
      return formatResult(await runCli(
        ['lst-wrapper', 'harvest', lstWrapperAddress],
        { network, rpcUrl, privateKey: true },
      ));
    },
  );
}
