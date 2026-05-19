'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import type { Address, Hex } from 'viem';
import { L1MiddlewareABI } from '@suzaku-network/suzaku-sdk/core';

export type OperatorWithNodes = {
  address: Address;
  nodeIds: Hex[];
  usedStake: bigint;
  totalStake: bigint;
};

export function useL1OperatorsWithNodes(middlewareAddress?: Address) {
  // Step 1: get all operators + current epoch + primary asset class
  const { data: operators } = useReadContract({
    abi: L1MiddlewareABI,
    address: middlewareAddress,
    functionName: 'getAllOperators',
    query: { enabled: !!middlewareAddress, staleTime: 30_000 },
  }) as { data: Address[] | undefined };

  const { data: epochData } = useReadContracts({
    contracts: [
      { abi: L1MiddlewareABI, address: middlewareAddress!, functionName: 'getCurrentEpoch' as const },
      { abi: L1MiddlewareABI, address: middlewareAddress!, functionName: 'PRIMARY_ASSET_CLASS' as const },
    ],
    query: { enabled: !!middlewareAddress, staleTime: 30_000 },
  });

  const currentEpoch = epochData?.[0]?.result as number | undefined;
  const primaryAssetClass = epochData?.[1]?.result as bigint | undefined;

  // Step 2: per-operator: node count + used stake
  const { data: operatorMeta } = useReadContracts({
    contracts: (operators ?? []).flatMap((op) => [
      { abi: L1MiddlewareABI, address: middlewareAddress!, functionName: 'getOperatorNodesLength' as const, args: [op] as const },
      { abi: L1MiddlewareABI, address: middlewareAddress!, functionName: 'getOperatorUsedStakeCached' as const, args: [op] as const },
    ]),
    query: { enabled: (operators?.length ?? 0) > 0, staleTime: 30_000 },
  });

  // Step 3: per-operator: total stake at current epoch
  const { data: stakeData } = useReadContracts({
    contracts: (operators ?? []).map((op) => ({
      abi: L1MiddlewareABI,
      address: middlewareAddress!,
      functionName: 'getOperatorStake' as const,
      args: [op, currentEpoch ?? 0, primaryAssetClass ?? 0n] as const,
    })),
    query: {
      enabled: (operators?.length ?? 0) > 0 && currentEpoch !== undefined && primaryAssetClass !== undefined,
      staleTime: 30_000,
    },
  });

  // Step 4: per-node: nodeId for each operator
  const nodeCalls = (operators ?? []).flatMap((op, oi) => {
    const nodeCount = Number((operatorMeta?.[oi * 2]?.result as bigint | undefined) ?? 0n);
    return Array.from({ length: nodeCount }, (_, j) => ({
      abi: L1MiddlewareABI,
      address: middlewareAddress!,
      functionName: 'operatorNodesArray' as const,
      args: [op, BigInt(j)] as const,
    }));
  });

  const { data: nodeData, isLoading } = useReadContracts({
    contracts: nodeCalls,
    query: { enabled: nodeCalls.length > 0, staleTime: 30_000 },
  });

  const result: OperatorWithNodes[] = (operators ?? []).map((op, oi) => {
    const nodeCount = Number((operatorMeta?.[oi * 2]?.result as bigint | undefined) ?? 0n);
    const nodeOffset = (operators ?? []).slice(0, oi).reduce((acc, _, i) => {
      return acc + Number((operatorMeta?.[i * 2]?.result as bigint | undefined) ?? 0n);
    }, 0);
    const nodeIds = Array.from({ length: nodeCount }, (_, j) =>
      nodeData?.[nodeOffset + j]?.result as Hex | undefined,
    ).filter((id): id is Hex => !!id);

    return {
      address: op,
      nodeIds,
      usedStake: (operatorMeta?.[oi * 2 + 1]?.result as bigint | undefined) ?? 0n,
      totalStake: (stakeData?.[oi]?.result as bigint | undefined) ?? 0n,
    };
  });

  return { operators: result, isLoading: !operators || isLoading };
}
