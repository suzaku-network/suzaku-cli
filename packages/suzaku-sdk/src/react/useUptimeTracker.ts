import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { hexToBytes, type Address, type Hex } from "viem";
import { useWriteContract } from "wagmi";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { getUptimeTracker } from "../core/UptimeTracker/abi";
import { UptimeTrackerABI } from "../core/UptimeTracker";
import { getL1Middleware } from "../core/L1Middleware/abi";
import { packWarpIntoAccessList } from "../core/lib/warpUtils";
import {
  getCurrentValidatorsFromNode,
  getValidationUptimeMessage,
  syncUptime,
} from "../core/UptimeTracker/service";

export type GetCurrentValidatorsFromNodeParams = {
  rpcUrl?: string;
  bypassToken?: string;
};

export function useGetCurrentValidatorsFromNode(
  params: GetCurrentValidatorsFromNodeParams,
): UseQueryResult<Awaited<ReturnType<typeof getCurrentValidatorsFromNode>> | null> {
  return useQuery({
    queryKey: ["getCurrentValidatorsFromNode", params.rpcUrl],
    queryFn: async () => {
      if (!params.rpcUrl) return null;
      return getCurrentValidatorsFromNode(params.rpcUrl, params.bypassToken);
    },
    enabled: !!params.rpcUrl,
    staleTime: 20_000,
  });
}

export type GetValidationUptimeMessageParams = {
  rpcUrl?: string;
  nodeId?: string;
  networkID?: number;
  sourceChainID?: string;
  bypassToken?: string;
};

export function useGetValidationUptimeMessage(
  params: GetValidationUptimeMessageParams,
): UseQueryResult<string | null> {
  const { client } = useAvalancheWalletExtendedClient();
  return useQuery({
    queryKey: ["getValidationUptimeMessage", params.rpcUrl, params.nodeId, params.networkID, params.sourceChainID],
    queryFn: async () => {
      if (!client || !params.rpcUrl || !params.nodeId || params.networkID == null || !params.sourceChainID) return null;
      return getValidationUptimeMessage(client, params.rpcUrl, params.nodeId, params.networkID, params.sourceChainID, params.bypassToken);
    },
    enabled: !!client && !!params.rpcUrl && !!params.nodeId && params.networkID != null && !!params.sourceChainID,
    staleTime: 20_000,
  });
}

export type ComputeValidatorUptimeParams = {
  contractAddress: Address;
  signedUptimeHex: Hex;
};

export function useComputeValidatorUptime(): UseMutationResult<Hex, Error, ComputeValidatorUptimeParams> {
  const { writeContractAsync } = useWriteContract();
  return useMutation({
    mutationFn: async (params) => {
      const warpBytes = hexToBytes(params.signedUptimeHex);
      const accessList = packWarpIntoAccessList(warpBytes);
      return writeContractAsync({
        address: params.contractAddress,
        abi: UptimeTrackerABI,
        functionName: "computeValidatorUptime",
        args: [0],
        accessList,
      });
    },
  });
}

export type SyncUptimeParams = {
  uptimeTrackerAddress: Address;
  middlewareAddress: Address;
  rpcUrl: string;
  blockchainId: string;
  bypassToken?: string;
};

export function useSyncUptime(): UseMutationResult<void, Error, SyncUptimeParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const [uptimeTrackerContract, middlewareContract] = await Promise.all([
        getUptimeTracker(client, params.uptimeTrackerAddress),
        getL1Middleware(client, params.middlewareAddress),
      ]);
      return syncUptime(
        client, uptimeTrackerContract, middlewareContract,
        params.rpcUrl, params.blockchainId, params.bypassToken,
      );
    },
  });
}
