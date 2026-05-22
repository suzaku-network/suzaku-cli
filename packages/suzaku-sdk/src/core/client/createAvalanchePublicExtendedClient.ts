import type { Chain, Hex } from 'viem';
import {
  createAvalancheClient,
  createAvalancheWalletClient,
  createPChainClient,
  createXChainClient,
  pChainActions,
  xChainActions
} from '@avalanche-sdk/client';
import type { AvalancheAccount } from '@avalanche-sdk/client/accounts';
import type { ExtendedPublicClient, ExtendedWalletClient, Network, PChainAddress } from './types';

export function createAvalanchePublicExtendedClient(
  baseUrl: string,
  chain: Chain,
  network: Network,
  cChainAddress: Hex,
  pChainAddress: PChainAddress,
  account: AvalancheAccount,
): ExtendedWalletClient;
export function createAvalanchePublicExtendedClient(
  baseUrl: string,
  chain: Chain,
  network: Network,
): ExtendedPublicClient;
export function createAvalanchePublicExtendedClient(
  baseUrl: string,
  chain: Chain,
  network: Network,
  cChainAddress?: Hex,
  pChainAddress?: PChainAddress,
  account?: AvalancheAccount,
): ExtendedPublicClient | ExtendedWalletClient {
  const origin = new URL(baseUrl).origin;
  const pChainUrl = `${origin}/ext/bc/P`;
  const xChainUrl = `${origin}/ext/bc/X`;

  if (account && cChainAddress && pChainAddress) {
    const l1Client = createAvalancheWalletClient({
      account,
      chain,
      transport: { type: 'http', url: baseUrl },
    });

    // Dedicated wallet client whose transport targets the P-chain endpoint.
    // Only pChain/xChain methods and sendXPTransaction/waitForTxn are used from it.
    const pChainWalletClient = createAvalancheWalletClient({
      account,
      chain,
      transport: { type: 'http', url: pChainUrl },
    });

    return {
      ...l1Client,
      network,
      addresses: { C: cChainAddress, P: pChainAddress },
      pChain: pChainWalletClient.pChain,
      pChainClient: pChainWalletClient.pChainClient,
      xChain: pChainWalletClient.xChain,
      xChainClient: pChainWalletClient.xChainClient,
      sendXPTransaction: pChainWalletClient.sendXPTransaction,
      waitForTxn: pChainWalletClient.waitForTxn,
    } as ExtendedWalletClient;
  }

  const baseClient = createAvalancheClient({
    chain,
    transport: { type: 'http', url: baseUrl },
  });

  return {
    ...baseClient,
    pChain: createPChainClient({
      chain,
      transport: { type: 'http', url: pChainUrl },
    }).extend(pChainActions),
    xChain: createXChainClient({
      chain,
      transport: { type: 'http', url: xChainUrl },
    }).extend(xChainActions),
    network,
  } as unknown as ExtendedPublicClient;
}
