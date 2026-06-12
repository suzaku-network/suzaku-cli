# Suzaku Telegram Bot via OpenClaw

Read-only Telegram bot for Suzaku deployment monitoring, powered by [OpenClaw](https://github.com/openclaw/openclaw) + the Suzaku MCP server.

## Quick Start (Local Testing)

### 1. Create a Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`, follow the prompts (e.g., "Suzaku Monitor")
3. Save the bot token
4. **Disable privacy mode** (required for group use): `/setprivacy` → select the bot → **Disable**. With privacy mode on, `@mentions` in groups are never delivered to the bot. If the bot is already in a group when you change this, remove and re-add it — Telegram applies the change only on re-join. (OpenClaw still routes only mentions to the model via `requireMention`.)
5. Get your user ID: message [@userinfobot](https://t.me/userinfobot) and note the `Id` field. For a group's chat ID, add [@getidsbot](https://t.me/getidsbot) to the group briefly (supergroup IDs look like `-100…`)

### 2. Create `.env`

```bash
cd packages/mcp/deploy/openclaw

cat > .env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ADMIN_USER_ID=123456789
TELEGRAM_GROUP_ID=-100123456789
OPENCLAW_GATEWAY_TOKEN=<random secret — generate with: openssl rand -hex 24>
EOF
```

`OPENCLAW_GATEWAY_TOKEN` is **required**: OpenClaw refuses to start its gateway inside a container without an auth credential (the container crash-loops with "Refusing to bind gateway to auto without auth"). Any random secret works — nothing else needs to know it; the gateway port is not published outside the compose network.

### 3. Build and run

```bash
docker compose up --build -d
docker compose logs -f
```

### 4. Test it

DM the bot from your Telegram account, or @-mention it in your group. Only your user ID can DM; in the group, anyone can interact by mentioning the bot.

### 5. Stop

```bash
docker compose down
```

## VPS Deployment (Production)

For production, deploy on a dedicated VPS to minimize blast radius. A compromised container on your local PC could reach dev servers, wallets, and browser sessions. On a VPS, it can only reach two API keys.

### Recommended providers

| Provider | Plan | Specs | Cost |
|---|---|---|---|
| Hetzner | CAX11 (ARM) | 2 vCPU, 4 GB RAM | ~$4/mo |
| Hetzner | CX22 (x86) | 2 vCPU, 4 GB RAM | ~$5/mo |

### VPS setup

```bash
# 1. SSH in (key-only auth — disable password auth in /etc/ssh/sshd_config)
ssh root@<vps-ip>

# 2. Firewall: allow only SSH
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw enable

# 3. Install Docker
curl -fsSL https://get.docker.com | sh

# 4. Clone and deploy
git clone <your-repo-url> /opt/suzaku
cd /opt/suzaku/packages/mcp/deploy/openclaw

# 5. Create .env (same as local testing — OPENCLAW_GATEWAY_TOKEN is required, see Quick Start)
cat > .env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ADMIN_USER_ID=123456789
TELEGRAM_GROUP_ID=-100123456789
OPENCLAW_GATEWAY_TOKEN=<random secret — generate with: openssl rand -hex 24>
EOF
chmod 600 .env

# 6. Build and start
docker compose up --build -d
```

### iptables SSRF backstop

After `docker compose up`, run the iptables rules on the Docker host to block container-to-private-network traffic (defense-in-depth against DNS rebinding):

```bash
sudo bash iptables-setup.sh
```

This blocks outbound traffic from the `br-suzaku` bridge to RFC 1918, link-local, and loopback (`127.0.0.0/8`) ranges.

### Set Anthropic spending limits

Go to [console.anthropic.com](https://console.anthropic.com) and set a monthly billing cap — this applies whenever the Anthropic API key is in play (as primary model or as fallback). A runaway conversation loop could burn through credits.

## Model auth: subscription (Codex) vs API key

The committed config runs the agent on **`openai/gpt-5.5` through OpenClaw's Codex harness**, authenticated with a **ChatGPT/Codex subscription** (OAuth — flat monthly cost, no per-token billing), with **`anthropic/claude-sonnet-4-6` as fallback** via `ANTHROPIC_API_KEY`. The `codex` plugin is enabled in `openclaw.json`; the OAuth profile lives in the `openclaw-state` volume, so it survives container restarts and recreates.

**One-time Codex login** (after the container is up):

```bash
docker compose exec suzaku-bot node openclaw.mjs models auth login --provider openai
```

Run this from a real terminal — it requires an interactive TTY. It prints an OpenAI URL: open it in your local browser, sign in with the ChatGPT account that holds the subscription. The browser then redirects to `http://localhost:1455/auth/callback?...` and shows **ERR_CONNECTION_REFUSED — this is expected** (the callback listener runs inside the container). Copy the **full redirect URL** from the browser's address bar and paste it into the waiting terminal prompt.

Notes:
- After changing the model, runtime, or `codexPlugins`, **existing chat threads keep their old session config** — send `/new` in the Telegram chat to start a session that picks up the changes.
- Subscriptions are personal-use products with their own usage windows: fine for your own ops automation (this bot, the crons); use API billing for anything genuinely public-facing.
- API-key-only operation: set `agents.defaults.model.primary` back to `anthropic/claude-sonnet-4-6` — no login step, metered billing.
- The `claude-cli/*` provider (Claude Pro/Max subscription via Claude Code) also exists but the CLI is not in this image; it would need a Dockerfile addition.

## Architecture

```
docker-compose.yml
  ├── suzaku-bot (read-only group bot)
  │     ├── OpenClaw (Telegram bot framework)
  │     │     ├── Codex runtime (gpt-5.5): native MCP registration in config.toml (entrypoint.sh)
  │     │     └── Anthropic fallback: mcporter bridge
  │     │           └── Suzaku MCP server --read-only (stdio subprocess)
  │     │                 └── CLI subprocess (per tool call)
  │     └── Security layers:
  │           tmpfs (/tmp only)
  │           cap_drop: ALL, no-new-privileges
  │           pids_limit: 256, mem_limit: 2g
  │           restart: unless-stopped
  └── suzaku-propose-bot (DM-only, compose profile "propose")
        ├── OpenClaw → mcporter → Suzaku MCP server --propose-only
        │     └── delegate key + Safe API key as file secrets (/run/secrets/…)
        └── Same security layers, separate audit volume
```

The MCP server runs in `--read-only` mode (no write tools registered). It spawns CLI subprocesses with a restricted 8-variable environment allowlist — `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN` do NOT propagate to CLI subprocesses.

## Configuration Reference

### `openclaw.json`

| Field | Value | Purpose |
|---|---|---|
| `agents.defaults.model.primary` | `openai/gpt-5.5` | Codex-subscription model (see Model auth above) |
| `agents.defaults.model.fallbacks` | `["anthropic/claude-sonnet-4-6"]` | Automatic fallback via `ANTHROPIC_API_KEY` when the primary is unavailable/rate-limited |
| `plugins.entries.codex` | enabled | Codex app-server harness — required for `openai/*` agent turns on subscription auth |
| `channels.telegram.dmPolicy` | `allowlist` | Only allowlisted users can DM the bot |
| `channels.telegram.allowFrom` | `["tg:<user_id>"]` | Telegram user IDs allowed to DM |
| `channels.telegram.contextVisibility` | `allowlist` | Quoted/thread context from non-allowlisted senders never reaches the model (prompt-injection surface reduction; requires OpenClaw ≥ 2026.4.5) |
| `cron.enabled` | `true` | Built-in scheduler — enables registering epoch-alert jobs (see below) |
| `skills.entries.mcporter` | enabled | MCP tools via mcporter CLI bridge |

### Access control

**DMs**: Only user IDs in the `allowFrom` array can DM the bot. To add more authorized users:

```json
"allowFrom": ["tg:123456789", "tg:987654321"]
```

**Groups**: The bot responds to @-mentions in the group specified by `TELEGRAM_GROUP_ID`. Anyone in that group can ask — access is controlled by who you invite to the group. Never use `"*"` as the group ID; that would expose the bot to every group it's added to.

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
| `ANTHROPIC_API_KEY` | Yes | Claude API key for the bot |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `TELEGRAM_ADMIN_USER_ID` | Yes | Your Telegram user ID for DM allowlist |
| `TELEGRAM_GROUP_ID` | Yes | Telegram group ID (e.g. `-100123456789`) — the one group the bot responds in |

### Using a different network

Users can specify `network: "fuji"` in their queries — the MCP tools accept a network parameter. The default is mainnet.

## Propose Bot (Safe rewards proposals)

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

## Upgrading OpenClaw

The Dockerfile pins the OpenClaw image by version tag **and** digest (`2026.6.5`). Never revert to `:latest` — 2026 releases shipped several breaking config changes and the pin is also a security floor (versions before 2026.4.22 are vulnerable to the "Claw Chain" sandbox-escape advisories; 2026.6.5 includes the May/June advisory batch).

Upgrade procedure:

1. Read the release notes between the pinned and the target version (`github.com/openclaw/openclaw/releases`).
2. Bump the tag + digest in the Dockerfile and rebuild **locally first** (`docker compose up --build`), not on the production VPS.
3. Run `docker compose exec suzaku-bot node openclaw.mjs doctor` — it flags deprecated/unrecognized config keys (unrecognized keys have blocked gateway startup in past releases).
4. Verify group access control still holds: send a message in the group **without** @-mentioning the bot from a non-admin account and confirm it does not respond (a past release had a bug where `requireMention` silently reverted on restart).

## Scheduled Epoch Alerts (cron)

`cron.enabled: true` turns on OpenClaw's built-in scheduler. Jobs are registered at runtime and persist in the `openclaw-state` volume (sqlite) — they survive rebuilds and recreates; re-register only if that volume is deleted or the OpenClaw schema migrates. The canonical recipe is the two `deployment_heartbeat` crons from `packages/mcp/docs/heartbeat-design.md` — substitute the contract addresses pinned in `SOUL.md`:

```bash
# 1. Alerts: post only when something needs attention
docker compose exec suzaku-bot node openclaw.mjs cron create \
  --schedule "10 */4 * * *" \
  --prompt "Call deployment_heartbeat with mode=alerts, middlewareAddress=<L1MIDDLEWARE>, rewardsAddress=<REWARDS>, lstWrapperAddress=<LSTWRAPPER>, network=mainnet. If humanLines is empty, do nothing. Otherwise post humanLines verbatim as a monospace block to the group." \
  --name "heartbeat-alerts" --session isolated --announce --channel telegram --to "<TELEGRAM_GROUP_ID>"

# 2. Digest: post once per epoch rollover
docker compose exec suzaku-bot node openclaw.mjs cron create \
  --schedule "25 */4 * * *" \
  --prompt "Call deployment_heartbeat with mode=digest (same addresses as the alerts cron). If the returned epoch equals the epoch of the last digest you posted, do nothing. Otherwise post humanLines verbatim as a monospace block to the group, then remember this epoch." \
  --name "heartbeat-digest" --session isolated --announce --channel telegram --to "<TELEGRAM_GROUP_ID>"
```

Alerts stay quiet unless a check trips (stake cache late, funding deadline at risk, set-amount accumulation, validator P-Chain balance low, …); the digest posts one claimability/changes report per 3.5-day epoch — missing an epoch boundary is the most common operational mistake this catches.

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
| `docker inspect` shows the group bot's API keys | Expected — those are env vars, visible to host root; this is why VPS isolation matters. The propose bot's delegate key and Safe API key are file secrets (`/run/secrets/...`) and do **not** appear in `docker inspect` |
| Propose bot: `safeApiKeyWarning` in `health_check`, or "Safe queue check unavailable (HTTP 401)" | Set the Safe API key via the `SAFE_API_KEY_FILE` secret; both the `health_check` warning and the mainnet pending-queue check accept the file form |
| Slow responses | Composite tools (dashboard, overview) make many RPC calls — first query is slower. Also ensure `SOUL.md` pins your deployment's contract addresses (see below) so the bot doesn't rediscover them every conversation |
| Bot says it has no Suzaku tools / "not exposed in this session" | Thread session config is computed once — send `/new` in the chat after any model/runtime/plugin change (a gateway restart alone does not refresh existing threads) |
| Codex login: browser shows `ERR_CONNECTION_REFUSED` on `localhost:1455` | Expected — the callback listener is inside the container. Paste the full redirect URL from the address bar into the waiting terminal prompt |
| `models auth login requires an interactive TTY` | Run the login from a real terminal, not piped/scripted |
| High API costs | Set a billing cap at console.anthropic.com; consider switching crons to `claude-haiku-4-5`, or the subscription route (see Model auth) for interactive use |

**SOUL.md pins the monitored deployment.** The committed `SOUL.md` carries the Dexalot mainnet contract addresses in a "Known deployment" section so the bot answers without a discovery round-trip. Deploying for a different L1? Update those addresses (and the persona text) accordingly.
