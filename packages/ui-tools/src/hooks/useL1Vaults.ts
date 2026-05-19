'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import type { Address } from 'viem';
import { VaultManagerABI, VaultTokenizedABI } from '@suzaku-network/suzaku-sdk/core';

export type VaultDetail = {
  address: Address;
  collateralClass: bigint;
  collateral: Address | undefined;
  activeStake: bigint;
  activeShares: bigint;
  totalSupply: bigint;
  enabledTime: number;
  disabledTime: number;
};

export function useL1Vaults(vaultManagerAddress?: Address) {
  const { data: vaultCount } = useReadContract({
    abi: VaultManagerABI,
    address: vaultManagerAddress,
    functionName: 'getVaultCount',
    query: { enabled: !!vaultManagerAddress, staleTime: 30_000 },
  });

  const count = Number(vaultCount ?? 0n);

  // Multicall: getVaultAtWithTimes for each index
  const { data: vaultTimesData } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      abi: VaultManagerABI,
      address: vaultManagerAddress!,
      functionName: 'getVaultAtWithTimes' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: count > 0, staleTime: 30_000 },
  });

  const vaultAddresses = vaultTimesData
    ?.map((r) => (r.result as [Address, number, number] | undefined)?.[0])
    .filter((a): a is Address => !!a) ?? [];

  // Multicall: collateralClass, collateral, activeStake, activeShares, totalSupply per vault
  const { data: vaultDetailsData, isLoading } = useReadContracts({
    contracts: vaultAddresses.flatMap((addr) => [
      { abi: VaultManagerABI, address: vaultManagerAddress!, functionName: 'getVaultCollateralClass' as const, args: [addr] as const },
      { abi: VaultTokenizedABI, address: addr, functionName: 'collateral' as const },
      { abi: VaultTokenizedABI, address: addr, functionName: 'activeStake' as const },
      { abi: VaultTokenizedABI, address: addr, functionName: 'activeShares' as const },
      { abi: VaultTokenizedABI, address: addr, functionName: 'totalSupply' as const },
    ]),
    query: { enabled: vaultAddresses.length > 0, staleTime: 30_000 },
  });

  const vaults: VaultDetail[] = vaultAddresses.map((addr, i) => {
    const times = vaultTimesData?.[i]?.result as [Address, number, number] | undefined;
    const base = i * 5;
    return {
      address: addr,
      collateralClass: (vaultDetailsData?.[base]?.result as bigint | undefined) ?? 0n,
      collateral: vaultDetailsData?.[base + 1]?.result as Address | undefined,
      activeStake: (vaultDetailsData?.[base + 2]?.result as bigint | undefined) ?? 0n,
      activeShares: (vaultDetailsData?.[base + 3]?.result as bigint | undefined) ?? 0n,
      totalSupply: (vaultDetailsData?.[base + 4]?.result as bigint | undefined) ?? 0n,
      enabledTime: times?.[1] ?? 0,
      disabledTime: times?.[2] ?? 0,
    };
  });

  return { vaults, isLoading: !vaultCount || isLoading };
}
