import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerBalancerTools(_server: McpServer) {
  // Note: The weight-watcher operation is registered under middleware tools
  // since it's accessed via `middleware weight-watcher` in the CLI.
  // This file is reserved for future BalancerValidatorManager-specific tools.
}
