import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { useAvalanchePublicExtendedClient } from "./useAvalanchePublicExtendedClient";

import { getStakingVault } from "../core/StakingVault/abi";
import {
  getValidatorManagerInfo,
  svInitiateValidatorRegistration,
  svCompleteValidatorRegistration,
  svInitiateValidatorRemoval,
  svForceRemoveValidator,
  svCompleteValidatorRemoval,
  svInitiateDelegatorRegistration,
  svCompleteDelegatorRegistration,
  svCompleteDelegatorRemoval,
  svClaimOperatorFees,
  type ValidatorManagerInfo,
  type PChainOwnerOptions,
} from "../core/StakingVault/service";
import type { NodeId } from "../core/lib/avalancheUtils";

export function useGetValidatorManagerInfo(contractAddress?: Address): UseQueryResult<ValidatorManagerInfo | null> {
  const client = useAvalanchePublicExtendedClient();
  return useQuery({
    queryKey: ["getValidatorManagerInfo", contractAddress],
    queryFn: async () => {
      if (!client || !contractAddress) return null;
      const contract = await getStakingVault(client, contractAddress);
      return getValidatorManagerInfo(client, contract);
    },
    enabled: !!client && !!contractAddress,
    staleTime: 30_000,
  });
}

export type SvInitiateValidatorRegistrationParams = {
  contractAddress: Address;
  nodeId: NodeId;
  blsKey: Hex;
  stakeAmountWei: bigint;
  remainingBalanceOwner?: PChainOwnerOptions;
  disableOwner?: PChainOwnerOptions;
};

export function useSvInitiateValidatorRegistration(): UseMutationResult<Hex, Error, SvInitiateValidatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svInitiateValidatorRegistration(
        client, contract, params.nodeId, params.blsKey,
        params.stakeAmountWei, params.remainingBalanceOwner, params.disableOwner,
      );
    },
  });
}

export type SvCompleteValidatorRegistrationParams = {
  contractAddress: Address;
  initiateTxHash: Hex;
  blsProofOfPossession: Hex;
  initialBalance: bigint;
  waitValidatorVisible?: boolean;
  onProgress?: (msg: string) => void;
};

export function useSvCompleteValidatorRegistration(): UseMutationResult<Hex, Error, SvCompleteValidatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svCompleteValidatorRegistration(
        client, contract, client, params.initiateTxHash,
        params.blsProofOfPossession, params.initialBalance, params.waitValidatorVisible,
        params.onProgress,
      );
    },
  });
}

export type SvInitiateValidatorRemovalParams = {
  contractAddress: Address;
  nodeId: NodeId;
};

export function useSvInitiateValidatorRemoval(): UseMutationResult<{ hash: Hex; validationID: Hex }, Error, SvInitiateValidatorRemovalParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svInitiateValidatorRemoval(client, contract, params.nodeId);
    },
  });
}

export type SvForceRemoveValidatorParams = {
  contractAddress: Address;
  nodeId: NodeId;
};

export function useSvForceRemoveValidator(): UseMutationResult<Hex, Error, SvForceRemoveValidatorParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svForceRemoveValidator(client, contract, params.nodeId);
    },
  });
}

export type SvCompleteValidatorRemovalParams = {
  contractAddress: Address;
  initiateRemovalTxHash: Hex;
  nodeIDs?: NodeId[];
  waitValidatorVisible?: boolean;
  initiateTxHash?: Hex;
  onProgress?: (msg: string) => void;
};

export function useSvCompleteValidatorRemoval(): UseMutationResult<void, Error, SvCompleteValidatorRemovalParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svCompleteValidatorRemoval(
        client, contract, client, params.initiateRemovalTxHash,
        params.nodeIDs, params.waitValidatorVisible, params.initiateTxHash, params.onProgress,
      );
    },
  });
}

export type SvInitiateDelegatorRegistrationParams = {
  contractAddress: Address;
  nodeId: NodeId;
  amountWei: bigint;
};

export function useSvInitiateDelegatorRegistration(): UseMutationResult<{ hash: Hex; validationID: Hex }, Error, SvInitiateDelegatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svInitiateDelegatorRegistration(client, contract, params.nodeId, params.amountWei);
    },
  });
}

export type SvCompleteDelegatorRegistrationParams = {
  contractAddress: Address;
  initiateTxHash: Hex;
  rpcUrl: string;
  bypassToken?: string;
  onProgress?: (msg: string) => void;
};

export function useSvCompleteDelegatorRegistration(): UseMutationResult<Hex, Error, SvCompleteDelegatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svCompleteDelegatorRegistration(
        client, contract, client, params.initiateTxHash, params.rpcUrl, params.bypassToken,
        params.onProgress,
      );
    },
  });
}

export type SvCompleteDelegatorRemovalParams = {
  contractAddress: Address;
  initiateRemovalTxHash: Hex;
  delegationIDs?: Hex[];
  onProgress?: (msg: string) => void;
};

export function useSvCompleteDelegatorRemoval(): UseMutationResult<void, Error, SvCompleteDelegatorRemovalParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svCompleteDelegatorRemoval(
        client, contract, client, params.initiateRemovalTxHash, params.delegationIDs, params.onProgress,
      );
    },
  });
}

export type SvClaimOperatorFeesParams = {
  contractAddress: Address;
};

export function useSvClaimOperatorFees(): UseMutationResult<Hex, Error, SvClaimOperatorFeesParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getStakingVault(client, params.contractAddress);
      return svClaimOperatorFees(contract);
    },
  });
}
