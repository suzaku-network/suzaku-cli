#!/usr/bin/env node

// Suppress the runtime deprecation warning from @gelatonetwork/relay-sdk,
// which is pulled in unconditionally by @safe-global/sdk-starter-kit.
// The package uses console.warn() directly, not process.emitWarning().
// All other warnings remain unaffected.
const _originalWarn = console.warn.bind(console);
console.warn = function (...args) {
  const msg = args.join(" ");
  if (msg.includes("gelatonetwork")) {
    return;
  }
  return _originalWarn(...args);
};

import("../dist/cli.js");
