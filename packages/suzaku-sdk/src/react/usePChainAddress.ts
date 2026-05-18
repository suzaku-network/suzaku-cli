import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { publicKeyToXPAddress } from "@avalanche-sdk/client/accounts";
import { useAvalancheWalletClient } from "./useAvalancheWalletClient.js";

export type PChainAddress = `P-${string}`;

/**
 * Derives the bech32 P-Chain address from the connected wallet's XP public key.
 * Uses the `fuji` HRP on testnets, `avax` otherwise.
 */
export function usePChainAddress(): UseQueryResult<PChainAddress | null> {
  const client = useAvalancheWalletClient();
  const { chain } = useConnection();
  const hrp = chain?.testnet ? "fuji" : "avax";

  return useQuery({
    queryKey: ["suzaku", "p-chain-address", chain?.id],
    queryFn: async (): Promise<PChainAddress | null> => {
      if (!client) return null;
      const { xp } = await client.getAccountPubKey();
      return `P-${publicKeyToXPAddress(xp, hrp)}` as const;
    },
    enabled: !!client,
    staleTime: 60_000,
  });
}
