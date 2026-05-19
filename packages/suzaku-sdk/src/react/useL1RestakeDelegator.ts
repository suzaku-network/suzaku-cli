import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useExtendedWalletClient } from "./useExtendedWalletClient";
import { getVaultTokenized } from "../core/VaultTokenized/abi";
import { setL1Limit } from "../core/L1RestakeDelegator/service";

export type SetL1LimitParams = {
  vaultAddress: Address;
  l1Address: Address;
  collateralClass: bigint;
  limit: string;
};

export function useSetL1Limit(): UseMutationResult<Hex, Error, SetL1LimitParams> {
  const client = useExtendedWalletClient();
  return useMutation({
    mutationFn: async (params) => {
      if (!client) throw new Error("Wallet client not ready");
      const vault = await getVaultTokenized(client, params.vaultAddress);
      return setL1Limit(client, vault, params.l1Address, params.collateralClass, params.limit);
    },
  });
}
