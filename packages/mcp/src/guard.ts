import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { elicitInput } from './cli-runner.js';

let guardServer: McpServer | null = null;

export function setGuardServer(server: McpServer) {
  guardServer = server;
}

/**
 * Check if a tool is allowed by the allow/deny list.
 * Returns an error string if blocked, null if allowed.
 */
export function checkToolAccess(toolName: string): string | null {
  const allow = process.env.SUZAKU_MCP_ALLOW_TOOLS;
  const deny = process.env.SUZAKU_MCP_DENY_TOOLS;

  if (deny) {
    const denyList = deny.split(',').map(s => s.trim()).filter(Boolean);
    if (denyList.includes(toolName)) {
      return `Tool "${toolName}" is blocked by SUZAKU_MCP_DENY_TOOLS`;
    }
  }

  if (allow) {
    const allowList = allow.split(',').map(s => s.trim()).filter(Boolean);
    if (allowList.length > 0 && !allowList.includes(toolName)) {
      return `Tool "${toolName}" is not in SUZAKU_MCP_ALLOW_TOOLS allowlist`;
    }
  }

  return null;
}

/** Strict decimal: digits with optional single decimal point, no trailing text */
const STRICT_DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Check if a transaction value exceeds the configured limit.
 * Returns an error string if exceeded or unparseable, null if within limits.
 * Fails closed: rejects scientific notation, trailing text, and other non-decimal formats.
 */
export function checkValueLimit(amount: string | undefined): string | null {
  const maxAvax = process.env.SUZAKU_MCP_MAX_AVAX_PER_TX;
  if (!maxAvax || !amount) return null;

  if (!STRICT_DECIMAL.test(maxAvax) || !STRICT_DECIMAL.test(amount)) {
    return `Unparseable amount or limit — amount: "${amount}", limit: "${maxAvax}". Both must be decimal numbers (e.g. "10" or "1.5").`;
  }

  const limit = Number(maxAvax);
  const value = Number(amount);

  if (value > limit) {
    return `Transaction value ${amount} AVAX exceeds SUZAKU_MCP_MAX_AVAX_PER_TX limit of ${maxAvax} AVAX`;
  }

  return null;
}

/**
 * Request human confirmation via MCP elicitation for write operations.
 * Returns null if approved or elicitation not required, error string if rejected.
 */
export async function confirmWriteOperation(
  toolName: string,
  params: Record<string, unknown>,
): Promise<string | null> {
  const requireConfirm = process.env.SUZAKU_MCP_REQUIRE_CONFIRM;
  const network = (params.network as string) ?? 'mainnet';
  const isMainnet = network === 'mainnet';

  // cli-runner.ts handles all mainnet write interaction (suggest or show+confirm)
  if (isMainnet) return null;

  // Suggest mode forced for all networks — cli-runner handles interaction
  if (process.env.SUZAKU_MCP_SUGGEST === 'true') return null;

  // Testnet: existing REQUIRE_CONFIRM behavior
  if (requireConfirm !== 'true') return null;

  if (!guardServer) {
    return 'Write confirmation required (SUZAKU_MCP_REQUIRE_CONFIRM=true) but MCP server not initialized. Cannot elicit confirmation.';
  }

  const description: Record<string, string> = {
    tool: toolName,
    network,
  };

  for (const [key, value] of Object.entries(params)) {
    if (key !== 'network' && key !== 'rpcUrl' && value !== undefined) {
      description[key] = String(value);
    }
  }

  try {
    const result = await elicitInput(guardServer, {
      message: `Confirm write operation: ${toolName}`,
      requestedSchema: {
        type: 'object' as const,
        properties: {
          approve: {
            type: 'boolean' as const,
            description: `Approve execution of ${toolName} on ${network}?\n\n${JSON.stringify(description, null, 2)}`,
            default: false,
          },
        },
        required: ['approve'],
      },
    });

    if (result.action !== 'accept' || !result.content?.approve) {
      return `Operation ${toolName} was rejected by user`;
    }

    return null;
  } catch {
    // Elicitation not supported — fail closed when confirmation is required
    return `Write confirmation required (SUZAKU_MCP_REQUIRE_CONFIRM=true) but MCP client does not support elicitation. Cannot confirm ${toolName}.`;
  }
}

/**
 * Run all guard checks for a write tool. Returns an error string if any check fails, null if all pass.
 */
export async function guardWriteOperation(
  toolName: string,
  params: Record<string, unknown>,
  amountField?: string,
): Promise<string | null> {
  const accessErr = checkToolAccess(toolName);
  if (accessErr) return accessErr;

  const amount = amountField ? (params[amountField] as string | undefined) : undefined;
  if (amountField && !(amountField in params)) {
    process.stderr.write(`[suzaku-mcp] warning: amountField "${amountField}" not found in params for ${toolName}\n`);
  }
  const limitErr = checkValueLimit(amount);
  if (limitErr) return limitErr;

  const confirmErr = await confirmWriteOperation(toolName, params);
  if (confirmErr) return confirmErr;

  return null;
}
