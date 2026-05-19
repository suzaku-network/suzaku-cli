'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient, useReadContracts } from 'wagmi';
import { parseAbiItem, zeroAddress, formatUnits } from 'viem';
import type { Address } from 'viem';
import { VaultTokenizedABI } from '@suzaku-network/suzaku-sdk/core';

export type StakerVaultPosition = {
  shares: bigint;
  activeShares: bigint;
  totalSupply: bigint;
  percentage: number;
};

export type StakerWithPositions = {
  address: Address;
  vaults: Record<Address, StakerVaultPosition>;
};

const ERC20_TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

export function useVaultStakers(vaultAddresses: Address[]) {
  const publicClient = usePublicClient();

  // Step 1: collect unique staker addresses from Transfer(from=0x0) events across all vaults
  const { data: stakersByVault } = useQuery({
    queryKey: ['vaultStakers-addresses', vaultAddresses],
    queryFn: async () => {
      if (!publicClient || vaultAddresses.length === 0) return {} as Record<Address, Set<Address>>;
      const result: Record<Address, Set<Address>> = {};
      await Promise.all(
        vaultAddresses.map(async (vault) => {
          const logs = await publicClient.getLogs({
            address: vault,
            event: ERC20_TRANSFER,
            args: { from: zeroAddress },
            fromBlock: 0n,
          });
          result[vault] = new Set(logs.map((l) => l.args.to as Address));
        }),
      );
      return result;
    },
    enabled: !!publicClient && vaultAddresses.length > 0,
    staleTime: 60_000,
  });

  const allStakers = [...new Set(Object.values(stakersByVault ?? {}).flatMap((s) => [...s]))] as Address[];

  // Step 2: multicall balanceOf + activeSharesOf per (staker, vault) pair
  const balancePairs = allStakers.flatMap((staker) =>
    vaultAddresses.map((vault) => ({ staker, vault })),
  );

  const { data: balanceData, isLoading } = useReadContracts({
    contracts: balancePairs.flatMap(({ staker, vault }) => [
      { abi: VaultTokenizedABI, address: vault, functionName: 'balanceOf' as const, args: [staker] as const },
      { abi: VaultTokenizedABI, address: vault, functionName: 'activeSharesOf' as const, args: [staker] as const },
      { abi: VaultTokenizedABI, address: vault, functionName: 'totalSupply' as const },
    ]),
    query: { enabled: balancePairs.length > 0, staleTime: 30_000 },
  });

  const stakers: StakerWithPositions[] = allStakers.map((staker, si) => {
    const vaultPositions: Record<Address, StakerVaultPosition> = {};
    vaultAddresses.forEach((vault, vi) => {
      const base = (si * vaultAddresses.length + vi) * 3;
      const shares = (balanceData?.[base]?.result as bigint | undefined) ?? 0n;
      const activeShares = (balanceData?.[base + 1]?.result as bigint | undefined) ?? 0n;
      const totalSupply = (balanceData?.[base + 2]?.result as bigint | undefined) ?? 0n;
      if (shares > 0n || activeShares > 0n) {
        vaultPositions[vault] = {
          shares,
          activeShares,
          totalSupply,
          percentage: totalSupply > 0n ? Number(formatUnits(activeShares * 10000n / totalSupply, 2)) : 0,
        };
      }
    });
    return { address: staker, vaults: vaultPositions };
  }).filter((s) => Object.keys(s.vaults).length > 0);

  return { stakers, isLoading };
}
