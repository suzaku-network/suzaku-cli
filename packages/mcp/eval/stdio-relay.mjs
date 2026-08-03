#!/usr/bin/env node
import { spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  process.stderr.write('stdio relay: missing child command\n');
  process.exit(64);
}

const child = spawn(command, args, {
  env: process.env,
  // Pass the relay's already-open descriptors straight through. This avoids the
  // Node-to-Node pipe-attachment race that motivated the old `tee` wrapper while
  // keeping the relay as the process whose terminal status the SDK observes.
  stdio: [0, 1, 2],
});

let terminal = false;
const forwardedSignals = new Set();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (terminal || forwardedSignals.has(signal)) return;
    forwardedSignals.add(signal);
    if (child.exitCode == null && child.signalCode == null) child.kill(signal);
  });
}

child.once('error', (error) => {
  terminal = true;
  process.stderr.write(`stdio relay: ${error.message}\n`);
  process.exitCode = 127;
});

child.once('close', (code, signal) => {
  terminal = true;
  if (signal) {
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeAllListeners(name);
    setImmediate(() => process.kill(process.pid, signal));
    return;
  }
  process.exitCode = code ?? 1;
});
