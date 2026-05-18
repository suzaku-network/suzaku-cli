import { http, type Chain } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";
import {
  cookieStorage,
  createConfig,
  createStorage,
  type Config,
  type CreateStorageParameters,
} from "wagmi";
import { injected } from "wagmi/connectors";

export type SuzakuWagmiConfigOptions = {
  /**
   * Override the chains. Defaults to `[avalanche, avalancheFuji]`.
   */
  chains?: readonly [Chain, ...Chain[]];
  /**
   * Override the wagmi storage. Defaults to `cookieStorage` (SSR-friendly).
   */
  storage?: CreateStorageParameters["storage"];
  /**
   * Enable SSR. Defaults to `true`.
   */
  ssr?: boolean;
};

/**
 * Builds a wagmi `Config` tailored for Suzaku front-ends:
 * - Avalanche mainnet + Fuji by default
 * - Core extension targeted via the `injected` connector (`window.avalanche`)
 * - Cookie storage for SSR
 *
 * Call from a factory (e.g. inside `getConfig()`) rather than at module
 * scope so the config is not shared across SSR requests.
 */
export function getSuzakuWagmiConfig(
  options: SuzakuWagmiConfigOptions = {},
): Config {
  const chains = options.chains ?? ([avalanche, avalancheFuji] as const);

  return createConfig({
    chains,
    connectors: [
      injected({
        target() {
          if (typeof window === "undefined") return undefined;
          const provider = (window as unknown as { avalanche?: unknown })
            .avalanche;
          if (!provider) return undefined;
          return {
            id: "avalanche-core",
            name: "Core",
            provider: provider as never,
          };
        },
      }),
    ],
    storage: createStorage({
      storage: options.storage ?? cookieStorage,
    }),
    ssr: options.ssr ?? true,
    transports: Object.fromEntries(
      chains.map((chain) => [chain.id, http()]),
    ),
  });
}
