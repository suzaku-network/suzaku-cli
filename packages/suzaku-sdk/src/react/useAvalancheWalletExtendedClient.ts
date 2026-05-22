import { useEffect, useState } from "react";
import { useConnection } from "wagmi";
import { type EIP1193Provider } from "@avalanche-sdk/client";
import { createAvalancheWalletExtendedClient, type ExtendedWalletClient } from "../core";

export type UseAvalancheWalletExtendedClientResult = {
  client: ExtendedWalletClient | null;
  isPending: boolean;
  error: Error | null;
};

export function useAvalancheWalletExtendedClient(): UseAvalancheWalletExtendedClientResult {
  const { chain, status } = useConnection();
  const [client, setClient] = useState<ExtendedWalletClient | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || status !== "connected" || !chain) {
      setClient(null);
      return;
    }

    const provider = (window as unknown as { avalanche?: unknown }).avalanche as EIP1193Provider;
    if (!provider) {
      setClient(null);
      return;
    }

    setIsPending(true);
    setError(null);

    createAvalancheWalletExtendedClient(chain, provider)
      .then(setClient)
      .catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsPending(false));
  }, [chain, status]);

  return { client, isPending, error };
}
