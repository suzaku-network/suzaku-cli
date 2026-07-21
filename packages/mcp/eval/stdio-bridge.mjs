// A direct child can observe closed stdin before the SDK finishes attaching its
// pipes. Two zero-storage tees keep both ends attached while preserving stdio.
// Positional parameters avoid interpolating executable paths into shell source.
export function bridgedStdioCommand(command, args = []) {
  return {
    command: '/bin/sh',
    args: [
      '-c',
      'tee /dev/null | "$@" | tee /dev/null',
      'suzaku-mcp-stdio-bridge',
      command,
      ...args,
    ],
  };
}
