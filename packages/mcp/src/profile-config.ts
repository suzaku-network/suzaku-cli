export interface ProfileConfig {
  readOnly: boolean;
}

/** Resolve the MCP surface profile. Retired write-profile flags fail closed. */
export function resolveProfileConfig(
  argv: readonly string[],
  _env: NodeJS.ProcessEnv,
): ProfileConfig {
  const retired = ['--propose-only', '--public-write'].find((flag) => argv.includes(flag));
  if (retired) {
    throw new Error(`${retired} was removed from this release; use --read-only or the normal full CLI profile.`);
  }
  return { readOnly: argv.includes('--read-only') };
}
