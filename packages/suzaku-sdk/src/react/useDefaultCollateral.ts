import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useExtendedWalletClient } from "./useExtendedWalletClient";
import { getDefaultCollateral } from "../core/DefaultCollateral/abi";
import { depositToCollateral } from "../core/DefaultCollateral/service";

export type DepositToCollateralParams = {
  contractAddress: Address;
  recipient: Address;
  amount: string;
};

export function useDepositToCollateral(): UseMutationResult<{ approveTxHash: Hex; depositTxHash: Hex }, Error, DepositToCollateralParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const contract = await getDefaultCollateral(client, params.contractAddress);
      return depositToCollateral(client, contract, params.recipient, params.amount);
    },
  });
}
