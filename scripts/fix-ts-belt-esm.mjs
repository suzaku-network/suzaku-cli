#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const esmDir = join(__dirname, "../node_modules/@mobily/ts-belt/dist/esm");
const indexPath = join(esmDir, "index.js");

const content = readFileSync(indexPath, "utf8");

const fixed = content.replace(
  /from "(\.[^"]+)"/g,
  (match, specifier) => {
    const fullPath = join(esmDir, specifier);
    try {
      if (statSync(fullPath).isDirectory()) {
        return `from "${specifier}/index.js"`;
      }
    } catch {
      // not a directory, leave as-is
    }
    return match;
  }
);

if (fixed !== content) {
  writeFileSync(indexPath, fixed, "utf8");
  console.log("Patched @mobily/ts-belt ESM index.js");
} else {
  console.log("@mobily/ts-belt ESM already patched, nothing to do");
}
