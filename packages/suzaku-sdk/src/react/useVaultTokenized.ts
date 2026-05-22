import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { getVaultTokenized } from "../core/VaultTokenized/abi";
import { getL1Middleware } from "../core/L1Middleware/abi";
import {
  getVaultInfo,
  deposit,
  setDepositLimit,
  increaseCollateralLimit,
  vaultWithdraw,
  claimBatch,
  type VaultInfo,
} from "../core/VaultTokenized/service";

export type GetVaultInfoParams = {
  contractAddress?: Address;
  middlewareAddress?: Address;
};

export function useGetVaultInfo(params: GetVaultInfoParams): UseQueryResult<VaultInfo | null> {
  const { client } = useAvalancheWalletExtendedClient();
  return useQuery({
    queryKey: ["getVaultInfo", params.contractAddress, params.middlewareAddress],
    queryFn: async () => {
      if (!client || !params.contractAddress) return null;
      const vault = await getVaultTokenized(client, params.contractAddress);
      const middleware = params.middlewareAddress
        ? await getL1Middleware(client, params.middlewareAddress)
        : undefined;
      return getVaultInfo(client, vault, middleware);
    },
    enabled: !!client && !!params.contractAddress,
    staleTime: 30_000,
  });
}

export type DepositParams = {
  contractAddress: Address;
  onBehalfOf: Address;
  amount: string;
};

export function useDeposit(): UseMutationResult<{ approveTxHash: Hex; depositTxHash: Hex }, Error, DepositParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const vault = await getVaultTokenized(client, params.contractAddress);
      return deposit(client, vault, params.onBehalfOf, params.amount);
    },
  });
}

export type SetDepositLimitParams = {
  contractAddress: Address;
  limit: string;
};

export function useSetDepositLimit(): UseMutationResult<Hex, Error, SetDepositLimitParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const vault = await getVaultTokenized(client, params.contractAddress);
      return setDepositLimit(client, vault, params.limit);
    },
  });
}

export type IncreaseCollateralLimitParams = {
  contractAddress: Address;
  limit: string;
};

export function useIncreaseCollateralLimit(): UseMutationResult<Hex, Error, IncreaseCollateralLimitParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const vault = await getVaultTokenized(client, params.contractAddress);
      return increaseCollateralLimit(client, vault, params.limit);
    },
  });
}

export type VaultWithdrawParams = {
  contractAddress: Address;
  claimer: Address;
  amount: string;
};

export function useVaultWithdraw(): UseMutationResult<Hex, Error, VaultWithdrawParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const vault = await getVaultTokenized(client, params.contractAddress);
      return vaultWithdraw(client, vault, params.claimer, params.amount);
    },
  });
}

export type ClaimBatchParams = {
  contractAddress: Address;
  recipient: Address;
  epochs: bigint[];
};

export function useClaimBatch(): UseMutationResult<Hex, Error, ClaimBatchParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const vault = await getVaultTokenized(client, params.contractAddress);
      return claimBatch(client, vault, params.recipient, params.epochs);
    },
  });
}
