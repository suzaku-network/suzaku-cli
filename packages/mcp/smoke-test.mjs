// Temporary live smoke test: drives the built MCP server over stdio against Dexalot mainnet (read-only).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const DEXALOT = {
  middleware: '0x9411307279456450ABF9B5181aA7a02271f0DC34',
  balancer: '0xCFF0Fc701EF47D6217FdF9DEF903990b7AfA8AC7',
  vault: '0xc9a25F0a8436dE76e999787bd509eDBa0d2471A2',
  lstWrapper: '0xDc1c4428F3145286f262980d36C640285c0DA403',
  rewards: '0x0f388C7c6201014Ad836400e9e2ebD211BDBcB00',
};

const transport = new StdioClientTransport({
  command: 'node',
  args: [new URL('./dist/server.js', import.meta.url).pathname],
  env: { PATH: process.env.PATH, HOME: process.env.HOME },
});
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools registered: ${tools.length}`);

const results = [];
async function call(name, args, timeoutMs = 120_000) {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs });
    const text = res.content?.map(c => c.text).join('\n') ?? '';
    const isErr = res.isError === true;
    results.push({ name, ok: !isErr, ms: Date.now() - t0, preview: text.slice(0, 400) });
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, preview: `EXCEPTION: ${e.message}`.slice(0, 400) });
  }
}

await call('health_check', {});
await call('middleware_epoch_status', { middlewareAddress: DEXALOT.middleware, network: 'mainnet' }, 240_000);
await call('middleware_get_linked_addresses', { middlewareAddress: DEXALOT.middleware, network: 'mainnet' });
await call('middleware_get_all_operators', { middlewareAddress: DEXALOT.middleware, network: 'mainnet' });
await call('middleware_epoch_rewards_report', { middlewareAddress: DEXALOT.middleware, rewardsAddress: DEXALOT.rewards, startEpoch: '36', epochs: 4, network: 'mainnet' }, 240_000);
await call('vault_get_total_supply', { vaultAddress: DEXALOT.vault, network: 'mainnet' });
await call('vault_get_balance', { vaultAddress: DEXALOT.vault, account: DEXALOT.lstWrapper, network: 'mainnet' });
await call('rewards_get_epoch_rewards', { rewardsAddress: DEXALOT.rewards, epoch: '35', network: 'mainnet' });
await call('balancer_get_security_modules', { balancerAddress: DEXALOT.balancer, network: 'mainnet' });
await call('discover_network', { network: 'mainnet' }, 240_000);

// operator dashboard with first operator from the operators call
const opsResult = results.find(r => r.name === 'middleware_get_all_operators');
const opMatch = opsResult?.preview.match(/0x[0-9a-fA-F]{40}/);
if (opMatch) {
  await call('middleware_operator_dashboard', { middlewareAddress: DEXALOT.middleware, operator: opMatch[0], network: 'mainnet' }, 240_000);
}

for (const r of results) {
  console.log(`\n${r.ok ? 'OK ' : 'FAIL'} ${r.name} (${r.ms}ms)`);
  console.log(r.preview.replace(/\n/g, ' ').slice(0, 350));
}
console.log(`\n${results.filter(r => r.ok).length}/${results.length} passed`);
await client.close();
process.exit(0);
