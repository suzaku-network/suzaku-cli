// Write-path smoke test: drives the MCP server against an anvil mainnet fork (network: anvil).
// Deterministic prereq:
//   anvil --fork-url https://api.avax.network/ext/bc/C/rpc --fork-block-number 87581656 --chain-id 31337
// The script rejects an unpinned/wrong-height fork before sending any transactions.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const DEXALOT = {
  middleware: '0x9411307279456450ABF9B5181aA7a02271f0DC34',
  balancer: '0xCFF0Fc701EF47D6217FdF9DEF903990b7AfA8AC7',
  vault: '0xc9a25F0a8436dE76e999787bd509eDBa0d2471A2',
  rewards: '0x0f388C7c6201014Ad836400e9e2ebD211BDBcB00',
};
const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // anvil dev key #0 — fork testing only
const FORK_BLOCK = 87581656;
const ANVIL_RPC = 'http://127.0.0.1:8545';

try {
  const response = await fetch(ANVIL_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  });
  const payload = await response.json();
  const block = Number(BigInt(payload.result));
  if (block !== FORK_BLOCK) throw new Error(`expected fork block ${FORK_BLOCK}, got ${block}`);
} catch (error) {
  console.error(`Anvil preflight failed: ${error.message}`);
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'node',
  args: [new URL('./dist/server.js', import.meta.url).pathname],
  env: { PATH: process.env.PATH, HOME: process.env.HOME, SUZAKU_PK: TEST_PK },
});
const client = new Client({ name: 'write-smoke', version: '0.0.0' });
await client.connect(transport);

const results = [];
// expectError: a revert is the PASS condition for this call (validates the structured error path)
async function call(name, args, { timeoutMs = 180_000, expectError } = {}) {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
    const text = res.content?.map(c => c.text).join('\n') ?? '';
    const errored = res.isError === true;
    const expectedMatched = expectError ? errored && expectError.match.test(text) : !errored;
    results.push({ name, ok: expectedMatched, expectError, ms: Date.now() - t0, preview: text.slice(0, 400) });
  } catch (e) {
    results.push({ name, ok: false, expectError, ms: Date.now() - t0, preview: `EXCEPTION: ${e.message}`.slice(0, 400) });
  }
}

await call('health_check', {});
await call('operator_registry_register', { metadataUrl: 'https://smoke-test.suzaku.network', network: 'anvil' });
await call('opt_in_l1', { l1Address: DEXALOT.balancer, network: 'anvil' });
await call('opt_in_vault', { vaultAddress: DEXALOT.vault, network: 'anvil' });
await call('vault_get_balance', { vaultAddress: DEXALOT.vault, account: TEST_ACCOUNT, network: 'anvil' });
// The Dexalot vault has a depositor whitelist; the anvil dev key is not on it in forked
// mainnet state, so Vault__NotWhitelistedDepositor is the expected (structured) revert.
await call('vault_deposit', { vaultAddress: DEXALOT.vault, amount: '100', network: 'anvil' },
  { expectError: { label: 'NotWhitelistedDepositor (depositor whitelist)', match: /NotWhitelistedDepositor/ } });
await call('vault_get_balance', { vaultAddress: DEXALOT.vault, account: TEST_ACCOUNT, network: 'anvil' });
// Expected to revert (caller lacks the distributor role) — validates the structured error path
await call('rewards_distribute', { rewardsAddress: DEXALOT.rewards, epoch: '37', batchSize: '10', network: 'anvil' },
  { expectError: { label: 'AccessControlUnauthorized (no distributor role)', match: /AccessControlUnauthorized/ } });

for (const r of results) {
  const tag = r.ok ? (r.expectError ? 'OK (expected revert)' : 'OK ') : 'FAIL';
  console.log(`\n${tag} ${r.name} (${r.ms}ms)${r.expectError ? ` — expects: ${r.expectError.label}` : ''}`);
  console.log(r.preview.replace(/\n/g, ' ').slice(0, 380));
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} behaved as expected`);
await client.close();
process.exit(failed.length === 0 ? 0 : 1);
