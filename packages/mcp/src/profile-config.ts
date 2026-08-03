import { readFileSync } from 'node:fs';

export interface ProfileConfig {
  readOnly: boolean;
  proposeOnly: boolean;
  publicWrite: boolean;
}

/** Resolve and validate mutually exclusive MCP surface profiles. Throws fail-closed. */
export function resolveProfileConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): ProfileConfig {
  const readOnly = argv.includes('--read-only');
  const proposeOnly = argv.includes('--propose-only');
  const publicWrite = argv.includes('--public-write');
  if ([readOnly, proposeOnly, publicWrite].filter(Boolean).length > 1) {
    throw new Error('--read-only, --propose-only, and --public-write are mutually exclusive');
  }

  if (proposeOnly) {
    const cap = Number(env.SUZAKU_MAX_REWARDS_AMOUNT ?? '');
    if (!Number.isFinite(cap) || cap <= 0) {
      throw new Error('--propose-only requires SUZAKU_MAX_REWARDS_AMOUNT to be set to a positive number.');
    }
  }

  if (publicWrite) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(env.SUZAKU_MIDDLEWARE_ADDRESS?.trim() ?? '')) {
      throw new Error('--public-write requires SUZAKU_MIDDLEWARE_ADDRESS to be set to the single allowed middleware address.');
    }
    const network = env.SUZAKU_MIDDLEWARE_NETWORK?.trim() || 'mainnet';
    if (!['mainnet', 'fuji', 'anvil', 'kiteaitestnet', 'kiteai'].includes(network)) {
      throw new Error('--public-write requires SUZAKU_MIDDLEWARE_NETWORK to be a supported non-custom network name.');
    }
    const signerFile = env.SUZAKU_PK_FILE?.trim();
    if (signerFile) {
      try {
        if (!readFileSync(signerFile, 'utf8').trim()) {
          throw new Error('--public-write SUZAKU_PK_FILE is empty.');
        }
      } catch (error) {
        if (error instanceof Error && error.message === '--public-write SUZAKU_PK_FILE is empty.') throw error;
        throw new Error('--public-write requires SUZAKU_PK_FILE to be readable when set.');
      }
    } else if (!env.SUZAKU_PK?.trim() && !env.SUZAKU_SECRET_NAME?.trim() && env.SUZAKU_MCP_LEDGER !== 'true') {
      throw new Error('--public-write requires a signing method: SUZAKU_PK_FILE, SUZAKU_PK, SUZAKU_SECRET_NAME, or SUZAKU_MCP_LEDGER=true.');
    }
  }

  return { readOnly, proposeOnly, publicWrite };
}

