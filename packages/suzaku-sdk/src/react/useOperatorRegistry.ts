'use client';

import { useReadContract } from 'wagmi';
import type { Address } from 'viem';
import OperatorRegistryABI from '../core/OperatorRegistry/abi';

export type OperatorInfo = {
  address: Address;
  metadataURL: string;
};

export type UseGetAllOperatorsParams = {
  operatorRegistryAddress?: Address;
};

export function useGetAllOperators(params: UseGetAllOperatorsParams) {
  return useReadContract({
    abi: OperatorRegistryABI,
    address: params.operatorRegistryAddress,
    functionName: 'getAllOperators',
    query: {
      enabled: !!params.operatorRegistryAddress,
      staleTime: 30_000,
      select: (data): OperatorInfo[] => {
        const [addresses, metadataURLs] = data as [Address[], string[]];
        return addresses.map((address, i) => ({
          address,
          metadataURL: metadataURLs[i],
        }));
      },
    },
  });
}
