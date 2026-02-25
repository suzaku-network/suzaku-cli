import { spawn, execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdir, appendFile } from 'node:fs';
import { homedir } from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mcpServer: McpServer | null = null;

export function setMcpServer(server: McpServer) {
  mcpServer = server;
}

// ── SDK typed wrappers ──
// McpServer in SDK 1.12.0 does not expose `elicitInput` or `server.sendLoggingMessage`
// on its public type surface. These wrappers centralise the `as any` casts so tool code
// stays type-safe. When upgrading to SDK v2 these can be replaced with ctx.mcpReq methods.

interface ElicitResult {
  action: string;
  content?: Record<string, unknown>;
}

/** Elicit user input via the MCP server. Throws if the client does not support elicitation. */
export async function elicitInput(
  server: McpServer,
  params: { message: string; requestedSchema: Record<string, unknown> },
): Promise<ElicitResult> {
  return (server as unknown as { elicitInput(p: typeof params): Promise<ElicitResult> }).elicitInput(params);
}

/** Send a structured log message to connected MCP clients. */
export function sendLogMessage(
  server: McpServer,
  message: { level: string; logger: string; data: Record<string, unknown> },
): void {
  (server as unknown as { server: { sendLoggingMessage(m: typeof message): Promise<void> } })
    .server.sendLoggingMessage(message).catch(() => {});
}

/** Resolve the CLI entry point — checks SUZAKU_CLI_PATH, then relative path, then npm dependency, then PATH */
function resolveCliPath(): string {
  if (process.env.SUZAKU_CLI_PATH) {
    const p = process.env.SUZAKU_CLI_PATH;
    if (!p.startsWith('/')) {
      throw new Error(`SUZAKU_CLI_PATH must be an absolute path, got: "${p}"`);
    }
    if (!existsSync(p)) {
      throw new Error(`SUZAKU_CLI_PATH does not exist: "${p}"`);
    }
    return p;
  }

  // In-repo development: relative path from packages/mcp/dist/ to repo root bin/
  const relativePath = resolve(__dirname, '../../../bin/cli.js');
  if (existsSync(relativePath)) {
    return relativePath;
  }

  // npm dependency: resolve via node_modules when installed as a package
  try {
    const depPath = fileURLToPath(new URL('../../suzaku-cli/bin/cli.js', import.meta.url));
    if (existsSync(depPath)) {
      return depPath;
    }
  } catch {}

  // Fallback: try to find suzaku-cli on PATH
  try {
    return execFileSync('which', ['suzaku-cli'], { encoding: 'utf-8' }).trim();
  } catch {
    // Fall back to relative path (will fail with a clear error at spawn time)
    return relativePath;
  }
}

const CLI_PATH = resolveCliPath();

/** Grace period before sending SIGKILL after SIGTERM (5 seconds) */
const SIGKILL_GRACE_MS = 5_000;

/** Strip private key material (64-char hex strings) from output to prevent leakage */
export function sanitizeOutput(text: string): string {
  return text
    .replace(/0x[0-9a-fA-F]{64}/g, '0x[REDACTED]')
    .replace(/\b[0-9a-fA-F]{64}\b/g, '[REDACTED]');
}

export function sanitizeArgs(args: string[]): string[] {
  return args.map((a) => sanitizeOutput(a));
}

/** Build user-facing command string (no raw key material) */
function buildUserCommand(
  cliArgs: string[],
  childEnv: Record<string, string | undefined>,
): string {
  const userArgs = cliArgs.filter(a => a !== '--json' && a !== '--yes' && a !== '--cast');
  const parts: string[] = [];
  if (childEnv.PK) parts.push('PK=$SUZAKU_PK');
  if (childEnv.PK_PCHAIN) parts.push('PK_PCHAIN=$SUZAKU_PCHAIN_PK');
  parts.push('suzaku-cli', ...userArgs);
  return parts.join(' ');
}

export interface CliResult {
  success: boolean;
  data: unknown;
  error?: string;
}

export interface RunCliOptions {
  network?: string;
  rpcUrl?: string;
  privateKey?: boolean;
  pchainPrivateKey?: boolean;
  timeout?: number;
}

const dedupCache = new Map<string, { ts: number; result: CliResult }>();

/** Maximum number of entries in the dedup cache */
export const DEDUP_CACHE_MAX = 500;

export const WARP_TIMEOUT = 300_000;

function evictDedupCache(windowMs: number): void {
  const now = Date.now();
  for (const [key, entry] of dedupCache) {
    if (now - entry.ts >= windowMs) {
      dedupCache.delete(key);
    }
  }
  if (dedupCache.size > DEDUP_CACHE_MAX) {
    const entries = [...dedupCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const toRemove = entries.slice(0, dedupCache.size - DEDUP_CACHE_MAX);
    for (const [key] of toRemove) {
      dedupCache.delete(key);
    }
  }
}

/**
 * Spawns `suzaku-cli <args> --json --yes` as a subprocess and captures JSON output.
 * Each tool call gets a clean, isolated process — avoids logger singleton and process.exit issues.
 */
export async function runCli(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  const startTime = performance.now();
  const toolName = args.slice(0, 2).join(' ');
  const cliArgs = [...args];

  if (options.network === 'custom' && !options.rpcUrl) {
    return { success: false, data: null, error: 'network "custom" requires rpcUrl to be set' };
  }

  if (options.network) {
    cliArgs.push('--network', options.network);
  }
  if (options.rpcUrl) {
    cliArgs.push('--rpc-url', options.rpcUrl);
  }

  const dedupWindowMs = Number(process.env.SUZAKU_MCP_DEDUP_WINDOW_MS ?? 60_000);
  const isWrite = options.privateKey === true;
  const dedupKey = `${JSON.stringify(args)}|${options.network ?? ''}|${options.rpcUrl ?? ''}`;
  const cached = !isWrite ? dedupCache.get(dedupKey) : undefined;
  if (cached && Date.now() - cached.ts < dedupWindowMs) {
    const cachedResult: CliResult = {
      ...cached.result,
      data:
        cached.result.data != null && typeof cached.result.data === 'object'
          ? { _dedup_warning: 'Duplicate call — returning cached result', ...cached.result.data as Record<string, unknown> }
          : cached.result.data,
    };
    return cachedResult;
  }

  const childEnv: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: process.env.NODE_ENV,
    PASSWORD_STORE_DIR: process.env.PASSWORD_STORE_DIR, // For GPG keystore
    GNUPGHOME: process.env.GNUPGHOME,
    SIG_AGG_URL: process.env.SIG_AGG_URL,
    LogLevel: process.env.LogLevel,
    SNOWSCAN_API_KEY: process.env.SNOWSCAN_API_KEY,
  };

  let signerMethod: string | undefined;

  // Ledger wiring — check before PK/secret-name logic
  if (options.privateKey && process.env.SUZAKU_MCP_LEDGER === 'true') {
    cliArgs.push('--ledger');
    signerMethod = 'SUZAKU_MCP_LEDGER';
  } else if (options.privateKey) {
    // Pass signing credentials via environment or --secret-name (never --private-key on cmdline)
    if (process.env.SUZAKU_SECRET_NAME) {
      cliArgs.push('--secret-name', process.env.SUZAKU_SECRET_NAME);
      signerMethod = 'SUZAKU_SECRET_NAME';
    } else if (process.env.SUZAKU_PK) {
      childEnv.PK = process.env.SUZAKU_PK;
      signerMethod = 'SUZAKU_PK';
    }
  }

  // Safe multisig wiring
  if (options.privateKey && process.env.SUZAKU_SAFE_ADDRESS) {
    cliArgs.push('--safe', process.env.SUZAKU_SAFE_ADDRESS);
    signerMethod = signerMethod ? `${signerMethod}+SUZAKU_SAFE_ADDRESS` : 'SUZAKU_SAFE_ADDRESS';
  }

  // P-Chain transaction key — passed via child env PK_PCHAIN
  if (options.pchainPrivateKey && process.env.SUZAKU_PCHAIN_PK) {
    childEnv.PK_PCHAIN = process.env.SUZAKU_PCHAIN_PK;
  }

  // Dry-run mode
  if (process.env.SUZAKU_MCP_DRY_RUN === 'true') {
    cliArgs.push('--cast');
  }

  cliArgs.push('--json', '--yes');

  // Network-aware suggest / show+confirm for write operations
  if (options.privateKey) {
    const isTestnet = options.network != null && options.network !== 'mainnet';
    const suggestEnv = process.env.SUZAKU_MCP_SUGGEST;

    // Suggest mode: default for mainnet, opt-in for testnet via SUGGEST=true
    const shouldSuggest = suggestEnv === 'true' || (suggestEnv !== 'false' && !isTestnet);

    if (shouldSuggest) {
      const command = buildUserCommand(cliArgs, childEnv);
      return {
        success: true,
        data: {
          _suggest_mode: true,
          command,
          message: 'Suggest mode is active. Run this command manually:',
        },
      };
    }

    // SUGGEST=false on mainnet: show command + require confirmation before executing
    if (!isTestnet && mcpServer) {
      const command = buildUserCommand(cliArgs, childEnv);
      try {
        const result = await elicitInput(mcpServer, {
          message: `About to execute:\n\n${command}`,
          requestedSchema: {
            type: 'object' as const,
            properties: {
              approve: {
                type: 'boolean' as const,
                description: 'Approve execution of this command?',
                default: false,
              },
            },
            required: ['approve'],
          },
        });

        if (result.action !== 'accept' || !result.content?.approve) {
          return { success: false, data: null, error: 'Operation rejected by user' };
        }
      } catch {
        // Client doesn't support elicitation — block execution for safety
        return {
          success: false,
          data: null,
          error: 'Cannot execute on mainnet: MCP client does not support elicitation for confirmation. Set SUZAKU_MCP_SUGGEST=true to get the command to run manually.',
        };
      }
    }
  }

  // Increase default timeout for Ledger to accommodate physical confirmation
  const defaultTimeout = process.env.SUZAKU_MCP_LEDGER === 'true' ? 180_000 : 120_000;
  const timeout = options.timeout ?? defaultTimeout;

  const result = await new Promise<CliResult>((resolve) => {
    let exited = false;

    const child = spawn('node', [CLI_PATH, ...cliArgs], {
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (process.env.SUZAKU_MCP_DEBUG) {
        process.stderr.write(chunk);
      }
    });

    // Timeout handling with SIGKILL fallback
    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!exited) {
          child.kill('SIGKILL');
        }
      }, SIGKILL_GRACE_MS);
    }, timeout);

    child.on('close', (code) => {
      exited = true;
      clearTimeout(killTimer);

      // Try to parse JSON from stdout regardless of exit code —
      // some commands exit non-zero but still produce valid JSON with an error field
      const trimmed = stdout.trim();
      if (trimmed) {
        try {
          const data = JSON.parse(trimmed);
          if (code !== 0 && data.error) {
            resolve({ success: false, data, error: sanitizeOutput(String(data.error)) });
            return;
          }
          resolve({ success: code === 0, data, error: code !== 0 ? sanitizeOutput(stderr) || undefined : undefined });
          return;
        } catch {
          // stdout wasn't valid JSON — fall through
        }
      }

      if (code !== 0) {
        resolve({
          success: false,
          data: null,
          error: sanitizeOutput(stderr.trim() || stdout.trim() || `Process exited with code ${code}`),
        });
        return;
      }

      // Success exit code but no parseable JSON
      resolve({ success: true, data: null, error: undefined });
    });

    child.on('error', (err) => {
      exited = true;
      clearTimeout(killTimer);
      resolve({ success: false, data: null, error: err.message });
    });
  });

  if (result.success) {
    dedupCache.set(dedupKey, { ts: Date.now(), result });
    evictDedupCache(dedupWindowMs);
  }

  const durationMs = Math.round(performance.now() - startTime);
  if (mcpServer) {
    sendLogMessage(mcpServer, {
      level: result.success ? 'info' : 'error',
      logger: 'cli-runner',
      data: {
        tool: toolName,
        duration_ms: durationMs,
        success: result.success,
        ...(result.error ? { error: sanitizeOutput(result.error) } : {}),
      },
    });
  }

  // ~/.suzaku-cli/mcp-audit.log (best-effort, non-blocking)
  const auditDir = join(homedir(), '.suzaku-cli');
  const auditLog = join(auditDir, 'mcp-audit.log');
  const auditEntry = JSON.stringify({
    ts: new Date().toISOString(),
    tool: toolName,
    args: sanitizeArgs(args),
    network: options.network,
    success: result.success,
    duration_ms: durationMs,
    signerMethod,
  }) + '\n';
  mkdir(auditDir, { recursive: true }, (mkdirErr) => {
    if (mkdirErr) return;
    appendFile(auditLog, auditEntry, () => {});
  });

  return result;
}

export function formatResult(result: CliResult) {
  if (!result.success) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${sanitizeOutput(result.error ?? 'Unknown error')}` }],
      isError: true,
    };
  }
  if (result.data != null && typeof result.data === 'object' && !Array.isArray(result.data)) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
      structuredContent: result.data as Record<string, unknown>,
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
  };
}

export function formatGuardError(err: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${err}` }], isError: true as const };
}

export function requireSigner(): ReturnType<typeof formatResult> | null {
  if (
    !process.env.SUZAKU_PK?.trim() &&
    !process.env.SUZAKU_SECRET_NAME?.trim() &&
    process.env.SUZAKU_MCP_LEDGER !== 'true'
  ) {
    return {
      content: [{ type: 'text' as const, text: 'Error: No signing method configured. Set SUZAKU_PK (private key), SUZAKU_SECRET_NAME (GPG keystore), or SUZAKU_MCP_LEDGER=true (hardware wallet) environment variable.' }],
      isError: true,
    };
  }
  return null;
}
