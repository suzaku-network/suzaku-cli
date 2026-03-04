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
| Container crash-loops | Check logs; if `read_only` causes issues, remove it temporarily and file a bug |
| `docker inspect` shows API keys | Expected — Docker env vars are visible to host root. This is why VPS isolation matters |
| Slow responses | Composite tools (dashboard, overview) make many RPC calls — first query is slower |
| High API costs | Set a billing cap at console.anthropic.com; consider switching to `claude-haiku-4-5` in `openclaw.json` |
