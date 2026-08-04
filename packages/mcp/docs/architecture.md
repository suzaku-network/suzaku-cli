# Suzaku MCP + Kimi monitor architecture

*Current release view: August 2026. Deep reference: `packages/mcp/CLAUDE.md`; production runbook: `packages/mcp/deploy/openclaw/AZURE-DEPLOY.md`.*

## Runtime

```text
Telegram group / admin DM
          │
          ▼
OpenClaw 2026.7.1 gateway
  ├─ primary model: moonshot/kimi-k3
  ├─ optional, disabled-by-default Anthropic fallback
  ├─ output guard: Telegram formatting + secret/path redaction
  ├─ one isolated four-hourly heartbeat job
  └─ typed MCP connection over stdio
          │
          ▼
Suzaku MCP server --read-only (69 tools)
  └─ isolated suzaku-cli --json subprocess per tool call
          │
          ├─ Avalanche C-Chain/P-Chain RPC
          └─ optional Etherscan V2 event history
```

Production deploys one container, `suzaku-bot`. It has no signing key and cannot
register MCP write tools. Proposer and public-cache write features are not part of
this release and require separate design and review.

## Components

| Component | Responsibility |
|---|---|
| OpenClaw | Telegram sessions, model routing, cron, and MCP client transport |
| Kimi K3 | Primary conversational model through Moonshot |
| Suzaku MCP | Typed 69-tool read-only surface used by the bot |
| `suzaku-cli` | Contract/RPC implementation and structured JSON source |
| `deployment_heartbeat` | Deterministic timing, uptime, rewards, validator, and alert derivation |
| output guard | Last-mile Telegram formatting and redaction |

The normal development/operator MCP profile still exposes 125 tools: 69 reads and
56 legacy writes. Mainnet writes remain suggest-by-default and require the existing
signer controls. The retired `--propose-only` and `--public-write` flags fail closed.

## Model configurations

- `openclaw.json`: Kimi K3 primary. Anthropic is removed from the rendered config
  unless `SUZAKU_ENABLE_ANTHROPIC_FALLBACK=true` and a key is present.
- `openclaw-codex.json`: separate inactive operator-selected configuration. It is
  validated during release checks but is not production's default.

With fallback disabled, a Moonshot outage can stop replies and heartbeats until an
operator enables the fallback and restarts. This release deliberately does not add
a second outage-monitoring system.

## Security boundary

- Production starts MCP with `--read-only`; write tools do not appear in
  `tools/list`.
- The OpenClaw main agent is allowed only Suzaku MCP reads and narrow workspace
  reads; shell, process, browser, web, config, and restart tools are denied.
- The heartbeat agent can call only `deployment_heartbeat`, manage its checkpoint,
  and send the resulting message.
- CLI subprocesses receive a restricted environment. Explorer credentials are
  forwarded only to event-scan calls; model and Telegram credentials never reach
  the CLI child.
- The container uses a read-only filesystem, dropped capabilities,
  `no-new-privileges`, resource caps, and bounded logs.
- A host `DOCKER-USER` chain blocks private, loopback, link-local, carrier-grade
  NAT, documentation, multicast, and reserved IPv4 ranges from the bot bridge.
  IPv6 is disabled on that bridge.
- `.env` is created directly on the VM with mode `0600`; no development `.env` or
  signer material is copied to production.

## Persistence and scheduling

OpenClaw state, sessions, cron declarations, and the heartbeat checkpoint persist
in `suzaku-monitor-kimi-state-v1`. MCP audit records persist separately in
`suzaku-monitor-audit`.

Exactly one cron declaration runs every four hours. It calls alerts mode first; on
an epoch rollover it also calls digest mode, sends once, and advances its checkpoint
only after delivery. Registration is idempotent and the release runbook verifies
the exact single declaration before and after reboot.

## Release boundary

1. Review and sign the release commits on the PR branch.
2. Run root/MCP builds, all tests, typecheck, free Tier-1 evaluation, exact tool
   surfaces, image/config checks, and a final secret scan.
3. Run the bounded six-question Kimi acceptance once and human-review it. A second
   repetition is only for ambiguity or intermittent behavior.
4. Run one local Telegram hook smoke against the pinned image.
5. Record sanitized evidence, push, require PR CI, and merge through the normal PR.
6. Fetch and verify the exact merge SHA, rerun build/tests from that SHA, then deploy
   it through the systemd unit and execute the VM acceptance/reboot gates.

Paid tests never justify changing the frozen evaluator to make a model pass. If a
review changes executable code, prompts, model configuration, or MCP behavior,
rerun only the affected free checks and acceptance questions.

## Important paths

| Path | Purpose |
|---|---|
| `packages/mcp/src/server.ts` | MCP entry and tool registration |
| `packages/mcp/src/cli-runner.ts` | isolated CLI subprocess, env allowlist, audit, limits |
| `packages/mcp/src/test-support/tool-surfaces.ts` | explicit 69/125 surface oracle |
| `packages/mcp/src/tools/heartbeat.ts` | deterministic composite monitor |
| `packages/mcp/deploy/openclaw/openclaw.json` | active Kimi monitor template |
| `packages/mcp/deploy/openclaw/openclaw-codex.json` | inactive Codex option |
| `packages/mcp/deploy/openclaw/suzaku-monitor.service` | production startup order |
| `packages/mcp/deploy/openclaw/AZURE-DEPLOY.md` | full install, acceptance, backup, rollback |

Historical design reviews remain historical records and are not rewritten to match
this release.
