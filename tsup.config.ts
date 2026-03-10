import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['cjs', 'esm'],
  dts: true, // Generate .d.ts types
  splitting: false,
  sourcemap: true,
  clean: true,
});
