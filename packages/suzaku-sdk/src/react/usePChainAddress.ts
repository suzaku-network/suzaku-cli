import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { publicKeyToXPAddress } from "../core/lib/publicKeyToXPAddress";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { getHRP } from "../core/client/createAvalancheWalletExtendedClient";

export type PChainAddress = `P-${string}`;

/**
 * Derives the bech32 P-Chain address from the connected wallet's XP public key.
 * Uses the `fuji` HRP on testnets, `avax` otherwise.
 */
export function usePChainAddress(): UseQueryResult<PChainAddress | null> {
  const { client } = useAvalancheWalletExtendedClient();
  const { chain } = useConnection();
  const hrp = getHRP(chain!);

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
