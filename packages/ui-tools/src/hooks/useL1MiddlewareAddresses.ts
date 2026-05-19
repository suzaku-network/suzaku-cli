'use client';

import { useReadContracts } from 'wagmi';
import type { Address } from 'viem';
import { L1MiddlewareABI } from '@suzaku-network/suzaku-sdk/core';

export type L1MiddlewareAddresses = {
  vaultManagerAddress: Address | undefined;
  operatorL1OptInServiceAddress: Address | undefined;
};

export function useL1MiddlewareAddresses(middlewareAddress?: Address): L1MiddlewareAddresses {
  const { data } = useReadContracts({
    contracts: [
      {
        abi: L1MiddlewareABI,
        address: middlewareAddress,
        functionName: 'getVaultManager',
      },
      {
        abi: L1MiddlewareABI,
        address: middlewareAddress,
        functionName: 'OPERATOR_L1_OPTIN',
      },
    ],
    query: {
      enabled: !!middlewareAddress,
      staleTime: 60_000,
    },
  });

  return {
    vaultManagerAddress: data?.[0]?.result as Address | undefined,
    operatorL1OptInServiceAddress: data?.[1]?.result as Address | undefined,
  };
}
