import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(import.meta.dirname, '..', '..'),
  webpack(config, { webpack, isServer }) {
    // wagmi/connectors lazy-imports many optional connector SDKs
    // (Coinbase, MetaMask, Safe, Tempo, Porto, WalletConnect…) we don't
    // use — ignore them so webpack doesn't fail to resolve.
    const optionalConnectorDeps = [
      'accounts',
      '@base-org/account',
      '@coinbase/wallet-sdk',
      '@metamask/connect-evm',
      '@safe-global/safe-apps-provider',
      '@safe-global/safe-apps-sdk',
      '@walletconnect/ethereum-provider',
    ]
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: new RegExp(
          `^(?:${optionalConnectorDeps.map((m) => m.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')}|porto(?:/.*)?)$`,
        ),
      }),
    )

    // The Avalanche SDK's accounts barrel imports `node:crypto` for an
    // optional webcrypto polyfill — stub it in browser bundles.
    // publicKeyToXPAddress doesn't actually call randomBytes.
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:(.+)$/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '')
        }),
      )
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        crypto: false,
      }
    }
    return config
  },
}

export default nextConfig
