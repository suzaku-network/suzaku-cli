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
    id: 42775,
    name: 'Custom',
    network: 'fuji',
    testnet: true,
    nativeCurrency: {
      decimals: 18,
      name: 'AVAX',
      symbol: 'AVAX',
    },
    contracts: {
      multicall3: {
        address: "0xca11bde05977b3631167028862be2a173976ca11",
        blockCreated: 24,
      },
    },
    rpcUrls: {
      default: { http: ["http://51.159.210.12:9660/ext/bc/S7RP9bonFjat7X5NYa5c8bzNiVz9xGWBhfXqAycu9dcjKifhW/rpc"] },
    },
  })
}
