import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { getL1Middleware } from "../core/L1Middleware/abi";
import { getPoASecurityModule } from "../core/PoASecurityModule/abi";
import { getBalancerValidatorManager } from "../core/BalancerValidatorManager/abi";
import {
  completeValidatorRegistration,
  completeValidatorRemoval,
  completeWeightUpdate,
} from "../core/securityModule/service.js";
import type { NodeId } from "../core/lib/avalancheUtils.js";

type SecurityModuleType = "l1Middleware" | "poaSecurityModule";

export type CompleteValidatorRegistrationParams = {
  securityModuleAddress: Address;
  securityModuleType: SecurityModuleType;
  balancerAddress: Address;
  blsProofOfPossession: string;
  addNodeTxHash: Hex;
  initialBalance: bigint;
  waitValidatorVisible?: boolean;
};

export function useCompleteValidatorRegistration(): UseMutationResult<void, Error, CompleteValidatorRegistrationParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const securityModule =
        params.securityModuleType === "l1Middleware"
          ? await getL1Middleware(client, params.securityModuleAddress)
          : await getPoASecurityModule(client, params.securityModuleAddress);
      const balancer = await getBalancerValidatorManager(client, params.balancerAddress);
      return completeValidatorRegistration(
        client, securityModule as Parameters<typeof completeValidatorRegistration>[1],
        balancer, client,
        params.blsProofOfPossession, params.addNodeTxHash,
        params.initialBalance, params.waitValidatorVisible ?? true,
      );
    },
  });
}

export type CompleteValidatorRemovalParams = {
  securityModuleAddress: Address;
  securityModuleType: SecurityModuleType;
  balancerAddress: Address;
  initializeEndValidationTxHash: Hex;
  waitValidatorVisible?: boolean;
  nodeIDs?: NodeId[];
};

export function useCompleteValidatorRemoval(): UseMutationResult<{ nodes: string[]; txHash: `0x${string}` }, Error, CompleteValidatorRemovalParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const securityModule =
        params.securityModuleType === "l1Middleware"
          ? await getL1Middleware(client, params.securityModuleAddress)
          : await getPoASecurityModule(client, params.securityModuleAddress);
      const balancer = await getBalancerValidatorManager(client, params.balancerAddress);
      return completeValidatorRemoval(
        client, securityModule as Parameters<typeof completeValidatorRemoval>[1],
        balancer, client,
        params.initializeEndValidationTxHash,
        params.waitValidatorVisible ?? true,
        params.nodeIDs,
      );
    },
  });
}

export type CompleteWeightUpdateParams = {
  securityModuleAddress: Address;
  securityModuleType: SecurityModuleType;
  validatorWeightUpdateTxHash: Hex;
  nodeIDs?: NodeId[];
};

export function useCompleteWeightUpdate(): UseMutationResult<void, Error, CompleteWeightUpdateParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const securityModule =
        params.securityModuleType === "l1Middleware"
          ? await getL1Middleware(client, params.securityModuleAddress)
          : await getPoASecurityModule(client, params.securityModuleAddress);
      return completeWeightUpdate(
        client, securityModule as Parameters<typeof completeWeightUpdate>[1],
        client, params.validatorWeightUpdateTxHash, params.nodeIDs,
      );
    },
  });
}
