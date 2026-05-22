import type { Chain, EIP1193Provider } from 'viem';
import { createAvalancheWalletClient } from '@avalanche-sdk/client';
import type { ExtendedWalletClient, Network, PChainAddress } from './types';
import { avalanche, avalancheFuji } from '@avalanche-sdk/client/chains';
import { publicKeyToXPAddress } from '../lib/publicKeyToXPAddress';

export async function createAvalancheWalletExtendedClient(
  chain: Chain,
  provider: EIP1193Provider
): Promise<ExtendedWalletClient> {
  const primaryChain = chain.testnet === true ? avalancheFuji : avalanche;
  const walletClient = createAvalancheWalletClient({ chain: primaryChain, transport: { type: 'custom', provider } });
  const cChainAddress = (await walletClient.getAddresses())[0];
  const hrp = chain.testnet === true ? "fuji" : "avax";

  const { xp } = await walletClient.getAccountPubKey();
  const pChainAddress = `P-${publicKeyToXPAddress(xp, hrp)}` as PChainAddress;
  const network: Network = chain.testnet ? "fuji" : "mainnet";
  const l1Client = createAvalancheWalletClient({ chain, transport: { type: 'custom', provider }, account: cChainAddress });

  // Switch Core to the primary network before any P/X-Chain tx, then switch back.
  // Core routes avalanche_sendTransaction based on the currently active chain, so without
  // this switch it misroutes when the wallet is on a custom L1.
  const sendXPTransaction: typeof walletClient.sendXPTransaction = async (params) => {
    await l1Client.switchChain({ id: primaryChain.id });
    try {
      return await walletClient.sendXPTransaction(params);
    } finally {
      await l1Client.switchChain({ id: chain.id });
    }
  };

  return {
    ...l1Client,
    network,
    addresses: { C: cChainAddress, P: pChainAddress },
    pChain: walletClient.pChain,
    pChainClient: walletClient.pChainClient,
    xChain: walletClient.xChain,
    xChainClient: walletClient.xChainClient,
    sendXPTransaction,
    waitForTxn: walletClient.waitForTxn,
  };
}
