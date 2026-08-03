# Suzaku MCP + Telegram Bots — Architecture Overview

*Runtime snapshot: 2026-07-31, branch `safe-propose`. Deep reference: `packages/mcp/CLAUDE.md`; production runbook: `packages/mcp/deploy/openclaw/AZURE-DEPLOY.md`.*

## The idea in one paragraph

Dexalot operators talk to a live Kimi session in Telegram. OpenClaw provides the gateway and the **Suzaku MCP server** provides 69 read-only tools backed by isolated `suzaku-cli` subprocesses. This release deploys only that keyless monitor. Propose/cache definitions remain dormant in the Compose file and require a separate hardening PR before activation.

## 1. Branch and release boundary

The deployment is cut from a reviewed, signed SHA on `safe-propose`; it is not built from a floating branch. Repository integration remains a separate two-step review: `safe-propose → mcp`, then the existing `mcp → main` PR. Do not bypass the first review by pushing the feature branch directly onto `mcp`, and do not confuse a successful VM deployment with a merged PR.

The keeper code in `packages/keeper/` is a separate automation stack and is not part of this monitor deployment.

## 2. Runtime topology

```
Telegram ops group (ID via TELEGRAM_GROUP_ID)       Admin DMs (allowlist by numeric user ID)
        │ @mention required                                │
        ▼                                                  ▼
┌─ Dedicated production VM ───────────────────────────────────────────────────┐
│                                                                              │
│  suzaku-bot  (read-only monitor)                                             │
│  ├─ OpenClaw 2026.7.1 (pinned tag+digest) gateway                            │
│  │   ├─ LLM primary: moonshot/kimi-k3 (MOONSHOT_API_KEY)                     │
│  │   ├─ optional fallback: anthropic/claude-sonnet-4-6                       │
│  │   ├─ cron: one 4-hourly isolated heartbeat agent; digest on rollover      │
│  │   └─ workspace: SOUL.md (persona + pinned Dexalot addresses), EPOCHS.md   │
│  │                                                                           │
│  ├─ Direct typed mcp.servers.suzaku registration (no monitor shell bridge)   │
│  └─ Suzaku MCP server --read-only (stdio subprocess)                         │
│       └─ suzaku-cli subprocess per tool call (--json --yes,                  │
│            restricted env allowlist) ──► Avalanche C-Chain / P-Chain RPC     │
│                                                                              │
│  suzaku-propose-bot  (compose profile "propose" — NOT deployed)              │
│  suzaku-cache-bot    (compose profile "cache"   — NOT deployed)              │
│                                                                              │
│  monitor hardening: read-only root · cap_drop ALL · no-new-privileges        │
│  pids 256 · mem 2g · log rotation · healthcheck · host SSRF firewall         │
└──────────────────────────────────────────────────────────────────────────────┘
```

Sessions: OpenClaw keeps one session per Telegram chat/thread; a thread's model/runtime/tool config is computed once at session start, so after any config change you send `/new` in the chat. Cron jobs run in isolated sessions.

### Runtime requirements

**Production target:** run the OpenClaw deployment on a dedicated VPS/VM, not a personal workstation. A VM is the generic machine abstraction; a VPS is the hosted VM product from providers such as Hetzner, DigitalOcean, OVH, Linode, Vultr, AWS, GCP, or Azure. The practical requirement is an always-on Linux VM dedicated to this bot stack, so a container compromise has a small blast radius and cannot reach local wallets, browsers, dev services, or personal files.

| Layer | Requirement |
|---|---|
| Host size | 2 vCPU / 4 GB RAM recommended; the monitor is capped at `cpus: 2.0`, `mem_limit: 2g`, and `pids_limit: 256` |
| OS/runtime | Linux host with Docker Engine and Docker Compose |
| Network | Outbound internet for Telegram, LLM APIs, Avalanche RPC, Safe tx service, and optional Etherscan V2; inbound firewall should allow SSH only |
| Deployment path | exact signed SHA and image identity via `deploy/openclaw/AZURE-DEPLOY.md`; systemd starts only `suzaku-bot` |
| Mandatory monitor env | `MOONSHOT_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_USER_ID`, `TELEGRAM_GROUP_ID`, `OPENCLAW_GATEWAY_TOKEN` |
| Optional monitor env | explicit `SUZAKU_ENABLE_ANTHROPIC_FALLBACK=true` plus `ANTHROPIC_API_KEY`, paid `ETHERSCAN_API_KEY`, `TELEGRAM_TOPIC_ID`; Codex is a separate inactive config |
| Host hardening | key-only SSH, Azure NSG + UFW, persistent idempotent `DOCKER-USER` chain, `.env` mode `600` |
| Persistence | Docker volumes for audit logs and OpenClaw state; file secrets for propose/cache signing keys |

**Supported runtime shapes:**

- **OpenClaw bot target (recommended):** the `bot` Docker target retains native `libusb-1.0-0` / `libudev1` libraries for explicitly selected Ledger signer workflows. Ordinary read-only startup lazy-loads no Ledger/HID code.
- **Local/dev stdio MCP:** a developer can run `node packages/mcp/dist/server.js [--read-only | --propose-only | --public-write]` from a built checkout and attach it to an MCP client. This is fine for development and one-off reads, but it is not the production bot topology.
- **Standalone distroless MCP target:** exists for plain MCP clients. Ledger/HID is lazy-loaded only when a Ledger signer is explicitly selected, so ordinary read-only startup does not depend on the native USB stack.
- **Serverless:** not a fit without redesign; OpenClaw is a long-running Telegram gateway with persisted sessions, cron state, audit logs, and stdio MCP subprocesses.

## 3. The three bots

| | `suzaku-bot` (monitor) | `suzaku-propose-bot` | `suzaku-cache-bot` |
|---|---|---|---|
| Chat surface | group @mention + admin DM | **DM-only** (`groupPolicy: deny`) | group @mention (same group as monitor by default) |
| MCP profile | `--read-only` (69 read tools) | `--propose-only` (69 + 2 propose tools) | `--public-write` (69 + `middleware_cache_stakes`) |
| Can change chain state | no | **no** — queues off-chain Safe proposals only | yes — exactly one permissionless tx type |
| Key material | **no signing key** (holds only LLM/Telegram creds + optional Etherscan explorer key) | Safe **delegate** key + Safe API key (file secrets) | fresh role-less EOA, tiny gas balance (file secret) |
| LLM | Kimi K3 → optional sonnet-4-6 fallback | sonnet-4-6 only (mcporter path only) | sonnet-4-6 only (mcporter path only) |
| Cron | one isolated four-hourly alerts/digest declaration | no | no |
| SOUL file | `SOUL.md` | `SOUL-propose.md` | `SOUL-cache.md` |
| Audit volume | `audit-data` | `audit-data-propose` | `audit-data-cache` |
| Status | production candidate for Azure | **deferred; do not start or credential** | **deferred; do not start or credential** |

The monitor defaults to Kimi via a dedicated Moonshot key and direct typed MCP. `openclaw-codex.json` preserves Codex as an inactive monitor option. The startup renderer removes Anthropic unless the explicit fallback flag and key are both present. Propose/cache retain their old source configurations for the follow-up PR; they are not validated or deployed here.

There is also a fourth artifact: a **standalone distroless MCP image target** (`--read-only`, no shell) for plain MCP clients, and a local (untracked) repo-root `.mcp.json` can attach the **full 127-tool profile** to dev sessions (mainnet writes come back as suggestions, not executions).

## 4. Security model in one screen

- **Profile = registration surface.** Excluded write tools never appear in `tools/list` (asserted by tests), so a prompt-injected model can't even attempt them.
- **Write guard chain** (full profile): require signer → deny/allow lists → per-tx value limit → optional elicitation → **network matrix: mainnet never auto-executes** (returns a suggested command instead; testnet executes).
- **Two deliberate, narrow exceptions** to "mainnet software keys are blocked" (both enforced in the `cli.ts` preAction guard):
  1. `--safe` + `--safe-propose` on `rewards set-amount|distribute` — off-chain proposal only; the CLI *refuses Safe owner keys*, so the bot key can queue but never execute. Humans sign the decoded calldata in the Safe UI.
  2. `--public-call` on `middleware calc-operator-cache` — the one real tx the cache bot may send; `runPublicCacheCli()` accepts exactly one command shape, middleware + network are pinned by env, `rpcUrl` rejected.
- **Signing secrets as compose file secrets** (`/run/secrets/…`), read at spawn time—never in `docker inspect`, `/proc/*/environ`, or rendered configs. Model/Telegram keys are container env visible to host root but never propagate to CLI subprocesses (restricted env allowlist).
- **Cache bot off-switch is deny-by-default**: compose uses `${SUZAKU_CACHE_DENY_TOOLS-middleware_cache_stakes}` (single-dash). Footgun to remember: to *enable* writes set the var to an **empty value** in `.env`; deleting the line re-blocks.
- Rate/concurrency caps; JSONL MCP audit; bounded Docker logs; `SUZAKU_MCP_PUBLIC_HEALTH`; URL blocklists plus an idempotent host firewall chain; IPv6 disabled on the bridge; OpenClaw and Moonshot provider pinned together at 2026.7.1.

## 5. Key material

| Key | Where | Can | Cannot |
|---|---|---|---|
| Monitor bot | no *signing* key; env carries Moonshot, Telegram, gateway, optional fallback, and optional `ETHERSCAN_API_KEY` | read chain; public RPC by default, paid Etherscan V2 only as optional event-scan acceleration | sign or send anything |
| Safe delegate EOA | `./secrets/delegate_pk` → `/run/secrets` | sign EIP-712 proposal payloads (needs no AVAX) | execute; owner-key use refused by CLI |
| Safe API key | `./secrets/safe_api_key` | authenticate to Safe tx service (mainnet) | move funds |
| Cache EOA | `./secrets/cache_pk` | send `calcAndCacheStakes` (value-neutral, deterministic), spend its tiny gas balance | any role-gated call; blast radius ≈ its AVAX balance |
| Rewards **Safe** (multisig) | owners' wallets, not in this system | execute proposals after owner signatures | — |

## 6. The two write flows

**Propose flow (rewards):** DM "prepare 10 450 ALOT for epoch 46" → bot pre-checks with fresh reads (epoch window `currentEpoch-2 ≤ e < currentEpoch`, no prior set-amount **accumulation** — the epoch-35/36 incident class, amount `< SUZAKU_MAX_REWARDS_AMOUNT`, no duplicate already pending in the queue) → CLI `--safe --safe-propose` builds **one atomic MultiSend batch** (`approve` + `setRewardsAmountForEpochs` — must be atomic because the contract does `transferFrom` at set time) with a pinned nonce → proposal appears in the Safe queue → owners re-verify decoded calldata and sign → Safe executes. Queue check is fail-open by design; the human signature is the hard gate.

**Cache flow (stakes):** group member asks for the epoch stake cache → tool fresh-reads `cacheByClass[class]` (skips if already cached) → CLI `middleware calc-operator-cache <mw> <epoch> <class> --public-call` sends the tx → fresh post-read confirms. Rollout ladder is mandatory: dark launch (deny-on, unfunded) → fuji staging → mainnet unfunded (must fail only on gas) → fund small, never auto-top-up, `deployment_heartbeat` alerts below `SUZAKU_CACHE_KEY_MIN_AVAX`.

## 7. Operational snapshot (2026-07-31)

| Thing | State |
|---|---|
| `suzaku-bot` container | Azure production candidate; final offline/image gates and VM acceptance still required |
| Propose / cache bot containers | not deployed yet |
| Heartbeat cron | one committed idempotent declaration; install and first-run proof are VM acceptance gates |
| Model evidence | one paid Kimi 22-question run (~$1.04) plus canary; useful operational evidence, not a conclusive cross-model benchmark |
| Codex | preserved as `openclaw-codex.json`; inactive in the production Kimi profile |
| Verification | exact final counts are recorded at release time in the deployment record, not frozen in this architecture snapshot |

MCP calls are recorded as JSONL (`duration_ms`, tool, args, network, success, signer method) and summarized by `scripts/audit-summary.mjs`. OpenClaw 2026.7.1 also reports session usage/cost (`gateway usage-cost`); Moonshot billing is authoritative. Separate production/eval keys are still required for clean attribution.

## 8. Outstanding work, in order

1. Finish local tests/image/config validation, sign and push the immutable deployment SHA, then execute `AZURE-DEPLOY.md` without VM-side patches.
2. Complete the real Kimi→MCP, Telegram output-guard, policy-denial, cron, reboot, backup/restore, and cost-observation gates.
3. Keep repository integration separate from deployment: reconcile the `safe-propose → mcp` review before the existing `mcp → main` PR; an exact deployed SHA does not mean either PR was merged.
4. Propose-bot and cache-bot go-live remain separately reviewed phases with their own keys and acceptance ladders.
5. Parked: KMS signing and the CLI `PK_PCHAIN` gap.

## 9. Where things live

| Path | What |
|---|---|
| `packages/mcp/src/server.ts` | MCP entry; profile flags `--read-only` / `--propose-only` / `--public-write` |
| `packages/mcp/src/cli-runner.ts` | subprocess engine, suggest/confirm matrix, env allowlist, audit, rate limits |
| `packages/mcp/src/guard.ts` | deny/allow, value limits, elicitation |
| `packages/mcp/src/tools/` | 14 tool files (127 tools) + `heartbeat.ts` |
| `packages/mcp/deploy/openclaw/` | pinned image, Compose, active Kimi/optional Codex configs, cron/firewall/systemd helpers, SOUL/EPOCHS, README and Azure production runbook |
| `packages/mcp/docs/` | `heartbeat-design.md`, `public-cache-writes-plan.md`, `architecture-review-2026-06.md` |
| `scripts/add-safe-delegate.mjs` | one-time delegate registration (owner action) |
| `packages/mcp/CLAUDE.md` | authoritative deep reference (safety model, env vars, invariants) |
