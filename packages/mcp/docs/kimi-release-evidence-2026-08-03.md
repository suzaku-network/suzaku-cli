# Kimi monitor release evidence — 2026-08-03

This is the sanitized release record for the Kimi K3 monitor candidate. It
contains no credentials, raw provider payloads, Telegram identifiers, or model
answers. The ignored local artifacts remain the detailed evidence and are bound
below by SHA-256.

## Candidate and free gates

- Runtime candidate: `09e7dd737754647a05456b93195fbab67609a423`
- Root and MCP builds: PASS
- MCP test suite: 480/480 PASS
- Live Tier 1 at epoch 53: 16/16 PASS
- Tier-1 result SHA-256:
  `1a1589e047ab54bfdf42b67d4278e4837c1830457f48f7c24ef744c8aecfe622`

## Paid acceptance history

The first six-question run followed the stop rule: four answers were correct,
but two answers extrapolated an uptime action from a tool that had not checked
uptime. Work stopped rather than proceeding to a second repetition. Commit
`e092bb2` made the MCP response explicitly report uptime as `not_checked` and
forbade an uptime recommendation without an uptime read. A two-question recheck
then confirmed the corrected behavior.

The final consistency run used the frozen six-question acceptance set against
candidate `09e7dd7`. All six deterministic gates passed. Manual semantic review
found all six answers correct. In particular:

- deployment and weekly answers correctly reported epoch-52 uptime as complete
  because their heartbeat read contained that result;
- the set-rewards answer said uptime was not checked and did not request a
  redundant report;
- the future-epoch answer made no claim that uptime was missing.

The final run cost $0.588109 plus a $0.077750 canary ($0.665859 total), below its
$1.50 hard ceiling. The initial run and bounded corrective recheck cost $0.577648
and $0.234365 respectively, making the full acceptance-and-fix process $1.477872.
These are release observations, not a cross-model benchmark.

| Artifact | SHA-256 |
|---|---|
| Initial six-question result | `3b9fa1bae5c5ac1ab8be6c9a9fde2be09fecd3543388abc6f19db98ab12a89a5` |
| Initial run manifest | `7fcdece1adc52018950064800ce8273ab771af5f5f6fa4899196018abcb01167` |
| Corrective two-question result | `77dabd1e6cf112d5bf75ca06fb01530666ce4cffdafed5638152d92bab3f1460` |
| Corrective run manifest | `ff95621f555d809b14a16e7b5286c49072012eaed1b7629dcc94f796a6e1af99` |
| Final six-question result | `6031cb34735f413817d134f99ccb9dfb6ef32eac6549ccb8b95baf1cfad0dc99` |
| Final run manifest | `01dcc175f3c4e1b28a45e418675f036f93a836fb9371800163ffeb21e3f7d10a` |

## Local Telegram acceptance

The pinned OpenClaw 2026.7.1 image passed the real delivery path:

- Kimi K3 called the read-only Suzaku MCP tool and returned the live operator
  count;
- the outbound guard redacted an internal path;
- Markdown bold was converted outside inline code while code contents remained
  literal;
- a shell command request was refused and no shell/process tool was exposed;
- Telegram delivery succeeded, and the local poller was stopped afterward.

Local release acceptance is complete. VM installation, runtime checks, cron,
reboot, backup/restore, and first production heartbeat remain deployment gates.
