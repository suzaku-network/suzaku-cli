import { defineConfig } from "tsup"

const shared = {
  format: ["esm", "cjs"] as const,
  dts: true,
  splitting: true,
  sourcemap: true,
  target: "es2022" as const,
  external: [
    "viem",
    "@avalabs/avalanchejs",
    "react",
    "wagmi",
    "@tanstack/react-query",
  ],
}

export default defineConfig([
  {
    ...shared,
    entry: {
      core: "src/core/index.ts",
      node: "src/node/index.ts",
      "react-config": "src/react/config-entry.ts",
    },
    clean: true,
  },
  {
    ...shared,
    entry: { react: "src/react/index.ts" },
    // React entry exposes hooks/providers — mark the bundle as a
    // React Server Component client boundary so Next.js consumers
    // can import it from server components. The server-safe
    // `react/config` entry stays banner-less.
    banner: { js: '"use client";' },
    clean: false,
  },
])
