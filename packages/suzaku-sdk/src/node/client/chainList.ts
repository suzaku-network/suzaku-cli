import { info } from '@avalabs/avalanchejs';
import { defineChain } from 'viem';
import { chainList } from '../../core/client/chainList';

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
    chainList.custom = defineChain({
      ...chainList.custom,
      testnet: networkIDresp.networkID === '1' ? false : true,
      network: networkIDresp.networkID === '1' ? 'mainnet' : 'fuji',
      id: Number(chainId),
      rpcUrls: { default: { http: [rpcUrl] } },
    });
  } catch (error) {
    console.error('Error Custom RPC seems to be down or the infoAPI is not available, please check your RPC URL.', error);
    process.exit(1);
  }
}
