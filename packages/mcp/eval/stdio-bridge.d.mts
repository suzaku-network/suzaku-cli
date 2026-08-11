export interface BridgedStdioCommand {
  command: string;
  args: string[];
}

export function bridgedStdioCommand(command: string, args?: string[]): BridgedStdioCommand;
