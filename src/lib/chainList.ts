import { info } from "@avalabs/avalanchejs";
import { Chain, defineChain } from "viem";
import { anvil, avalanche, avalancheFuji } from "viem/chains";
import { getPchainBaseUrl } from "./pChainUtils";
import { getChainId } from "./cChainUtils";
// Used in client
avalanche.testnet = false
avalancheFuji.testnet = true

export const chainList: Record<string, Chain> & { custom: Chain } = {
  anvil: anvil,
  mainnet: avalanche,
  fuji: avalancheFuji,
  kiteaitestnet: defineChain({
    id: 2368,
    name: 'Kite AI Testnet',
    network: 'fuji',
    testnet: true,
    nativeCurrency: {
      decimals: 18,
      name: 'KITE',
      symbol: 'KITE',
    },
    rpcUrls: {
      default: { http: ["https://rpc-testnet.gokite.ai/"] },
    },
  }),
  kiteai: defineChain({
    id: 2366,
    name: 'Kite AI',
    network: 'mainnet',
    testnet: false,
    nativeCurrency: {
      decimals: 18,
      name: 'KITE',
      symbol: 'KITE',
    },
    rpcUrls: {
      default: { http: ["https://rpc.gokite.ai"] },
    },
    contracts: {
      multicall3: {
        address: "0xE3104A157cc4C0d3c7C3a8c655092668D068c149",
        blockCreated: 29260
      }
    }
  }),
  custom: defineChain({
    id: 13694,
    name: 'Custom',
    network: 'fuji',
    testnet: true,
    nativeCurrency: {
      decimals: 18,
      name: 'AVAX',
      symbol: 'AVAX',
    },
    contracts: {// We suppose that the custom chain has been deployed with the multicall3 contract on its genesis block TODO: Otherwise find a strategy
      multicall3: {
        address: "0xca11bde05977b3631167028862be2a173976ca11",
        blockCreated: 0,
      },
    },
    rpcUrls: {
      default: { http: ["http://localhost:9650/ext/bc/C/rpc"] },
    },
  })
}

export async function setCustomChainRpcUrl(rpcUrl: string) {
  const url = new URL(rpcUrl);
  const infoApi = new info.InfoApi(`${url.protocol}//${url.host}`);
  const networkIDresp = await infoApi.getNetworkId()
  const chainId = await getChainId(rpcUrl)
  chainList.custom = defineChain({
    ...chainList.custom,
    testnet: networkIDresp.networkID === "1" ? false : true,
    network: networkIDresp.networkID === "1" ? 'mainnet' : 'fuji',
    id: Number(chainId),
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  });
}
