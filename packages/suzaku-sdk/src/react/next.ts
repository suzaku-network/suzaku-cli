import type { NextConfig } from "next"

export type WithSuzakuNextOptions = {
  /**
   * Absolute path to the monorepo root. When set, applied as
   * `outputFileTracingRoot` to silence the multi-lockfile warning and
   * stabilize production tracing. Typically:
   * `path.resolve(import.meta.dirname, '..', '..')`.
   */
  workspaceRoot?: string
}

/**
 * Wraps a Next.js config with Suzaku-friendly defaults. Currently a thin
 * passthrough — it exists so any future Suzaku-specific Next.js patches
 * (transpilePackages, headers, image domains, …) land in one place.
 *
 * ```ts
 * import path from 'node:path'
 * import { withSuzakuNext } from "@suzaku-network/suzaku-sdk/react/next"
 *
 * export default withSuzakuNext(
 *   { reactStrictMode: true },
 *   { workspaceRoot: path.resolve(import.meta.dirname, '..', '..') },
 * )
 * ```
 */
export function withSuzakuNext(
  config: NextConfig = {},
  options: WithSuzakuNextOptions = {},
): NextConfig {
  return {
    ...(options.workspaceRoot
      ? { outputFileTracingRoot: options.workspaceRoot }
      : {}),
    ...config,
  }
}
