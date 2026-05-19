'use client';

import { useReadContract } from 'wagmi';
import type { Address } from 'viem';
import L1RegistryABI from '../core/L1Registry/abi';

export type L1Info = {
  address: Address;
  middlewareAddress: Address;
  metadataURL: string;
};

export type UseGetAllL1sParams = {
  l1RegistryAddress?: Address;
};

export function useGetAllL1s(params: UseGetAllL1sParams) {
  return useReadContract({
    abi: L1RegistryABI,
    address: params.l1RegistryAddress,
    functionName: 'getAllL1s',
    query: {
      enabled: !!params.l1RegistryAddress,
      staleTime: 30_000,
      select: (data): L1Info[] => {
        const [addresses, middlewares, metadataURLs] = data as [Address[], Address[], string[]];
        return addresses.map((address, i) => ({
          address,
          middlewareAddress: middlewares[i],
          metadataURL: metadataURLs[i],
        }));
      },
    },
  });
}
