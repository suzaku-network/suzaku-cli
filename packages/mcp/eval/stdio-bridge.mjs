// Node 22 in the evaluator environment drops early bytes on direct Node↔Node
// child pipes. Native zero-storage tees are therefore still required at the two
// SDK boundaries. The Node relay owns the real child, and Bash pipefail preserves
// its nonzero status instead of reporting the final tee's success.
const relay = new URL('./stdio-relay.mjs', import.meta.url).pathname;
const bridgeScript = [
  'forward_signal() {',
  '  trap - HUP INT TERM',
  '  kill -"$1" -- -$$ 2>/dev/null || true',
  '}',
  "trap 'forward_signal HUP' HUP",
  "trap 'forward_signal INT' INT",
  "trap 'forward_signal TERM' TERM",
  'tee /dev/null <&0 | "$@" | tee /dev/null &',
  'pipeline_pid=$!',
  'wait "$pipeline_pid"',
  'status=$?',
  'if (( status > 128 && status < 192 )); then',
  '  trap - HUP INT TERM',
  '  kill -"$((status - 128))" "$$"',
  'fi',
  'exit "$status"',
].join('\n');

export function bridgedStdioCommand(command, args = []) {
  return {
    command: '/usr/bin/setsid',
    args: [
      '/bin/bash',
      '-o', 'pipefail',
      '-c',
      bridgeScript,
      'suzaku-mcp-stdio-bridge',
      process.execPath,
      relay,
      command,
      ...args,
    ],
  };
}
