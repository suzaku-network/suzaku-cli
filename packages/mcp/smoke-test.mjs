// Live read-only smoke: built MCP stdio surface + representative Dexalot mainnet reads.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EXPECTED_PROFILE_TOOL_NAMES } from './dist/test-support/tool-surfaces.js';
import { bridgedStdioCommand } from './eval/stdio-bridge.mjs';

const execFileP = promisify(execFile);

const DEXALOT = {
  middleware: '0x9411307279456450ABF9B5181aA7a02271f0DC34',
  balancer: '0xCFF0Fc701EF47D6217FdF9DEF903990b7AfA8AC7',
  vault: '0xc9a25F0a8436dE76e999787bd509eDBa0d2471A2',
  lstWrapper: '0xDc1c4428F3145286f262980d36C640285c0DA403',
  rewards: '0x0f388C7c6201014Ad836400e9e2ebD211BDBcB00',
};

const launch = bridgedStdioCommand(process.execPath, [
  new URL('./dist/server.js', import.meta.url).pathname,
  '--read-only',
]);
const transport = new StdioClientTransport({
  ...launch,
  env: { PATH: process.env.PATH, HOME: process.env.HOME },
});
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools registered: ${tools.length}`);

const results = [];
function parsePayload(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function atPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}
function firstNumber(value, paths) {
  for (const path of paths) {
    const number = Number(atPath(value, path));
    if (Number.isFinite(number)) return number;
  }
  return null;
}
function addressCount(value) {
  return JSON.stringify(value).match(/0x[0-9a-fA-F]{40}/g)?.length ?? 0;
}

async function call(name, args, timeoutMs = 120_000, validate = (data) => data != null) {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
    const text = res.content?.map(c => c.text).join('\n') ?? '';
    const isErr = res.isError === true;
    const data = parsePayload(text);
    let semanticError = null;
    if (!isErr) {
      try {
        if (!validate(data)) semanticError = 'payload failed semantic assertion';
      } catch (error) {
        semanticError = error.message;
      }
    }
    results.push({ name, ok: !isErr && semanticError == null, ms: Date.now() - t0, data, semanticError, preview: text.slice(0, 400) });
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, semanticError: e.message, preview: `EXCEPTION: ${e.message}`.slice(0, 400) });
  }
}

const actualNames = tools.map((tool) => tool.name).sort();
const expectedNames = EXPECTED_PROFILE_TOOL_NAMES.readOnly;
const missing = expectedNames.filter((name) => !actualNames.includes(name));
const extra = actualNames.filter((name) => !expectedNames.includes(name));
const surfaceOk = missing.length === 0 && extra.length === 0;
if (!surfaceOk) console.error(`tool surface mismatch — missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`);

await call('health_check', {}, 120_000,
  (data) => data?.server === 'ok' && data?.cli === 'ok' && data?.readOnly === true);
await call('middleware_get_current_epoch', { middlewareAddress: DEXALOT.middleware, network: 'mainnet' }, 120_000,
  (data) => firstNumber(data, ['currentEpoch.current', 'currentEpoch', 'epoch']) != null);
await call('middleware_epoch_status', { middlewareAddress: DEXALOT.middleware, network: 'mainnet' }, 240_000,
  (data) => firstNumber(data, ['epoch.current', 'currentEpoch.current', 'currentEpoch', 'epoch']) != null);
await call('middleware_get_linked_addresses', { middlewareAddress: DEXALOT.middleware, network: 'mainnet' }, 120_000,
  (data) => addressCount(data) >= 2);
await call('middleware_get_all_operators', { middlewareAddress: DEXALOT.middleware, network: 'mainnet' }, 120_000,
  (data) => Array.isArray(data?.operators ?? data?.allOperators) && (data.operators ?? data.allOperators).length > 0);
await call('middleware_epoch_rewards_report', { middlewareAddress: DEXALOT.middleware, rewardsAddress: DEXALOT.rewards, startEpoch: '36', epochs: 4, network: 'mainnet' }, 240_000);
await call('vault_get_total_supply', { vaultAddress: DEXALOT.vault, network: 'mainnet' });
await call('vault_get_balance', { vaultAddress: DEXALOT.vault, account: DEXALOT.lstWrapper, network: 'mainnet' });
await call('rewards_get_epoch_rewards', { rewardsAddress: DEXALOT.rewards, epoch: '35', network: 'mainnet' });
await call('balancer_get_security_modules', { balancerAddress: DEXALOT.balancer, network: 'mainnet' });
await call('discover_network', { network: 'mainnet' }, 240_000);

// operator dashboard with first operator from the operators call
const opsResult = results.find(r => r.name === 'middleware_get_all_operators');
const opMatch = JSON.stringify(opsResult?.data).match(/0x[0-9a-fA-F]{40}/);
if (opMatch) {
  await call('middleware_operator_dashboard', { middlewareAddress: DEXALOT.middleware, operator: opMatch[0], network: 'mainnet' }, 240_000);
}

// One stable direct-CLI parity check proves the MCP child is using the same freshly
// built root CLI and has not drifted behind it.
try {
  const { stdout } = await execFileP(process.execPath, [
    new URL('../../bin/cli.js', import.meta.url).pathname,
    'middleware', 'get-current-epoch', DEXALOT.middleware,
    '--network', 'mainnet', '--json', '--yes',
  ], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  const direct = JSON.parse(stdout);
  const mcpEpoch = firstNumber(results.find((result) => result.name === 'middleware_get_current_epoch')?.data,
    ['currentEpoch.current', 'currentEpoch', 'epoch']);
  const cliEpoch = firstNumber(direct, ['currentEpoch.current', 'currentEpoch', 'epoch']);
  const ok = mcpEpoch != null && cliEpoch != null && mcpEpoch === cliEpoch;
  results.push({
    name: 'direct-cli-epoch-parity',
    ok,
    ms: 0,
    semanticError: ok ? null : `mcp=${mcpEpoch} cli=${cliEpoch}`,
    preview: `MCP epoch ${mcpEpoch}; direct CLI epoch ${cliEpoch}`,
  });
} catch (error) {
  results.push({ name: 'direct-cli-epoch-parity', ok: false, ms: 0, semanticError: error.message, preview: error.message });
}

for (const r of results) {
  console.log(`\n${r.ok ? 'OK ' : 'FAIL'} ${r.name} (${r.ms}ms)`);
  console.log(r.preview.replace(/\n/g, ' ').slice(0, 350));
  if (r.semanticError) console.log(`assertion: ${r.semanticError}`);
}
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed; tool surface ${surfaceOk ? 'exact' : 'MISMATCH'}`);
await client.close();
process.exit(surfaceOk && failed.length === 0 ? 0 : 1);
