import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getBalance } from "@avalanche-sdk/client/methods/pChain";
import type { GetBalanceReturnType } from "@avalanche-sdk/client/methods/pChain";
import { useAvalancheWalletClient } from "./useAvalancheWalletClient";
import { usePChainAddress } from "./usePChainAddress";

export type UsePChainBalanceOptions = {
  /** Override the derived P-Chain address (e.g. `P-fuji1...`). */
  address?: string;
  /** Refetch interval in ms. Defaults to 20s. Pass `false` to disable. */
  refetchInterval?: number | false;
};

/**
 * Fetches the P-Chain balance for the connected wallet (or a custom address).
 * Balance is returned in nano-AVAX (1 AVAX = 1e9).
 */
export function usePChainBalance(
  options: UsePChainBalanceOptions = {},
): UseQueryResult<GetBalanceReturnType | null> {
  const client = useAvalancheWalletClient();
  const { data: derivedAddress } = usePChainAddress();
  const address = options.address ?? derivedAddress ?? null;

  return useQuery({
    queryKey: ["suzaku", "p-chain-balance", address],
    queryFn: async () => {
      if (!client || !address) return null;
      return getBalance(client.pChainClient, { addresses: [address] });
    },
    enabled: !!client && !!address,
    refetchInterval: options.refetchInterval ?? 20_000,
  });
}
