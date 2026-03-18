import type { Hex, WalletClient, PublicClient, Chain, Account, Transport } from "viem"

export type Network = "fuji" | "mainnet"

export type NodeId = `NodeID-${string}`

export type PChainAddress = `P-${string}`

export const P_CHAIN_CHAIN_ID = "11111111111111111111111111111111LpoYY"

export const GLACIER_URLS: Record<Network, string> = {
  fuji: "https://glacier-api-dev.avax.network/v1/signatureAggregator/fuji/aggregateSignatures",
  mainnet: "https://glacier-api.avax.network/v1/signatureAggregator/mainnet/aggregateSignatures",
}

export const NETWORK_IDS: Record<Network, number> = {
  fuji: 5,
  mainnet: 1,
}

export const AVALANCHE_C_CHAIN_IDS: Record<Network, number> = {
  fuji: 43113,
  mainnet: 43114,
}

export type SdkWalletClient = WalletClient<Transport, Chain, Account>
export type SdkPublicClient = PublicClient<Transport, Chain>
