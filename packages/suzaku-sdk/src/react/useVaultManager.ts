import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAvalancheWalletExtendedClient } from "./useAvalancheWalletExtendedClient";
import { getVaultManager } from "../core/VaultManager/abi";
import { getL1Registry } from "../core/L1Registry/abi";
import { getOperatorL1OptInService } from "../core/OperatorL1OptInService/abi";
import { getOperatorStakes, type OperatorStakesResult } from "../core/VaultManager/service";

export type GetOperatorStakesParams = {
  vaultManagerAddress?: Address;
  l1RegistryAddress?: Address;
  operatorL1OptInServiceAddress?: Address;
  operatorAddress?: Address;
};

export function useGetOperatorStakes(
  params: GetOperatorStakesParams,
): UseQueryResult<OperatorStakesResult | null> {
  const { client } = useAvalancheWalletExtendedClient();
  return useQuery({
    queryKey: [
      "getOperatorStakes",
      params.vaultManagerAddress,
      params.l1RegistryAddress,
      params.operatorL1OptInServiceAddress,
      params.operatorAddress,
    ],
    queryFn: async () => {
      if (
        !client ||
        !params.vaultManagerAddress ||
        !params.l1RegistryAddress ||
        !params.operatorL1OptInServiceAddress ||
        !params.operatorAddress
      ) return null;
      const [vaultManager, l1Registry, operatorL1OptInService] = await Promise.all([
        getVaultManager(client, params.vaultManagerAddress),
        getL1Registry(client, params.l1RegistryAddress),
        getOperatorL1OptInService(client, params.operatorL1OptInServiceAddress),
      ]);
      return getOperatorStakes(client, vaultManager, l1Registry, operatorL1OptInService, params.operatorAddress);
    },
    enabled: !!client && !!params.vaultManagerAddress && !!params.l1RegistryAddress && !!params.operatorL1OptInServiceAddress && !!params.operatorAddress,
    staleTime: 30_000,
  });
}
