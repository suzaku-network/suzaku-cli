import { writeSync } from 'node:fs';

if (process.argv.includes('--emit-json')) {
  writeSync(1, JSON.stringify({ ok: true, pid: process.pid }));
}
if (process.argv.includes('--ignore-term')) {
  process.on('SIGTERM', () => {});
}
setInterval(() => {}, 60_000);
