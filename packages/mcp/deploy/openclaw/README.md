# Suzaku Telegram Bot via OpenClaw

Read-only Telegram bot for Suzaku deployment monitoring, powered by [OpenClaw](https://github.com/openclaw/openclaw) + the Suzaku MCP server.

## Prerequisites

- Node.js >= 18
- [OpenClaw](https://github.com/openclaw/openclaw) installed (`npm i -g openclaw` or Docker)
- An Anthropic API key
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- The `suzaku-mcp` binary (built from this repo)

## Setup

### 1. Build the MCP server

```bash
cd packages/mcp
pnpm install && pnpm build
```

### 2. Create a Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts to name it (e.g., "Suzaku Monitor")
3. Save the bot token

### 3. Configure OpenClaw

```bash
# Initialize OpenClaw (if first time)
openclaw onboard --anthropic-api-key "$ANTHROPIC_API_KEY"

# Copy config files into OpenClaw's workspace
cp openclaw.json ~/.openclaw/openclaw.json
cp SOUL.md ~/.openclaw/workspace/SOUL.md
```

Edit `~/.openclaw/openclaw.json`:
- Replace `${TELEGRAM_BOT_TOKEN}` with your bot token
- Replace `${SUZAKU_MCP_PATH}` with the absolute path to `packages/mcp/dist/server.js`

Or set them in `~/.openclaw/.env`:
```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
SUZAKU_MCP_PATH=/path/to/packages/mcp/dist/server.js
```

### 4. Install the MCP adapter plugin

```bash
openclaw plugins install mcp-adapter
openclaw gateway restart
```

### 5. Start OpenClaw

```bash
openclaw up
```

The bot should now respond to messages in Telegram.

### 6. Add the bot to a group (optional)

1. Add the bot to your Telegram group
2. The config sets `requireMention: true` for groups — users must @-mention the bot to trigger a response
3. In DMs, the bot responds to all messages

## Configuration reference

### `openclaw.json`

| Field | Value | Purpose |
|---|---|---|
| `agents.defaults.model.primary` | `anthropic/claude-sonnet-4-6` | Cost-effective model for read queries |
| `channels.telegram.dmPolicy` | `allowlist` | Only allowlisted users can DM the bot |
| `channels.telegram.allowFrom` | `["tg:<user_id>"]` | Telegram user IDs allowed to DM |
| `channels.telegram.groups.<id>.requireMention` | `true` | Bot only responds when @-mentioned in groups |
| `plugins.entries.mcp-adapter.config.servers[0].args` | `["<path>", "--read-only"]` | MCP server path + read-only flag |

### Restricting access

To limit who can use the bot, change `dmPolicy` to `"allowlist"` and add Telegram user IDs:

```json
{
  "channels": {
    "telegram": {
      "dmPolicy": "allowlist",
      "allowFrom": ["tg:123456789", "tg:987654321"]
    }
  }
}
```

### Using a different network

Set environment variables in the MCP server config to default to a different network:

```json
{
  "name": "suzaku",
  "transport": "stdio",
  "command": "node",
  "args": ["${SUZAKU_MCP_PATH}", "--read-only"],
  "env": {
    "SUZAKU_MCP_DEDUP_WINDOW_MS": "30000"
  }
}
```

Users can still specify `network: "fuji"` in their queries — the MCP tools accept a network parameter.

## Docker Compose deployment (recommended)

The `docker-compose.yml` in this directory builds the MCP server and runs it alongside OpenClaw with hardened container settings.

### Required environment variables

Create a `.env` file in this directory (or export them):

```bash
ANTHROPIC_API_KEY=sk-ant-...         # Anthropic API key for Claude
TELEGRAM_BOT_TOKEN=123456:ABC-DEF... # Telegram bot token from @BotFather
TELEGRAM_ADMIN_USER_ID=123456789     # Your Telegram user ID
TELEGRAM_GROUP_ID=-100123456789      # Telegram group ID (optional)
```

### Start

```bash
cd packages/mcp/deploy/openclaw
docker compose up -d --build
```

### Network-level SSRF backstop

For defense-in-depth against DNS rebinding, run `iptables-setup.sh` on the Docker host:

```bash
sudo bash iptables-setup.sh
```

This blocks outbound traffic from the `br-suzaku` bridge to RFC 1918 and link-local ranges.

## Docker deployment (standalone)

```bash
docker run -d \
  --name suzaku-bot \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" \
  -v $(pwd)/openclaw.json:/root/.openclaw/openclaw.json \
  -v $(pwd)/SOUL.md:/root/.openclaw/workspace/SOUL.md \
  -v /path/to/packages/mcp/dist:/mcp \
  openclaw/openclaw
```

Adjust the MCP path in `openclaw.json` to `/mcp/server.js`.

## Example queries

Once the bot is running, try these in Telegram:

- "What operators are registered on mainnet?"
- "Show me the health status of operator 0x1234... on middleware 0xabcd..."
- "What's the current epoch status?"
- "Show me the stake matrix"
- "What are the vault balances for 0x5678...?"

## Troubleshooting

| Issue | Fix |
|---|---|
| Bot doesn't respond | Check `openclaw logs` — verify Telegram plugin is enabled and token is valid |
| "Plugin not available" | Run `openclaw plugins enable telegram && openclaw gateway restart` |
| MCP tools not found | Run `openclaw plugins list` — verify `mcp-adapter` is enabled |
| Slow responses | Composite tools (dashboard, overview) make many RPC calls — first query per session is slower due to cache miss |
