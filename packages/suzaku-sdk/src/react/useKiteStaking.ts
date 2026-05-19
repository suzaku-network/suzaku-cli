import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useExtendedWalletClient } from "./useExtendedWalletClient";
import { getKiteStakingManager } from "../core/KiteStaking/abi";
import {
  ksmInitiateValidatorRegistration,
  ksmCompleteValidatorRegistration,
  ksmInitiateDelegatorRegistration,
  ksmCompleteDelegatorRegistration,
  ksmInitiateDelegatorRemoval,
  ksmCompleteDelegatorRemoval,
  ksmInitiateValidatorRemoval,
  ksmCompleteValidatorRemoval,
  ksmSubmitUptimeProof,
} from "../core/KiteStaking/service";
import type { NodeId } from "../core/lib/avalancheUtils";

type PChainOwnerOptions = { threshold?: number; addresses?: Hex[] };

export type KsmInitiateValidatorRegistrationParams = {
  contractAddress: Address;
  nodeId: NodeId;
  blsKey: Hex;
  delegationFeeBips: number;
  minStakeDuration: bigint;
  rewardRecipient: Address;
  stakeAmountWei: bigint;
  remainingBalanceOwner?: PChainOwnerOptions;
  disableOwner?: PChainOwnerOptions;
};

export function useKsmInitiateValidatorRegistration(): UseMutationResult<Hex, Error, KsmInitiateValidatorRegistrationParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmInitiateValidatorRegistration(
        client, contract, params.nodeId, params.blsKey,
        params.delegationFeeBips, params.minStakeDuration,
        params.rewardRecipient, params.stakeAmountWei,
        params.remainingBalanceOwner, params.disableOwner,
      );
    },
  });
}

export type KsmCompleteValidatorRegistrationParams = {
  contractAddress: Address;
  initiateTxHash: Hex;
  blsProofOfPossession: Hex;
  initialBalance: bigint;
  waitValidatorVisible?: boolean;
};

export function useKsmCompleteValidatorRegistration(): UseMutationResult<Hex, Error, KsmCompleteValidatorRegistrationParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmCompleteValidatorRegistration(
        client, contract, client, params.initiateTxHash,
        params.blsProofOfPossession, params.initialBalance,
        params.waitValidatorVisible,
      );
    },
  });
}

export type KsmInitiateDelegatorRegistrationParams = {
  contractAddress: Address;
  nodeId: NodeId;
  rewardRecipient: Address;
  stakeAmountWei: bigint;
};

export function useKsmInitiateDelegatorRegistration(): UseMutationResult<Hex, Error, KsmInitiateDelegatorRegistrationParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmInitiateDelegatorRegistration(
        client, contract, params.nodeId, params.rewardRecipient, params.stakeAmountWei,
      );
    },
  });
}

export type KsmCompleteDelegatorRegistrationParams = {
  contractAddress: Address;
  initiateTxHash: Hex;
  rpcUrl: string;
};

export function useKsmCompleteDelegatorRegistration(): UseMutationResult<Hex, Error, KsmCompleteDelegatorRegistrationParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmCompleteDelegatorRegistration(client, contract, client, params.initiateTxHash, params.rpcUrl);
    },
  });
}

export type KsmInitiateDelegatorRemovalParams = {
  contractAddress: Address;
  delegationID: Hex;
  includeUptimeProof: boolean;
  rpcUrl?: string;
};

export function useKsmInitiateDelegatorRemoval(): UseMutationResult<Hex, Error, KsmInitiateDelegatorRemovalParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmInitiateDelegatorRemoval(
        client, contract, params.delegationID, params.includeUptimeProof, params.rpcUrl,
      );
    },
  });
}

export type KsmCompleteDelegatorRemovalParams = {
  contractAddress: Address;
  initiateRemovalTxHash: Hex;
  delegationIDs?: Hex[];
  waitValidatorVisible?: boolean;
};

export function useKsmCompleteDelegatorRemoval(): UseMutationResult<void, Error, KsmCompleteDelegatorRemovalParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmCompleteDelegatorRemoval(
        client, contract, client, params.initiateRemovalTxHash,
        params.delegationIDs, params.waitValidatorVisible,
      );
    },
  });
}

export type KsmInitiateValidatorRemovalParams = {
  contractAddress: Address;
  nodeId: NodeId;
  includeUptimeProof?: boolean;
};

export function useKsmInitiateValidatorRemoval(): UseMutationResult<Hex, Error, KsmInitiateValidatorRemovalParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmInitiateValidatorRemoval(client, contract, params.nodeId, params.includeUptimeProof);
    },
  });
}

export type KsmCompleteValidatorRemovalParams = {
  contractAddress: Address;
  initiateRemovalTxHash: Hex;
  nodeIDs?: NodeId[];
  waitValidatorVisible?: boolean;
  initiateTxHashes?: Hex[];
};

export function useKsmCompleteValidatorRemoval(): UseMutationResult<void, Error, KsmCompleteValidatorRemovalParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmCompleteValidatorRemoval(
        client, contract, client, params.initiateRemovalTxHash,
        params.nodeIDs, params.waitValidatorVisible, params.initiateTxHashes,
      );
    },
  });
}

export type KsmSubmitUptimeProofParams = {
  contractAddress: Address;
  nodeId: NodeId;
  rpcUrl: string;
};

export function useKsmSubmitUptimeProof(): UseMutationResult<Hex, Error, KsmSubmitUptimeProofParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getKiteStakingManager(client, params.contractAddress);
      return ksmSubmitUptimeProof(client, contract, params.nodeId, params.rpcUrl);
    },
  });
}
