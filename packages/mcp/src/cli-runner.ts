import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Module-level MCP server reference for protocol logging */
let mcpServer: McpServer | null = null;

/** Set the MCP server instance for protocol logging */
export function setMcpServer(server: McpServer) {
  mcpServer = server;
}

/** Resolve the CLI entry point — checks SUZAKU_CLI_PATH, then relative path, then npm dependency, then PATH */
function resolveCliPath(): string {
  if (process.env.SUZAKU_CLI_PATH) {
    return process.env.SUZAKU_CLI_PATH;
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
function sanitizeOutput(text: string): string {
  return text.replace(/0x[0-9a-fA-F]{64}/g, '0x[REDACTED]');
}

/** Sanitize an args array by redacting private key material in each element */
function sanitizeArgs(args: string[]): string[] {
  return args.map((a) => sanitizeOutput(a));
}

/** Build user-facing command string (no raw key material) */
function buildUserCommand(
  cliArgs: string[],
  childEnv: Record<string, string | undefined>,
): string {
  const userArgs = cliArgs.filter(a => a !== '--json' && a !== '--yes');
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

/** Deduplication cache: key -> { ts, result } */
const dedupCache = new Map<string, { ts: number; result: CliResult }>();

/**
 * Spawns `suzaku-cli <args> --json --yes` as a subprocess and captures JSON output.
 * Each tool call gets a clean, isolated process — avoids logger singleton and process.exit issues.
 */
export async function runCli(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  const startTime = performance.now();
  const cliArgs = [...args];

  if (options.network) {
    cliArgs.push('--network', options.network);
  }
  if (options.rpcUrl) {
    cliArgs.push('--rpc-url', options.rpcUrl);
  }

  // Deduplication: return cached result if same call was made within the window
  const dedupWindowMs = Number(process.env.SUZAKU_MCP_DEDUP_WINDOW_MS ?? 60_000);
  const dedupKey = `${args.slice(0, 2).join(' ')}|${JSON.stringify(args)}|${options.network ?? ''}`;
  const cached = dedupCache.get(dedupKey);
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

  // Build restricted child environment — only pass what the CLI needs (Fix 5)
  const childEnv: Record<string, string | undefined> = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: process.env.NODE_ENV,
    PASSWORD_STORE_DIR: process.env.PASSWORD_STORE_DIR, // For GPG keystore
    GNUPGHOME: process.env.GNUPGHOME,
    SIG_AGG_URL: process.env.SIG_AGG_URL,
    LogLevel: process.env.LogLevel,
    SUZAKU_MCP_DEBUG: process.env.SUZAKU_MCP_DEBUG,
    SNOWSCAN_API_KEY: process.env.SNOWSCAN_API_KEY,
  };

  // Determine signing method
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
        const result = await (mcpServer as any).elicitInput({
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

  const result = await new Promise<CliResult>((resolvePromise) => {
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
            resolvePromise({ success: false, data, error: sanitizeOutput(String(data.error)) });
            return;
          }
          resolvePromise({ success: code === 0, data, error: code !== 0 ? sanitizeOutput(stderr) || undefined : undefined });
          return;
        } catch {
          // stdout wasn't valid JSON — fall through
        }
      }

      if (code !== 0) {
        resolvePromise({
          success: false,
          data: null,
          error: sanitizeOutput(stderr.trim() || stdout.trim() || `Process exited with code ${code}`),
        });
        return;
      }

      // Success exit code but no parseable JSON
      resolvePromise({ success: true, data: null, error: undefined });
    });

    child.on('error', (err) => {
      exited = true;
      clearTimeout(killTimer);
      resolvePromise({ success: false, data: null, error: err.message });
    });
  });

  // Cache result for deduplication
  dedupCache.set(dedupKey, { ts: Date.now(), result });

  // Send structured log to MCP clients
  const durationMs = Math.round(performance.now() - startTime);
  if (mcpServer) {
    mcpServer.server.sendLoggingMessage({
      level: result.success ? 'info' : 'error',
      logger: 'cli-runner',
      data: {
        tool: args.slice(0, 2).join(' '),
        duration_ms: durationMs,
        success: result.success,
        ...(result.error ? { error: sanitizeOutput(result.error) } : {}),
      },
    }).catch(() => {}); // Don't let logging errors affect tool execution
  }

  // Audit logging — non-blocking append to ~/.suzaku-cli/mcp-audit.log
  const auditDir = path.join(os.homedir(), '.suzaku-cli');
  const auditLog = path.join(auditDir, 'mcp-audit.log');
  const auditEntry = JSON.stringify({
    ts: new Date().toISOString(),
    tool: args.slice(0, 2).join(' '),
    args: sanitizeArgs(args),
    network: options.network,
    success: result.success,
    duration_ms: durationMs,
    signerMethod,
  }) + '\n';
  fs.mkdir(auditDir, { recursive: true }, (mkdirErr) => {
    if (mkdirErr) return;
    fs.appendFile(auditLog, auditEntry, () => {}); // Ignore errors — audit is best-effort
  });

  return result;
}

/** Format a CliResult into an MCP tool response */
export function formatResult(result: CliResult) {
  if (!result.success) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${sanitizeOutput(result.error ?? 'Unknown error')}` }],
      isError: true,
    };
  }
  // Include structuredContent for machine-parseable responses when data is an object
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

/** Require a valid signing method, returning an error response if none is configured */
export function requireSigner(): ReturnType<typeof formatResult> | null {
  if (
    !process.env.SUZAKU_PK &&
    !process.env.SUZAKU_SECRET_NAME &&
    process.env.SUZAKU_MCP_LEDGER !== 'true'
  ) {
    return {
      content: [{ type: 'text' as const, text: 'Error: No signing method configured. Set SUZAKU_PK (private key), SUZAKU_SECRET_NAME (GPG keystore), or SUZAKU_MCP_LEDGER=true (hardware wallet) environment variable.' }],
      isError: true,
    };
  }
  return null;
}
