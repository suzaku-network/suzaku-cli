import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useExtendedWalletClient } from "./useExtendedWalletClient";
import { getPoASecurityModule } from "../core/PoASecurityModule/abi";
import { initiateValidatorRemoval } from "../core/PoASecurityModule/service";
import type { NodeId } from "../core/lib/avalancheUtils";

export type InitiateValidatorRemovalParams = {
  contractAddress: Address;
  nodeId: NodeId;
};

export function useInitiateValidatorRemoval(): UseMutationResult<Hex, Error, InitiateValidatorRemovalParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getPoASecurityModule(client, params.contractAddress);
      return initiateValidatorRemoval(client, contract, params.nodeId);
    },
  });
}
