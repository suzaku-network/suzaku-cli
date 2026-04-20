import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
  },
  format: ["cjs"],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: [
    "viem",
    "@avalabs/avalanchejs",
  ],
  banner: {
    js: `
const _originalWarn = console.warn.bind(console);
console.warn = function (...args) {
  const msg = args.join(" ");
  if (msg.includes("gelatonetwork")) return;
  return _originalWarn(...args);
};
`.trim(),
  },
})
