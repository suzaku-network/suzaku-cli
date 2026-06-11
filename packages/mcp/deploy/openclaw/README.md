# Suzaku Telegram Bot via OpenClaw

Read-only Telegram bot for Suzaku deployment monitoring, powered by [OpenClaw](https://github.com/openclaw/openclaw) + the Suzaku MCP server.

## Quick Start (Local Testing)

### 1. Create a Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`, follow the prompts (e.g., "Suzaku Monitor")
3. Save the bot token
4. Get your user ID: message [@userinfobot](https://t.me/userinfobot) and note the `Id` field

### 2. Create `.env`

```bash
cd packages/mcp/deploy/openclaw

cat > .env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ADMIN_USER_ID=123456789
TELEGRAM_GROUP_ID=-100123456789
EOF
```

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

# 5. Create .env (same as local testing)
cat > .env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_ADMIN_USER_ID=123456789
TELEGRAM_GROUP_ID=-100123456789
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

This blocks outbound traffic from the `br-suzaku` bridge to RFC 1918 and link-local ranges.

### Set Anthropic spending limits

Go to [console.anthropic.com](https://console.anthropic.com) and set a monthly billing cap. The bot uses `claude-sonnet-4-6` — a runaway conversation loop could burn through credits.

## Architecture

```
docker-compose.yml
  └── suzaku-bot (single container)
        ├── OpenClaw (Telegram bot framework)
        │     └── mcp-adapter plugin
        │           └── Suzaku MCP server (stdio subprocess)
        │                 └── CLI subprocess (per tool call)
        └── Security layers:
              read_only: true + tmpfs (/tmp, /root/.openclaw)
              cap_drop: ALL, no-new-privileges
              pids_limit: 100, mem_limit: 1g
              restart: unless-stopped
```

The MCP server runs in `--read-only` mode (no write tools registered). It spawns CLI subprocesses with a restricted 8-variable environment allowlist — `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN` do NOT propagate to CLI subprocesses.

## Configuration Reference

### `openclaw.json`

| Field | Value | Purpose |
|---|---|---|
| `agents.defaults.model.primary` | `anthropic/claude-sonnet-4-6` | Cost-effective model for read queries |
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
| `pids_limit: 100` | Prevents fork bombs |
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
  ├── CLI: ALLOW_SAFE_DELEGATE_MAINNET=true — a software key is permitted on mainnet
  │   ONLY together with --safe, and the CLI hard-refuses OWNER keys in this mode
  └── Pre-checks per proposal: epoch has no rewards set (accumulation guard), epoch
      window, amount bounds (SUZAKU_MAX_REWARDS_AMOUNT), no matching pending proposal
```

### Additional environment variables (propose bot)

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_PROPOSE_BOT_TOKEN` | Yes | Separate bot token — never reuse the group bot's |
| `SUZAKU_DELEGATE_PK` | Yes | The delegate EOA key (NOT an owner key — the CLI refuses owner keys) |
| `SUZAKU_SAFE_ADDRESS` | Yes | The rewards Safe |
| `SAFE_API_KEY` | mainnet | Safe tx-service auth — get one at developer.safe.global |
| `SUZAKU_REWARDS_ADDRESS` | Yes | RewardsNativeToken address (removes wrong-address risk) |
| `SUZAKU_MIDDLEWARE_ADDRESS` | Yes | L1Middleware address (epoch-window pre-check) |
| `SUZAKU_MAX_REWARDS_AMOUNT` | Yes | Upper bound (human units) — proposals at or above are refused |

Secrets reach the MCP server via `mcporter-propose.json`, which is mounted as a template and rendered by `entrypoint.sh` (mcporter does not inherit the container environment). The rendered file is `chmod 600` inside the container.

### One-time setup (in order)

1. **Generate the delegate key** (a fresh EOA; it needs a little AVAX for nothing — it never sends transactions).
2. **Grant the Safe the rewards role and fund it** (owner action): the Safe must hold `REWARDS_MANAGER_ROLE` on the rewards contract (`suzaku-cli access-control ...` or the protocol admin does it) and a sufficient ALOT balance — the proposed batch pulls tokens from the Safe when executed. Verify: `cast call <rewards> "hasRole(bytes32,address)(bool)" $(cast keccak "REWARDS_MANAGER_ROLE") <safe>`.
3. **Register the delegate** (owner action, from the repo root):
   ```bash
   NETWORK=fuji SAFE_ADDRESS=0x... DELEGATE_ADDRESS=0x... OWNER_PK=0x... \
     node scripts/add-safe-delegate.mjs
   # verify:
   curl "https://wallet-transaction-fuji.ash.center/api/v1/safes/<safe>/delegates/"
   ```
   On mainnet add `SAFE_API_KEY=...` and verify against `https://api.safe.global/tx-service/avax/api`.
4. **Start the bot**: `docker compose --profile propose up -d --build`.

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

If the delegate key is compromised: remove the delegate (`scripts/add-safe-delegate.mjs` flow in reverse via the Safe UI / `DELETE /v2/delegates/`), rotate `SUZAKU_DELEGATE_PK`, re-register. A compromised delegate can only spam the queue — owners should treat unexpected proposals as hostile and delete them.

## Upgrading OpenClaw

The Dockerfile pins the OpenClaw image by version tag **and** digest (`2026.6.5`). Never revert to `:latest` — 2026 releases shipped several breaking config changes and the pin is also a security floor (versions before 2026.4.22 are vulnerable to the "Claw Chain" sandbox-escape advisories; 2026.6.5 includes the May/June advisory batch).

Upgrade procedure:

1. Read the release notes between the pinned and the target version (`github.com/openclaw/openclaw/releases`).
2. Bump the tag + digest in the Dockerfile and rebuild **locally first** (`docker compose up --build`), not on the production VPS.
3. Run `docker compose exec suzaku-bot node openclaw.mjs doctor` — it flags deprecated/unrecognized config keys (unrecognized keys have blocked gateway startup in past releases).
4. Verify group access control still holds: send a message in the group **without** @-mentioning the bot from a non-admin account and confirm it does not respond (a past release had a bug where `requireMention` silently reverted on restart).

## Scheduled Epoch Alerts (cron)

`cron.enabled: true` turns on OpenClaw's built-in scheduler. Jobs are registered at runtime (they live in the container filesystem, so re-register after a rebuild):

```bash
docker compose exec suzaku-bot node openclaw.mjs cron create "0 */4 * * *" \
  "Check the current epoch status, timing, and cache readiness on mainnet using the Suzaku MCP tools. If the epoch is about to roll over or the stake cache is not ready, say so explicitly." \
  --name "epoch-check" \
  --session isolated \
  --announce \
  --channel telegram \
  --to "<TELEGRAM_GROUP_ID>"
```

This pushes a proactive epoch report to the group every 4 hours — useful for the rewards workflow (uptime → set-amount → distribute → harvest) where missing an epoch boundary is the most common operational mistake.

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
| Bot responds in wrong group | Verify `TELEGRAM_GROUP_ID` in `.env` matches your group; rebuild with `docker compose up --build` |
| Bot answers non-mentioned group messages | Known upstream bug (config persistence on restart) — restart the container and re-verify; see Upgrading OpenClaw step 4 |
| Container crash-loops | Check logs; if `read_only` causes issues, remove it temporarily and file a bug |
| `docker inspect` shows API keys | Expected — Docker env vars are visible to host root. This is why VPS isolation matters |
| Slow responses | Composite tools (dashboard, overview) make many RPC calls — first query is slower |
| High API costs | Set a billing cap at console.anthropic.com; consider switching to `claude-haiku-4-5` in `openclaw.json` |
