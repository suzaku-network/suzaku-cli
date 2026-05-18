import { useMemo } from "react";
import { useConnection } from "wagmi";
import {
  createAvalancheWalletClient,
  type AvalancheWalletClient,
} from "@avalanche-sdk/client";

export type UseAvalancheWalletClientResult = AvalancheWalletClient | null;

/**
 * Returns an `AvalancheWalletClient` wired to the Core extension provider
 * (`window.avalanche`). The client is recreated when the active wagmi chain
 * or connection status changes.
 */
export function useAvalancheWalletClient(): UseAvalancheWalletClientResult {
  const { chain, status } = useConnection();

  return useMemo(() => {
    if (typeof window === "undefined") return null;
    if (status !== "connected" || !chain) return null;

    const provider = (window as unknown as { avalanche?: unknown }).avalanche;
    if (!provider) return null;

    return createAvalancheWalletClient({
      chain,
      transport: { type: "custom", provider },
    });
  }, [chain, status]);
}
