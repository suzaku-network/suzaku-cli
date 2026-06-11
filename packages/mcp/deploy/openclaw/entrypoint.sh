#!/bin/sh
set -e

# Substitute env vars into openclaw.json template → runtime config
CONFIG_TPL="/home/node/.openclaw/openclaw.json.tpl"
CONFIG_OUT="/home/node/.openclaw/openclaw.json"

if [ -f "$CONFIG_TPL" ]; then
  sed \
    -e "s|\${TELEGRAM_BOT_TOKEN}|${TELEGRAM_BOT_TOKEN}|g" \
    -e "s|\${TELEGRAM_ADMIN_USER_ID}|${TELEGRAM_ADMIN_USER_ID}|g" \
    -e "s|\${TELEGRAM_GROUP_ID}|${TELEGRAM_GROUP_ID}|g" \
    "$CONFIG_TPL" > "$CONFIG_OUT"
fi

# Substitute the non-secret config vars into the mcporter template (propose bot only —
# mcporter does not inherit the container environment). The delegate key and Safe API key
# are NOT here: they are file secrets read at spawn time (SUZAKU_PK_FILE / SAFE_API_KEY_FILE),
# so the raw secret never lands in the rendered mcporter.json.
MCPORTER_TPL="/home/node/.openclaw/workspace/config/mcporter.json.tpl"
MCPORTER_OUT="/home/node/.openclaw/workspace/config/mcporter.json"

if [ -f "$MCPORTER_TPL" ]; then
  sed \
    -e "s|\${SUZAKU_SAFE_ADDRESS}|${SUZAKU_SAFE_ADDRESS}|g" \
    -e "s|\${SUZAKU_REWARDS_ADDRESS}|${SUZAKU_REWARDS_ADDRESS}|g" \
    -e "s|\${SUZAKU_MIDDLEWARE_ADDRESS}|${SUZAKU_MIDDLEWARE_ADDRESS}|g" \
    -e "s|\${SUZAKU_MAX_REWARDS_AMOUNT}|${SUZAKU_MAX_REWARDS_AMOUNT}|g" \
    "$MCPORTER_TPL" > "$MCPORTER_OUT"
  chmod 600 "$MCPORTER_OUT"
fi

# Register the Suzaku MCP server natively with the Codex app-server harness:
# openai/* agent turns run through Codex, which manages its OWN MCP servers — the
# mcporter skill does not bridge into it. The block is regenerated on every start
# (idempotent) so env changes like SNOWSCAN_API_KEY propagate. Read-only bot only
# (the propose bot is identified by its mcporter template mount and stays on the
# anthropic runtime).
CODEX_CFG="/home/node/.openclaw/agents/main/agent/codex-home/config.toml"
if [ ! -f "$MCPORTER_TPL" ]; then
  mkdir -p "$(dirname "$CODEX_CFG")"
  touch "$CODEX_CFG"
  awk 'BEGIN{skip=0} /^\[mcp_servers\.suzaku\]/{skip=1;next} /^\[/{if(skip)skip=0} skip==0{print}' \
    "$CODEX_CFG" > "$CODEX_CFG.tmp" && mv "$CODEX_CFG.tmp" "$CODEX_CFG"
  cat >> "$CODEX_CFG" <<EOF

[mcp_servers.suzaku]
command = "node"
args = ["/mcp/packages/mcp/dist/server.js", "--read-only"]
env = { PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME = "/home/node", SNOWSCAN_API_KEY = "${SNOWSCAN_API_KEY}" }
EOF
fi

exec docker-entrypoint.sh node openclaw.mjs gateway --allow-unconfigured
