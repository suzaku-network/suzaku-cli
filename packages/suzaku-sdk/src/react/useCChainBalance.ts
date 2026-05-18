"use client";

import { useBalance, useConnection, type UseBalanceReturnType } from "wagmi";
import type { Address } from "viem";

export type UseCChainBalanceOptions = {
  /** Override the connected EVM address. */
  address?: Address;
  /** Refetch interval in ms. Pass `false` to disable. */
  refetchInterval?: number | false;
};

/**
 * Fetches the C-Chain native AVAX balance for the connected wallet (or a
 * custom address) via wagmi's `useBalance`. Returns the standard wagmi
 * query result; `data.value` is wei (`bigint`).
 */
export function useCChainBalance(
  options: UseCChainBalanceOptions = {},
): UseBalanceReturnType {
  const { address: connectedAddress } = useConnection();
  const address = options.address ?? connectedAddress;

  return useBalance({
    address,
    query: {
      enabled: !!address,
      refetchInterval: options.refetchInterval ?? 20_000,
    },
  });
}
