import { Chain, defineChain } from 'viem';
import { anvil, avalanche, avalancheFuji } from 'viem/chains';
import { info } from '@avalabs/avalanchejs';

avalanche.testnet = false;
avalancheFuji.testnet = true;

export const chainList: Record<string, Chain> & { custom: Chain } = {
  anvil,
  mainnet: avalanche,
  fuji: avalancheFuji,
  kiteaitestnet: defineChain({
    id: 2368,
    name: 'Kite AI Testnet',
    network: 'fuji',
    testnet: true,
    nativeCurrency: { decimals: 18, name: 'KITE', symbol: 'KITE' },
    rpcUrls: { default: { http: ['https://rpc-testnet.gokite.ai/'] } },
  }),
  kiteai: defineChain({
    id: 2366,
    name: 'Kite AI',
    network: 'mainnet',
    testnet: false,
    nativeCurrency: { decimals: 18, name: 'KITE', symbol: 'KITE' },
    rpcUrls: { default: { http: ['https://rpc.gokite.ai'] } },
    contracts: {
      multicall3: {
        address: '0xE3104A157cc4C0d3c7C3a8c655092668D068c149',
        blockCreated: 29260,
      },
    },
  }),
  custom: defineChain({
    id: 13694,
    name: 'Custom',
    network: 'fuji',
    testnet: true,
    nativeCurrency: { decimals: 18, name: 'AVAX', symbol: 'AVAX' },
    contracts: {
      multicall3: {
        address: '0xca11bde05977b3631167028862be2a173976ca11',
        blockCreated: 0,
      },
    },
    rpcUrls: { default: { http: ['http://localhost:9650/ext/bc/C/rpc'] } },
  }),
};

async function getChainId(rpcUrl: string): Promise<number> {
  const ret = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
  });
  const data = await ret.json();
  return data.result;
}

export async function setCustomChainRpcUrl(rpcUrl: string): Promise<void> {
  const url = new URL(rpcUrl);
  const infoApi = new info.InfoApi(`${url.protocol}//${url.host}`);
  try {
    const networkIDresp = await infoApi.getNetworkId();
    const chainId = await getChainId(rpcUrl);
    const networkName =
      networkIDresp.networkID === '1' ? 'mainnet' :
      networkIDresp.networkID === '12345' ? 'local' :
      'fuji';
    chainList.custom = defineChain({
      ...chainList.custom,
      testnet: networkName !== 'mainnet',
      network: networkName,
      id: Number(chainId),
      rpcUrls: { default: { http: [rpcUrl] } },
    });
  } catch (error) {
    throw new Error(`Custom RPC seems to be down or infoAPI is not available: ${rpcUrl}`, { cause: error });
  }
}
