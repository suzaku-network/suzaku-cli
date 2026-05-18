import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import type { Address } from "viem";
import { useAvalancheWalletClient } from "./useAvalancheWalletClient.js";

export type UseCChainBalanceOptions = {
  /** Override the connected EVM address. */
  address?: Address;
  /** Refetch interval in ms. Defaults to 20s. Pass `false` to disable. */
  refetchInterval?: number | false;
};

/**
 * Fetches the C-Chain native AVAX balance (in wei) for the connected wallet
 * or a custom address.
 */
export function useCChainBalance(
  options: UseCChainBalanceOptions = {},
): UseQueryResult<bigint | null> {
  const client = useAvalancheWalletClient();
  const { address: connectedAddress } = useConnection();
  const address = options.address ?? connectedAddress;

  return useQuery({
    queryKey: ["suzaku", "c-chain-balance", address],
    queryFn: async () => {
      if (!client || !address) return null;
      return client.getBalance({ address });
    },
    enabled: !!client && !!address,
    refetchInterval: options.refetchInterval ?? 20_000,
  });
}
