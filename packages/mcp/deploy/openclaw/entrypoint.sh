#!/bin/sh
set -e

# Refresh image-bundled extensions into the persistent state volume on every
# start. This makes upgrades deterministic even when the volume predates the
# image, without downloading packages at boot.
mkdir -p /home/node/.openclaw/npm/projects /home/node/.openclaw/extensions
if [ -d /opt/openclaw-plugin-seed/npm/projects ]; then
  for source in /opt/openclaw-plugin-seed/npm/projects/*; do
    [ -d "$source" ] || continue
    target="/home/node/.openclaw/npm/projects/$(basename "$source")"
    rm -rf "$target"
    cp -a "$source" "$target"
  done
fi
if [ -d /opt/suzaku-openclaw-extensions/suzaku-output-guard ]; then
  rm -rf /home/node/.openclaw/extensions/suzaku-output-guard
  cp -a /opt/suzaku-openclaw-extensions/suzaku-output-guard /home/node/.openclaw/extensions/
fi

# Render the selected template into a validated runtime config. Secrets remain
# native ${NAME} references for OpenClaw and are never written into this file.
CONFIG_TPL="/home/node/.openclaw/openclaw.json.tpl"
CONFIG_OUT="/home/node/.openclaw/openclaw.json"

if [ ! -f "$CONFIG_TPL" ]; then
  echo "OpenClaw configuration template is missing" >&2
  exit 1
fi
node /usr/local/lib/suzaku/render-config.mjs "$CONFIG_TPL" "$CONFIG_OUT"

# Substitute the non-secret config vars into mcporter templates (propose/cache bots —
# mcporter does not inherit the container environment). Delegate/cache keys and Safe API
# keys are NOT here: they are file secrets read at spawn time (SUZAKU_PK_FILE /
# SAFE_API_KEY_FILE), so raw secrets never land in the rendered mcporter.json.
MCPORTER_TPL="/home/node/.openclaw/workspace/config/mcporter.json.tpl"
MCPORTER_OUT="/home/node/.openclaw/workspace/config/mcporter.json"

if [ -f "$MCPORTER_TPL" ]; then
  sed \
    -e "s|\${SUZAKU_SAFE_ADDRESS}|${SUZAKU_SAFE_ADDRESS}|g" \
    -e "s|\${SUZAKU_REWARDS_ADDRESS}|${SUZAKU_REWARDS_ADDRESS}|g" \
    -e "s|\${SUZAKU_MIDDLEWARE_ADDRESS}|${SUZAKU_MIDDLEWARE_ADDRESS}|g" \
    -e "s|\${SUZAKU_MIDDLEWARE_NETWORK}|${SUZAKU_MIDDLEWARE_NETWORK:-mainnet}|g" \
    -e "s|\${SUZAKU_MAX_REWARDS_AMOUNT}|${SUZAKU_MAX_REWARDS_AMOUNT}|g" \
    -e "s|\${SUZAKU_CACHE_KEY_ADDRESS}|${SUZAKU_CACHE_KEY_ADDRESS}|g" \
    -e "s|\${SUZAKU_CACHE_KEY_MIN_AVAX}|${SUZAKU_CACHE_KEY_MIN_AVAX:-0.05}|g" \
    -e "s|\${SUZAKU_CACHE_DENY_TOOLS}|${SUZAKU_CACHE_DENY_TOOLS}|g" \
    "$MCPORTER_TPL" > "$MCPORTER_OUT"
  chmod 600 "$MCPORTER_OUT"
fi

# The monitor profiles register Suzaku through OpenClaw's typed mcp.servers
# registry. This works for embedded Kimi/Anthropic turns and for the optional
# Codex profile without giving the model an mcporter shell bridge.

if [ "${SUZAKU_VALIDATE_ONLY:-false}" = "true" ]; then
  exec node openclaw.mjs config validate
fi

exec docker-entrypoint.sh node openclaw.mjs gateway --allow-unconfigured
