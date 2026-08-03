# Suzaku Telegram Bot via OpenClaw

The production deployment is one read-only Suzaku monitor powered by [OpenClaw](https://github.com/openclaw/openclaw), Kimi K3 through Moonshot, and the typed Suzaku MCP server. Codex remains as a separate inactive option. Propose/cache definitions remain in the repository but are **not part of this release**: do not start those profiles or install their credentials until their separate hardening PR lands.

## Quick Start (Local Testing)

### 1. Create a Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`, follow the prompts (e.g., "Suzaku Monitor")
3. Save the bot token
4. **Disable privacy mode** (required for group use): `/setprivacy` → select the bot → **Disable**. With privacy mode on, `@mentions` in groups are never delivered to the bot. If the bot is already in a group when you change this, remove and re-add it — Telegram applies the change only on re-join. (OpenClaw still routes only mentions to the model via `requireMention`.)
5. Get your user ID: message [@userinfobot](https://t.me/userinfobot) and note the `Id` field. For a group's chat ID, add [@getidsbot](https://t.me/getidsbot) to the group briefly (supergroup IDs look like `-100…`)
6. For group deployments, lock membership to admin approval. Telegram's default lets members add new people; that is acceptable for the read-only monitor only if you accept that access boundary. It is mandatory for the cache bot because the group is the human gate for a real signing key.

### 2. Create `.env`

```bash
cd packages/mcp/deploy/openclaw

install -m 0600 env.example .env
# Edit at minimum: MOONSHOT_API_KEY, TELEGRAM_BOT_TOKEN,
# TELEGRAM_ADMIN_USER_ID, TELEGRAM_GROUP_ID, OPENCLAW_GATEWAY_TOKEN.
```

Generate `OPENCLAW_GATEWAY_TOKEN` with `openssl rand -hex 24`. Production keeps `SUZAKU_ENABLE_ANTHROPIC_FALLBACK=false` and does not install an Anthropic key. With fallback disabled, a Moonshot outage can stop replies and heartbeats until an operator explicitly enables fallback and restarts.

### 3. Build and run

```bash
docker compose build suzaku-bot
docker compose up -d --no-build --wait --wait-timeout 120 suzaku-bot
docker compose ps
docker compose logs -f --tail 100 suzaku-bot
```

### 4. Test it

DM the bot from your Telegram account, or @-mention it in your group. Only your user ID can DM; in the group, anyone can interact by mentioning the bot. Send `/new` after a model/config change so the Telegram thread receives the new session configuration.

### 5. Stop

```bash
docker compose down
```

## VM deployment (production)

Use the tracked [AZURE-DEPLOY.md](./AZURE-DEPLOY.md) runbook. It covers a dedicated non-root service account, Docker's official apt repository, exact Git/image identity, secret permissions, persistent systemd startup, the idempotent `DOCKER-USER` SSRF backstop, backup/restore, rollback, cron registration, cost checks, and Telegram acceptance tests. Do not deploy from the abbreviated local quick start.

The production path starts only `suzaku-bot`. Plain `docker compose up` must select only that service. Propose/cache are deferred security domains, not optional production switches for this release.

## Active model and optional Codex profile

The default template, `openclaw.json`, runs **`moonshot/kimi-k3`** through OpenClaw's official Moonshot provider. The startup renderer removes Anthropic from the active config unless `SUZAKU_ENABLE_ANTHROPIC_FALLBACK=true` and a non-empty `ANTHROPIC_API_KEY` are both present. The provider plugin and OpenClaw host are pinned to 2026.7.1.

Codex was not deleted. It is preserved in `openclaw-codex.json` as an explicit alternative, but Compose never selects it by default. To test that option later, stop the monitor, set `SUZAKU_MONITOR_CONFIG=./openclaw-codex.json` in `.env`, start it again, authenticate interactively with `docker compose exec suzaku-bot node openclaw.mjs models auth login --provider openai`, then send `/new` in Telegram. Restore `SUZAKU_MONITOR_CONFIG=./openclaw.json` to return to Kimi. Do not run both profiles against the same Telegram token simultaneously.

### Kimi cost and accounting

Moonshot's Kimi K3 catalog price used by OpenClaw and the evaluator is **$3 per million input tokens, $15 per million output tokens, and $0.30 per million cache-read tokens** (cache writes currently $0). Check the [Moonshot provider documentation](https://docs.openclaw.ai/providers/moonshot) and provider dashboard before changing the model because prices can change.

The retained paid evaluation gives a concrete upper-context reference: one 22-question Kimi repetition cost about **$1.04**, plus about **$0.02** for its canary. Individual evaluation turns had a median around **$0.030**, a mean around **$0.047**, and a measured range of roughly **$0.011–$0.117**. Production prompts will not have identical context, so these are planning observations, not a quote.

The production scheduler uses one Kimi turn every four hours (about 180/month), rather than the old two-job design (about 360/month), and the heartbeat agent sees only one MCP schema. Until a week of production data exists, budget conservatively using the full-tool evaluation mean: about **$8.50/month for scheduled turns**, plus interactive use (100 comparable turns would be about $4.70 at the observed mean). The restricted heartbeat context should be cheaper, but that saving is intentionally not claimed before measurement. Anthropic and Codex cost zero while inactive.

The VM already exists, so VM procurement/pricing is outside this runbook. Telegram, Docker Engine, OpenClaw, and the public Avalanche RPC add no direct software fee. Explorer acceleration is optional and separately billed; leave `ETHERSCAN_API_KEY` empty unless public-RPC history scans prove insufficient.

Inspect actual usage with `/usage cost` or `/usage full` in an authorized chat, and on the VM with:

```bash
docker compose exec suzaku-bot node openclaw.mjs gateway usage-cost --days 7 --json
```

OpenClaw reports returned provider usage; the Moonshot billing dashboard remains authoritative. OpenClaw's concurrency limits contain bursts but are **not a dollar spending cap**. Start with limited/prepaid provider credit or provider-side alerts, review daily for the first week, and rotate/disable the key if cost departs from expectation.

## Architecture

```
docker-compose.yml
  ├── suzaku-bot (read-only group bot)
  │     ├── OpenClaw 2026.7.1 + official Moonshot provider
  │     │     └── Kimi K3 → typed mcp.servers.suzaku registration
  │     │           └── Suzaku MCP server --read-only (stdio subprocess)
  │     │                 └── restricted CLI subprocess (per tool call)
  │     ├── public main agent: MCP reads + workspace read; no shell/writes
  │     ├── isolated heartbeat agent: deployment_heartbeat + checkpoint/message only
  │     └── Security layers:
  │           read-only root filesystem; writable state/audit volumes and /tmp tmpfs
  │           cap_drop: ALL, no-new-privileges
  │           pids_limit: 256, mem_limit: 2g, log rotation, healthcheck
  │           restart: unless-stopped; host SSRF firewall
  └── dormant source-only profiles: propose/cache (not deployed or credentialed)
```

The default MCP server runs in `--read-only` mode (no write tools registered). Kimi calls it directly through OpenClaw; the monitor does not receive a shell or an mcporter bridge. CLI subprocesses inherit only a restricted environment allowlist—model and Telegram credentials do not propagate to them.

## Configuration Reference

### `openclaw.json`

| Field | Value | Purpose |
|---|---|---|
| `agents.defaults.model.primary` | `moonshot/kimi-k3` | Active production model via `MOONSHOT_API_KEY` |
| `agents.defaults.model.fallbacks` | removed by default renderer | Added only when the explicit fallback flag and Anthropic key are both present |
| `plugins.entries.moonshot` | enabled | Official provider plugin, pinned with the OpenClaw host |
| `mcp.servers.suzaku` | `--read-only` | Direct typed MCP registration; no shell bridge |
| `agents.list[main].tools` | MCP reads + workspace read | Public turns cannot execute shell/process or write files |
| `agents.list[heartbeat].tools` | heartbeat + read/write/message | Isolated scheduler can update only its checkpoint and send output |
| `channels.telegram.dmPolicy` | `allowlist` | Only allowlisted users can DM the bot |
| `channels.telegram.allowFrom` | `["tg:<user_id>"]` | Telegram user IDs allowed to DM |
| `channels.telegram.contextVisibility` | `allowlist` | Quoted/thread context from non-allowlisted senders never reaches the model (prompt-injection surface reduction; requires OpenClaw ≥ 2026.4.5) |
| `cron.enabled` | `true` | Built-in scheduler — enables registering epoch-alert jobs (see below) |

### Access control

**DMs**: Only user IDs in the `allowFrom` array can DM the bot. To add more authorized users:

```json
"allowFrom": ["tg:123456789", "tg:987654321"]
```

**Groups**: The bot responds to @-mentions in the group specified by `TELEGRAM_GROUP_ID`. Anyone in that group can ask — access is controlled by who you invite to the group. Never use `"*"` as the group ID; that would expose the bot to every group it's added to. For the cache bot, group membership must be admin-controlled because group membership is the caller gate.

Slash commands and directives (including `/model` and `/new`) are restricted to
`TELEGRAM_ADMIN_USER_ID`. Group members can ask normal @mentioned monitoring
questions but cannot change the session model, restart the gateway, or mutate
configuration. OpenClaw 2026.7.1 does not yet support the newer explicit
`modelPolicy.allow` setting, so administrator discipline—not a nonexistent config
key—governs manual model overrides; the committed default and fallback remain Kimi
K3 and Sonnet 4.6.

### Container hardening

| Setting | Purpose |
|---|---|
| `cap_drop: ALL` | No Linux capabilities |
| `no-new-privileges` | Prevents privilege escalation |
| `pids_limit: 256` | Prevents fork bombs (100 starved the node processes mid-turn — "Transport closed"; threads count against the limit) |
| `mem_limit: 2g` | Prevents OOM from affecting host |
| `restart: unless-stopped` | Auto-restart on crash; stays down on manual `docker compose down` |

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MOONSHOT_API_KEY` | Yes | Kimi K3 API key for the active monitor |
| `SUZAKU_ENABLE_ANTHROPIC_FALLBACK` | No | Defaults to `false`; explicit operator switch for the separately billed fallback |
| `ANTHROPIC_API_KEY` | Only with fallback | Do not install while fallback is disabled |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `TELEGRAM_ADMIN_USER_ID` | Yes | Your Telegram user ID for DM allowlist |
| `TELEGRAM_GROUP_ID` | Yes | Telegram group ID (e.g. `-100123456789`) — the one group the bot responds in |
| `TELEGRAM_TOPIC_ID` | No | Forum topic for scheduled posts; empty means General |
| `OPENCLAW_GATEWAY_TOKEN` | Yes | Internal gateway credential; generate randomly |
| `ETHERSCAN_API_KEY` | No | Paid Etherscan V2 acceleration for Avalanche event scans; leave empty for public RPC. Lite is currently $49/month minimum |
| `SNOWSCAN_API_KEY` | No | Deprecated compatibility alias; do not set alongside `ETHERSCAN_API_KEY` |
| `SUZAKU_MONITOR_CONFIG` | No | Defaults to `./openclaw.json` (Kimi); Codex is explicit opt-in |
| `SUZAKU_BOT_IMAGE` | No | Immutable/local image tag selected by Compose |

### Using a different network

Users can specify `network: "fuji"` in their queries — the MCP tools accept a network parameter. The default is mainnet.

## Propose Bot (Safe rewards proposals)

> **Deferred:** this profile is retained as source/history only and is not approved
> for the Kimi monitor release. Do not start it or install its credentials. Its
> model integration, mcporter boundary, and permissions move to a follow-up PR.

A second, **DM-only** bot from the same image that turns "prepare 10450 ALOT as rewards for epoch 46" into a **Safe proposal** — an off-chain entry in the Safe transaction queue that owners review (decoded calldata) and sign in the Safe UI. The bot holds a Safe **delegate** key: it can propose, it can never sign or execute. The public group bot above is unchanged and stays keyless.

```
suzaku-propose-bot (compose profile "propose")
  ├── MCP server: --propose-only  → 69 read tools + exactly 2 write tools:
  │     rewards_set_amount_propose   (one MultiSend batch: approve + setRewardsAmountForEpochs)
  │     rewards_distribute_propose
  ├── CLI: a software key is permitted on mainnet ONLY with --safe AND --safe-propose
  │   (a flag valid only on rewards set-amount/distribute, which hard-refuse OWNER keys)
  ├── set-amount pre-checks: epoch has no rewards set (accumulation guard), epoch in
  │   settable window (currentEpoch-2 ≤ epoch < currentEpoch), amount below
  │   SUZAKU_MAX_REWARDS_AMOUNT, no matching pending proposal
  └── distribute pre-checks: epochRewards > 0, distribution not already complete
      (early return, not error), no matching pending distributeRewards proposal
```

### Additional environment variables (propose bot)

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_PROPOSE_BOT_TOKEN` | Yes | Separate bot token — never reuse the group bot's |
| `SUZAKU_SAFE_ADDRESS` | Yes | The rewards Safe |
| `SUZAKU_REWARDS_ADDRESS` | Yes | RewardsNativeToken address (removes wrong-address risk) |
| `SUZAKU_MIDDLEWARE_ADDRESS` | Yes | L1Middleware address (epoch-window pre-check) |
| `SUZAKU_MAX_REWARDS_AMOUNT` | Yes | Upper bound (human units) — proposals at or above are refused |
| `SUZAKU_DELEGATE_PK_FILE` | optional | Host path to the delegate-key secret file (default `./secrets/delegate_pk`) |
| `SUZAKU_SAFE_API_KEY_FILE` | optional | Host path to the Safe API key secret file (default `./secrets/safe_api_key`). Distinct from the container-internal `SAFE_API_KEY_FILE` — do not set that one on the host |

Append the required ones to the same `.env` you created in the Quick Start (the propose bot reuses `ANTHROPIC_API_KEY`, `TELEGRAM_ADMIN_USER_ID`, and `OPENCLAW_GATEWAY_TOKEN` from there):

```bash
cat >> .env <<'EOF'
TELEGRAM_PROPOSE_BOT_TOKEN=987654:XYZ-...
SUZAKU_SAFE_ADDRESS=0x<rewards-safe>
SUZAKU_REWARDS_ADDRESS=0x<rewards-contract>
SUZAKU_MIDDLEWARE_ADDRESS=0x<l1-middleware>
SUZAKU_MAX_REWARDS_AMOUNT=10500
EOF
```

**Secrets are delivered as files, not env vars.** The delegate EOA key and the Safe tx-service API key are compose **file secrets** mounted at `/run/secrets/delegate_pk` and `/run/secrets/safe_api_key`; the MCP runner reads them at spawn time via `SUZAKU_PK_FILE` / `SAFE_API_KEY_FILE` and injects them only into each CLI subprocess. They never appear in `docker inspect`, `/proc/PID/environ`, the compose env block, or the rendered `mcporter.json` (which carries only the static `/run/secrets/...` paths). The rendered `mcporter.json` is `chmod 600`.

> Note on standalone compose: a file secret is a read-only bind-mount of a host file (mode 0444 by default) — plaintext on host disk, **not** tmpfs/encrypted (that is Swarm-only). The gain over env vars is removing the `docker inspect`/`environ`/child-inherit leaks. Keep the host files `chmod 600`, never commit them, and rely on host-disk encryption + VPS isolation for at-rest protection. The genuine "key never in container" upgrade is KMS signing (see CLAUDE.md → Future).

### One-time setup (in order)

1. **Generate the delegate key** (a fresh EOA; it needs **no AVAX** — it only signs EIP-712 Safe-proposal payloads off-chain and never sends an on-chain transaction): `cast wallet new` prints a key and its address — keep the **address**, you need it as `DELEGATE_ADDRESS` in step 3 (for an existing key: `cast wallet address 0x<delegate-key>`). Write the key to the secret file: `mkdir -p ./secrets && printf '%s' 0x<delegate-key> > ./secrets/delegate_pk && chmod 600 ./secrets/delegate_pk`. On mainnet also `printf '%s' <safe-api-key> > ./secrets/safe_api_key && chmod 600 ./secrets/safe_api_key` (get the key at developer.safe.global). Never commit `./secrets/`.
2. **Grant the Safe the rewards role and fund it** (owner action): the Safe must hold `REWARDS_MANAGER_ROLE` on the rewards contract (`suzaku-cli access-control ...` or the protocol admin does it) and a sufficient ALOT balance — the proposed batch pulls tokens from the Safe when executed. Verify: `cast call <rewards> "hasRole(bytes32,address)(bool)" $(cast keccak "REWARDS_MANAGER_ROLE") <safe>`.
3. **Register the delegate** (owner action, from the repo root; needs `node_modules` — run `pnpm install` first on a fresh clone). `DELEGATE_ADDRESS` is the address derived in step 1:
   ```bash
   NETWORK=fuji SAFE_ADDRESS=0x... DELEGATE_ADDRESS=0x... OWNER_PK=0x... \
     node scripts/add-safe-delegate.mjs
   # verify:
   curl "https://wallet-transaction-fuji.ash.center/api/v1/safes/<safe>/delegates/"
   ```
   On mainnet add `SAFE_API_KEY=...` and verify against `https://api.safe.global/tx-service/avax/api`.
4. **Start the bot**: `docker compose --profile propose up -d --build`. Note this also starts (or restarts) `suzaku-bot` — the read-only service has no compose profile, so it matches every `up`. If the group bot is already live and you only want the propose bot: `docker compose --profile propose up -d --build suzaku-propose-bot`.

Roll out **fuji first**: the fuji Safe tx service is Ash-hosted (`wallet-transaction-fuji.ash.center`) — confirm the delegates endpoint responds (step 3's curl) before relying on it. Note `--safe` does not work on anvil (the CLI blocks Safe on non-fuji testnets), so fuji is the only testnet path.

### Access control and trust model

- DM allowlist only, `groupPolicy: deny` — the bot never responds in groups. Allowlist entries MUST be numeric Telegram user IDs (`tg:123456789`), never `@usernames` (usernames can be released and re-registered).
- The DM allowlist only gates **who can draft proposals**. The real backstop is the Safe: nothing executes without owner signatures on the decoded transaction.
- The bot's pre-checks are point-in-time and advisory. Signers must re-run `rewards_epoch_diagnosis` and read the decoded calldata in the Safe UI before signing — the propose tools say this in every response (`verifyBeforeSigning`).

### Incident response

Bad or stale proposal in the queue (wrong amount, wrong epoch, duplicate):

1. **Do not sign it.** An unsigned proposal is inert.
2. Delete it — in the Safe UI (transaction queue → discard), or via the tx service with the delegate key (`DELETE /v2/multisig-transactions/{safeTxHash}/`, signed by the proposer).
3. Re-run `rewards_epoch_diagnosis`, then re-propose.

If the delegate key is compromised: remove the delegate (`scripts/add-safe-delegate.mjs` flow in reverse via the Safe UI / `DELETE /v2/delegates/`), rotate the key in `./secrets/delegate_pk` and restart the container, then re-register. A compromised delegate can only spam the queue (or pollute a nonce) — owners should treat unexpected proposals as hostile and delete them.

## Cache Bot (public stake-cache writes)

> **Deferred:** this profile is retained as source/history only and is not approved
> for the Kimi monitor release. Do not start it or install its credentials. Its
> model integration, mcporter boundary, and permissions move to a follow-up PR.

A third, **group** bot from the same image that can execute exactly one write tool: `middleware_cache_stakes`. It is separate from the read-only monitor. It holds a fresh, role-less EOA funded with a deliberately small amount of C-Chain AVAX, and the MCP profile exposes all reads plus only the public cache tool.

```
suzaku-cache-bot (compose profile "cache")
  ├── MCP server: --public-write → 69 read tools + exactly 1 write tool:
  │     middleware_cache_stakes
  ├── Tool behavior: pinned middleware/network only, no rpcUrl, fresh cache-status
  │   pre-read, skip if cacheByClass[class] is already true, execute one
  │   calcAndCacheStakes tx, fresh post-read
  └── CLI: software key is permitted on mainnet ONLY for resolved command
      middleware calc-operator-cache with the per-command --public-call flag
```

### Additional environment variables (cache bot)

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_CACHE_BOT_TOKEN` | Yes | Separate bot token — never reuse the read-only or propose bot token |
| `TELEGRAM_GROUP_ID` | Yes | Group the cache bot responds in. By default this is the same group as the monitor bot, so every monitor-group member can request the cache write |
| `SUZAKU_MIDDLEWARE_ADDRESS` | Yes | The only middleware address the cache tool may touch |
| `SUZAKU_MIDDLEWARE_NETWORK` | No | Network pin for the cache tool (default `mainnet`; set `fuji` for staging) |
| `SUZAKU_CACHE_PK_FILE` | optional | Host path to the cache-key secret file (default `./secrets/cache_pk`) |
| `SUZAKU_CACHE_KEY_ADDRESS` | Yes before funding | Public address of the cache key, used by `deployment_heartbeat` balance alerts |
| `SUZAKU_CACHE_KEY_MIN_AVAX` | No | Low-balance alert threshold (default `0.05`) |
| `SUZAKU_CACHE_DENY_TOOLS` | No | Emergency off-switch. Default is `middleware_cache_stakes`, which disables execution. To enable, set the line to an empty value (`SUZAKU_CACHE_DENY_TOOLS=`) — **do not delete the line.** Compose uses single-dash `${SUZAKU_CACHE_DENY_TOOLS-middleware_cache_stakes}`, so an *unset* variable re-applies the deny default and the tool stays blocked |

Append the required ones to `.env`:

```bash
cat >> .env <<'EOF'
TELEGRAM_CACHE_BOT_TOKEN=555555:ABC-...
SUZAKU_MIDDLEWARE_ADDRESS=0x<l1-middleware>
SUZAKU_MIDDLEWARE_NETWORK=mainnet
SUZAKU_CACHE_KEY_ADDRESS=0x<cache-key-address>
SUZAKU_CACHE_KEY_MIN_AVAX=0.05
SUZAKU_CACHE_DENY_TOOLS=middleware_cache_stakes
EOF
```

### Mandatory rollout sequence

1. **Prepare the group gate.** Use a private Telegram group, admin-only invites, `requireMention`, and a dedicated cache-bot token. Anyone in the group can request the cache call, so membership is the identity boundary.
2. **Create a fresh role-less EOA.** It must not hold protocol roles, Safe ownership, token balances, or reusable operational authority. Write the key to `./secrets/cache_pk` with `chmod 600`, and set `SUZAKU_CACHE_KEY_ADDRESS` to its public address.
3. **Start dark with no funds and the off-switch engaged.** `SUZAKU_CACHE_DENY_TOOLS=middleware_cache_stakes docker compose --profile cache up -d --build suzaku-cache-bot`. Confirm the bot starts, sees the tool profile, refuses execution due to the denylist, logs audit entries, and still respects group mention behavior.
4. **Stage on fuji.** Set `SUZAKU_MIDDLEWARE_NETWORK=fuji` and a fuji middleware address, fund the key with test AVAX, set `SUZAKU_CACHE_DENY_TOOLS=` (empty value — keep the line; deleting it re-applies the deny default), and verify one real cache call plus the refreshed `cacheByClass[class]` post-read.
5. **Enable mainnet unfunded.** Switch back to mainnet, keep the key at zero AVAX, set `SUZAKU_CACHE_DENY_TOOLS=` (empty value — do not delete the line), and confirm the request reaches signing/broadcast failure only because the key has no gas.
6. **Fund small and monitor.** Fund with a deliberately small C-Chain AVAX balance above `SUZAKU_CACHE_KEY_MIN_AVAX` so the alert has headroom. Never auto-top up. Add `cacheKeyAddress=<cache-key>` or `SUZAKU_CACHE_KEY_ADDRESS` to `deployment_heartbeat`; it emits `cache_key_balance_low` below `SUZAKU_CACHE_KEY_MIN_AVAX`.

### Incident response

- To stop execution immediately, set `SUZAKU_CACHE_DENY_TOOLS=middleware_cache_stakes` and restart `suzaku-cache-bot`.
- If the cache key is compromised, drain or abandon it, rotate `./secrets/cache_pk`, update `SUZAKU_CACHE_KEY_ADDRESS`, restart the bot, and fund the new key only after a dark launch.
- Do not treat cache-tool reverts as success. `CannotCacheFutureEpoch`, stale/missing class data, gas failure, or other errors mean the bot should report the error and stop; manual triage decides the next action.

## Upgrading OpenClaw

The Dockerfile pins the OpenClaw image by version tag **and** multi-architecture digest (`2026.7.1`) and pins `@openclaw/moonshot-provider` to the matching release. Never use `:latest` and never bump only one side of that pair.

Upgrade procedure:

1. Read the release notes between the pinned and the target version (`github.com/openclaw/openclaw/releases`).
2. Bump the host tag+digest and the Moonshot plugin version together. Build and validate locally; do not discover compatibility on the production VM.
3. Run `docker compose exec suzaku-bot node openclaw.mjs config validate` and `docker compose exec suzaku-bot node openclaw.mjs doctor`.
4. Repeat the full Telegram acceptance gate in `AZURE-DEPLOY.md`, including a real output-guard transformation and a direct MCP answer.
5. Register the declaration again and verify `cron list`; then review 24-hour usage before considering the upgrade complete.

## Scheduled Epoch Alerts (cron)

`cron.enabled: true` turns on OpenClaw's built-in scheduler. Jobs persist in the `openclaw-state` volume across container rebuilds. The committed registration script uses a declaration key, so it is safe to repeat after an image/config upgrade and updates the same job rather than creating duplicates.

The production design deliberately registers **one** four-hourly Kimi turn, not separate alert and digest turns. It always calls deterministic alert mode; only after detecting a new epoch does that same turn call digest mode. The isolated `heartbeat` agent sees only `deployment_heartbeat`, its workspace checkpoint, and Telegram send. The public chat agent cannot write that checkpoint.

```bash
docker compose exec suzaku-bot register-heartbeat-cron.sh
docker compose exec suzaku-bot node openclaw.mjs cron list
```

The script pins the middleware, rewards, wrapper, **and UptimeTracker** addresses from `SOUL.md`; omitting the UptimeTracker would make uptime status incomplete. Set `TELEGRAM_TOPIC_ID` in `.env` before starting the container when scheduled messages belong in a forum topic. Never hand-edit OpenClaw's `devices/paired.json` to make registration work: authorize the CLI from an already-approved OpenClaw device, then rerun the script. If supported approval is not available, stop and report the pairing error.

**Forum groups (topics):** a Telegram message sent with only the chat id lands in **General**. Find the topic id from a message link (`t.me/c/<chat>/<topicId>/<msgId>`) and set `TELEGRAM_TOPIC_ID=<topicId>`; the registration script then requires `messageThreadId` on every scheduled send.

**Use `--no-deliver`, and have the agent send the message itself** (as the prompts above do). The default delivery mode is announce, which fallback-forwards the agent's final text **and any job-failure notice** to a chat — that double-posts every digest (content + a "Posted digest…" meta line) and spams the group with "⚠️ Cron job failed" on transient errors. With `--no-deliver` the only group message is the one the agent deliberately sends; check job health with `cron list` (Last column) or `cron runs <id>` instead.

Alerts stay quiet unless a deterministic check trips (stake cache late, funding deadline at risk, set-amount accumulation, validator P-Chain balance low, and similar checks). The digest posts once per 3.5-day epoch. Inspect `cron list` and recent `cron runs` after deployment and after every upgrade; scheduler success is an acceptance gate, not an assumption.

## Example Queries

Once the bot is running, try these in a DM:

- "What operators are registered on mainnet?"
- "Show me the health status of operator 0x1234... on middleware 0xabcd..."
- "What's the current epoch status?"
- "Show me the stake matrix"
- "What are the vault balances for 0x5678...?"

## Troubleshooting

| Issue | Fix |
|---|---|
| Bot doesn't respond to DM | Check `docker compose logs` — verify Telegram token is valid |
| Bot silent in a group (no inbound in logs) | Two usual causes: (1) the group's chat ID isn't `TELEGRAM_GROUP_ID` in `.env` (`groupPolicy: allowlist` drops other groups silently); (2) **bot privacy mode is on** — check with `getMe` (`can_read_all_group_messages` must be `true`); fix via @BotFather `/setprivacy` → Disable, then remove + re-add the bot to the group |
| Bot responds in wrong group | Verify `TELEGRAM_GROUP_ID` in `.env` matches your group; rebuild with `docker compose up --build` |
| Bot answers non-mentioned group messages | Known upstream bug (config persistence on restart) — restart the container and re-verify; see Upgrading OpenClaw step 4 |
| Container crash-loops | Check logs (`docker compose logs --tail 200`); examine recent image/config changes |
| `docker inspect` shows the group bot's API keys | Expected for Compose env vars: they are visible to host root. Use a dedicated VM, dedicated least-privilege keys, `.env` mode 600, and never paste inspect/config output into tickets. The propose bot's delegate/Safe keys use file secrets and do not appear there |
| Propose bot: `safeApiKeyWarning` in `health_check`, or "Safe queue check unavailable (HTTP 401)" | Set the Safe API key via the `SAFE_API_KEY_FILE` secret; both the `health_check` warning and the mainnet pending-queue check accept the file form |
| Cache bot refuses `middleware_cache_stakes` with denylist/access-control text | Expected before enablement: `SUZAKU_CACHE_DENY_TOOLS` defaults to `middleware_cache_stakes`. Set it to an empty value only after the dark launch/staging checks pass |
| Cache bot says middleware or network is not pinned | Set `SUZAKU_MIDDLEWARE_ADDRESS` and, if not mainnet, `SUZAKU_MIDDLEWARE_NETWORK`; the tool intentionally rejects arbitrary addresses, networks, and `rpcUrl` |
| Cache bot tx fails for insufficient funds | Expected during the unfunded dark launch. After validation, fund the cache key with a small C-Chain AVAX balance and monitor it with `deployment_heartbeat` |
| Slow responses | Composite tools (dashboard, overview) make many RPC calls — first query is slower. Also ensure `SOUL.md` pins your deployment's contract addresses (see below) so the bot doesn't rediscover them every conversation |
| Bot says it has no Suzaku tools / "not exposed in this session" | Confirm the image/config validation passed and the log reports the `suzaku` MCP server. Send `/new` after any model/runtime/plugin change because existing thread sessions retain their prior tool surface |
| `cron create` fails with a pairing/scope error | Approve the request from an already-authorized OpenClaw device and rerun `register-heartbeat-cron.sh`. Do **not** patch `devices/paired.json`; stop and collect the exact error if supported approval is unavailable |
| Audit log empty at `/data/audit` despite bot activity | Confirm direct `mcp.servers.suzaku` started, the `audit-data` volume is mounted, and `/data/audit` is writable by `node`; audit writes are best-effort, so a wrong volume owner can hide the failure |
| Container says the Moonshot provider is missing | Rebuild the pinned bot image; the 2026.7.1 provider is seeded into the persistent state volume on every start. Do not install an unpinned plugin on the VM |
| Event scan says Etherscan free access is unsupported for Avalanche | Leave both explorer variables empty and use public RPC, or upgrade the key to an Avalanche-enabled Etherscan Lite-or-higher plan. A valid free key must not be enabled because it makes the optional fast path fail closed |
| Old-epoch diagnosis is very slow on public RPC | This is expected for a wide forensic log scan because the public endpoint limits log ranges. It does not block the one-epoch heartbeat. Use a dedicated RPC or paid Etherscan V2 for recurring historical forensics; do not reduce the scan range and call the result complete |
| High API costs | Run `gateway usage-cost --days 7 --json`, compare with Moonshot billing, inspect unexpected cron/conversation volume, and disable/rotate the Moonshot key if needed. Concurrency limits are not a spend cap |

**SOUL.md pins the monitored deployment.** The committed `SOUL.md` carries the Dexalot mainnet contract addresses in a "Known deployment" section so the bot answers without a discovery round-trip. Deploying for a different L1? Update those addresses (and the persona text) accordingly.
