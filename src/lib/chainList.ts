import { defineChain } from "viem";
import { anvil, avalanche, avalancheFuji } from "viem/chains";

export const chainList = {
  anvil: anvil,
  mainnet: avalanche,
  fuji: avalancheFuji,
  kitetestnet: defineChain({
    id: 2368,
    name: 'KiteIA Testnet',
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
  custom: defineChain({
    id: 40899,
    name: 'Custom',
    network: 'fuji',
    testnet: true,
    nativeCurrency: {
      decimals: 18,
      name: 'AVAX',
      symbol: 'AVAX',
    },
    rpcUrls: {
      default: { http: ["https://test.ash.center/ext/bc/Ca61g2nYQ4sWr7ZiLeroYHH713xmG88FGuShV2gyfnbG5rLm3/rpc"] },
    },
  })
}
