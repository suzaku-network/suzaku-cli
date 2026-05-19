import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import type { Hex } from "viem";
import { useAvalancheWalletClient } from "./useAvalancheWalletClient";
import { publicKeyToXPAddress } from "./internal/publicKeyToXPAddress";
import type { ExtendedWalletClient, Network, PChainAddress } from "../core/client/types";

/**
 * Returns an `ExtendedWalletClient` suitable for calling core service functions.
 * Extends the base `AvalancheWalletClient` with `network` and `addresses` derived
 * from the connected wallet's public key and the active wagmi chain.
 */
export function useExtendedWalletClient(): ExtendedWalletClient | null {
  const client = useAvalancheWalletClient();
  const { chain, address: cAddress } = useConnection();

  const { data } = useQuery({
    queryKey: ["suzaku", "extended-wallet-client", chain?.id, cAddress],
    queryFn: async (): Promise<ExtendedWalletClient | null> => {
      if (!client || !chain || !cAddress) return null;
      const network: Network = chain.testnet ? "fuji" : "mainnet";
      const hrp = network === "mainnet" ? "avax" : "fuji";
      const { xp } = await client.getAccountPubKey();
      const pChainAddress = `P-${publicKeyToXPAddress(xp, hrp)}` as PChainAddress;
      return {
        ...client,
        network,
        addresses: { C: cAddress as Hex, P: pChainAddress },
      } as ExtendedWalletClient;
    },
    enabled: !!client && !!chain && !!cAddress,
    staleTime: 60_000,
  });

  return data ?? null;
}
