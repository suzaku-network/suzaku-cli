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

exec docker-entrypoint.sh node openclaw.mjs gateway --allow-unconfigured
