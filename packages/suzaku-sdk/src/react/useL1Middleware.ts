import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { getL1Middleware } from "../core/L1Middleware/abi";
import {
  addNode,
  initStakeUpdate,
  processNodeStakeCache,
  predictForceUpdateImpact,
  getLastNodeValidationId,
  getValidatorsToTopUp,
  weightSync,
  type OperatorForceUpdatePrediction,
  type ValidatorTopUp,
} from "../core/L1Middleware/service";
import type { NodeId } from "../core/lib/avalancheUtils";

type PChainOwnerOptions = { threshold?: number; addresses?: Hex[] };

export type AddNodeParams = {
  contractAddress: Address;
  nodeId: NodeId;
  blsKey: Hex;
  initialStake: string;
  remainingBalanceOwner?: PChainOwnerOptions;
  disableOwner?: PChainOwnerOptions;
};

export function useAddNode(): UseMutationResult<Hex, Error, AddNodeParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getL1Middleware(client, params.contractAddress);
      return addNode(
        client, contract, params.nodeId, params.blsKey,
        params.initialStake, params.remainingBalanceOwner, params.disableOwner,
      );
    },
  });
}

export type InitStakeUpdateParams = {
  contractAddress: Address;
  nodeId: NodeId;
  newStake: string;
};

export function useInitStakeUpdate(): UseMutationResult<Hex, Error, InitStakeUpdateParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getL1Middleware(client, params.contractAddress);
      return initStakeUpdate(client, contract, params.nodeId, params.newStake);
    },
  });
}

export type ProcessNodeStakeCacheParams = {
  contractAddress: Address;
  epochs?: number;
  loopEpochs?: number;
  delay?: number;
};

export function useProcessNodeStakeCache(): UseMutationResult<void, Error, ProcessNodeStakeCacheParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getL1Middleware(client, params.contractAddress);
      return processNodeStakeCache(contract, params.epochs, params.loopEpochs, params.delay);
    },
  });
}

export type WeightSyncParams = {
  contractAddress: Address;
  epochs?: number;
  loopEpochs?: number;
};

export function useWeightSync(): UseMutationResult<string[], Error, WeightSyncParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getL1Middleware(client, params.contractAddress);
      return weightSync(client, contract, params.epochs, params.loopEpochs);
    },
  });
}

export type PredictForceUpdateImpactParams = {
  contractAddress?: Address;
  operators: Hex[];
};

export function usePredictForceUpdateImpact(
  params: PredictForceUpdateImpactParams,
): UseQueryResult<OperatorForceUpdatePrediction[] | null> {
  const { client } = useAvalancheWalletExtendedClient();
  return useQuery({
    queryKey: ["predictForceUpdateImpact", params.contractAddress, params.operators],
    queryFn: async () => {
      if (!client || !params.contractAddress) return null;
      const contract = await getL1Middleware(client, params.contractAddress);
      return predictForceUpdateImpact(client, contract, params.operators);
    },
    enabled: !!client && !!params.contractAddress,
    staleTime: 30_000,
  });
}

export type GetLastNodeValidationIdParams = {
  contractAddress?: Address;
  nodeId?: NodeId;
};

export function useGetLastNodeValidationId(
  params: GetLastNodeValidationIdParams,
): UseQueryResult<Hex | null> {
  const { client } = useAvalancheWalletExtendedClient();
  return useQuery({
    queryKey: ["getLastNodeValidationId", params.contractAddress, params.nodeId],
    queryFn: async () => {
      if (!client || !params.contractAddress || !params.nodeId) return null;
      const contract = await getL1Middleware(client, params.contractAddress);
      return getLastNodeValidationId(client, contract, params.nodeId);
    },
    enabled: !!client && !!params.contractAddress && !!params.nodeId,
    staleTime: 30_000,
  });
}

export type GetValidatorsToTopUpParams = {
  contractAddress?: Address;
  operator?: Hex;
  targetBalanceWei?: bigint;
};

export type GetValidatorsToTopUpResult = {
  validatorsToTopUp: ValidatorTopUp[];
  totalTopUp: bigint;
  nodeCount: bigint;
};

export function useGetValidatorsToTopUp(
  params: GetValidatorsToTopUpParams,
): UseQueryResult<GetValidatorsToTopUpResult | null> {
  const { client } = useAvalancheWalletExtendedClient();
  return useQuery({
    queryKey: ["getValidatorsToTopUp", params.contractAddress, params.operator, params.targetBalanceWei?.toString()],
    queryFn: async () => {
      if (!client || !params.contractAddress || !params.operator || params.targetBalanceWei == null) return null;
      const contract = await getL1Middleware(client, params.contractAddress);
      return getValidatorsToTopUp(client, contract, params.operator, params.targetBalanceWei);
    },
    enabled: !!client && !!params.contractAddress && !!params.operator && params.targetBalanceWei != null,
    staleTime: 30_000,
  });
}
