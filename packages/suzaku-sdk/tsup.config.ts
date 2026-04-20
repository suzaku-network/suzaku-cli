import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    core: "src/core/index.ts",
    node: "src/node/index.ts",
    react: "src/react/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: [
    "viem",
    "@avalabs/avalanchejs",
    "react",
    "wagmi",
    "@tanstack/react-query",
  ],
})
