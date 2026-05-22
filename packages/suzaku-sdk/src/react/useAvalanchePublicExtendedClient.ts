import { useMemo } from "react";
import { useChainId, useConfig } from "wagmi";
import { createAvalanchePublicExtendedClient } from "../core/client/createAvalanchePublicExtendedClient";
import type { ExtendedPublicClient, Network } from "../core/client/types";

/**
 * Returns an ExtendedPublicClient for the currently connected chain.
 * Works for mainnet, fuji, and any custom L1 — pChain and xChain endpoints
 * are always derived from the chain's RPC URL origin.
 *
 * Requires no wallet connection; safe to use in read-only contexts.
 */
export function useAvalanchePublicExtendedClient(): ExtendedPublicClient | null {
  const chainId = useChainId();
  const config = useConfig();
  console.log("Suzaku: Creating public extended client", { chainId, config })
  return useMemo(() => {
    const chain = config.chains.find((c) => c.id === chainId);
    if (!chain) return null;
    const baseUrl = chain.rpcUrls.default.http[0];
    if (!baseUrl) return null;
    const network: Network = chain.testnet ? "fuji" : "mainnet";
    return createAvalanchePublicExtendedClient(baseUrl, chain, network);
  }, [chainId, config.chains]);
}
