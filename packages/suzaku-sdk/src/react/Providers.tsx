"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider, type Config, type State } from "wagmi";

export type SuzakuProvidersProps = {
  config: Config;
  initialState?: State;
  children: ReactNode;
  /**
   * Optional shared QueryClient. Defaults to a fresh client per provider.
   */
  queryClient?: QueryClient;
};

/**
 * SSR-friendly provider stack: WagmiProvider + react-query QueryClientProvider.
 *
 * The QueryClient is created lazily inside `useState` so it survives Fast
 * Refresh and isn't shared across server requests.
 */
export function SuzakuProviders({
  config,
  initialState,
  children,
  queryClient,
}: SuzakuProvidersProps) {
  const [client] = useState(() => queryClient ?? new QueryClient());

  return (
    <WagmiProvider config={config} initialState={initialState} reconnectOnMount>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
