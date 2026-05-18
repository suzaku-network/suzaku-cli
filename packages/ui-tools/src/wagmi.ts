import { getSuzakuWagmiConfig } from '@suzaku-network/suzaku-sdk/react/config'

let cached: ReturnType<typeof getSuzakuWagmiConfig> | undefined

/**
 * Lazy singleton wagmi config for the ui-tools app. The SDK exposes
 * `getSuzakuWagmiConfig` directly — this thin wrapper memoizes it so
 * client navigation reuses the same instance.
 */
export function getConfig() {
  cached ??= getSuzakuWagmiConfig()
  return cached
}

declare module 'wagmi' {
  interface Register {
    config: ReturnType<typeof getConfig>
  }
}
