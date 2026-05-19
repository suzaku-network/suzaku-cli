import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type {
  SendParameters,
  SendReturnType,
} from "@avalanche-sdk/client/methods/wallet";
import { useAvalancheWalletClient } from "./useAvalancheWalletClient";

/**
 * Mutation hook for cross-chain AVAX transfers (P↔C) via the wallet client's
 * `send` action. Throws when no wallet client is available.
 */
export function useCrossChainTransfer(): UseMutationResult<
  SendReturnType,
  Error,
  SendParameters
> {
  const client = useAvalancheWalletClient();

  return useMutation<SendReturnType, Error, SendParameters>({
    mutationFn: async (params) => {
      if (!client) throw new Error("Avalanche wallet client not ready");
      return client.send(params);
    },
  });
}
