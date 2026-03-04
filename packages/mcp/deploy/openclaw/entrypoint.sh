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

exec docker-entrypoint.sh node openclaw.mjs gateway --allow-unconfigured
