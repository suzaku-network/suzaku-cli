import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { getDefaultCollateral } from "../core/DefaultCollateral/abi";
import { depositToCollateral, withdrawFromCollateral } from "../core/DefaultCollateral/service";

export type DepositToCollateralParams = {
  contractAddress: Address;
  recipient: Address;
  amount: string;
};

export function useDepositToCollateral(): UseMutationResult<{ approveTxHash: Hex; depositTxHash: Hex }, Error, DepositToCollateralParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getDefaultCollateral(client, params.contractAddress);
      return depositToCollateral(client, contract, params.recipient, params.amount);
    },
  });
}

export type WithdrawFromCollateralParams = {
  contractAddress: Address;
  recipient: Address;
  amount: string;
};

export function useWithdrawFromCollateral(): UseMutationResult<Hex, Error, WithdrawFromCollateralParams> {
  const { client } = useAvalancheWalletExtendedClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getDefaultCollateral(client, params.contractAddress);
      return withdrawFromCollateral(client, contract, params.recipient, params.amount);
    },
  });
}
