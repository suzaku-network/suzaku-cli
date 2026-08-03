import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cliSource = readFileSync(resolve(repoRoot, 'src/cli.ts'), 'utf8');
const parserSource = readFileSync(resolve(repoRoot, 'src/lib/cliParser.ts'), 'utf8');
const profileConfigSource = readFileSync(resolve(repoRoot, 'packages/mcp/src/profile-config.ts'), 'utf8');

describe('CLI --public-call guard shape', () => {
  it('does not authorize public-call from raw argv string matching', () => {
    expect(cliSource).not.toContain("process.argv.includes('--public-call')");
    expect(parserSource).not.toContain("process.argv.includes('--public-call')");
  });

  it('defines --public-call only on middleware calc-operator-cache', () => {
    const calcOperatorStart = cliSource.indexOf('.command("calc-operator-cache")');
    const calcNodeStart = cliSource.indexOf('.command("calc-node-stakes")');
    expect(calcOperatorStart).toBeGreaterThan(0);
    expect(calcNodeStart).toBeGreaterThan(calcOperatorStart);

    const calcOperatorBlock = cliSource.slice(calcOperatorStart, calcNodeStart);
    const calcNodeBlock = cliSource.slice(calcNodeStart, cliSource.indexOf('.command("force-update-nodes")', calcNodeStart));
    expect(calcOperatorBlock).toContain('--public-call');
    expect(calcNodeBlock).not.toContain('--public-call');
  });

  it('mainnet raw-key relaxation is scoped to the resolved leaf command', () => {
    expect(cliSource).toContain('const actionParent = actionCommand.parent;');
    expect(cliSource).toContain("actionParent?.name() === 'middleware'");
    expect(cliSource).toContain("actionCommand.name() === 'calc-operator-cache'");
    expect(cliSource).toContain('actionOpts.publicCall === true');
  });
});

describe('MCP --public-write startup guard shape', () => {
  it('does not allow custom networks because the cache tool rejects rpcUrl', () => {
    expect(profileConfigSource).toContain("['mainnet', 'fuji', 'anvil', 'kiteaitestnet', 'kiteai'].includes(network)");
    expect(profileConfigSource).toContain('supported non-custom network name');
  });
});
