FROM node:24-slim@sha256:242549cd46785b480c832479a730f4f2a20865d61ea2e404fdb2a5c3d3b73ecf AS build

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy CLI package
COPY src/ src/
COPY bin/ bin/
COPY tsconfig.json ./

# Copy MCP package
COPY packages/mcp/package.json packages/mcp/tsconfig.json packages/mcp/
COPY packages/mcp/src/ packages/mcp/src/
# The TypeScript build currently includes stdio-profiles.test.ts, whose real
# transport test imports this bridge. Keep the image build's source graph equal
# to the local build instead of silently omitting that dependency.
COPY packages/mcp/eval/stdio-bridge.mjs packages/mcp/eval/stdio-bridge.d.mts packages/mcp/eval/

# Native deps for usb/node-hid (Ledger transport) — needed at compile time
RUN apt-get update && apt-get install -y --no-install-recommends \
    libusb-1.0-0-dev libudev-dev python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm (pinned to match packageManager field) and build
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate \
    && pnpm install --frozen-lockfile \
    && pnpm build \
    && cd packages/mcp && pnpm build

# ── Target: standalone MCP server (distroless — no shell, no package manager) ──
FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:15a04dd6d85b47a5f5ca64dd7de0dcb3e16b52b9f68e323da01ad8f09fe71f0d AS standalone

WORKDIR /app

COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/dist/ dist/
COPY --from=build /app/bin/ bin/
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/mcp/dist/ packages/mcp/dist/
COPY --from=build /app/packages/mcp/node_modules/ packages/mcp/node_modules/
COPY --from=build /app/packages/mcp/package.json packages/mcp/

ENV SUZAKU_CLI_PATH=/app/bin/cli.js
ENV SUZAKU_MCP_AUDIT_DIR=/data/audit

ENTRYPOINT ["node", "packages/mcp/dist/server.js", "--read-only"]

# ── Target: OpenClaw Telegram bot (openclaw spawns MCP server as subprocess) ──
# Pinned tag + multi-arch index digest. 2026.7.1 is the first pinned release used
# here with the official Kimi K3 provider contract and includes the 2026.6.6 MCP,
# environment-boundary, and Telegram hardening. Never replace this with :latest.
FROM ghcr.io/openclaw/openclaw:2026.7.1@sha256:6a31d44b2944e7adcd2b582bf6fb463111264ebca97a0201795b799135bd102c AS bot

# Retain runtime libraries required by the root CLI's optional Ledger module.
# The monitor itself is read-only and does not install a shell-to-MCP bridge.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    libusb-1.0-0 libudev1 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/openclaw-plugin-seed/npm \
    && chown -R node:node /opt/openclaw-plugin-seed \
    && chown -R node:node /home/node/.openclaw \
    # audit volume mountpoint must be node-writable (audit writes are silent best-effort;
    # a root-owned dir loses them without a trace). Seeds ownership for FRESH volumes only —
    # a pre-existing volume keeps its ownership and needs a one-time chown.
    && mkdir -p /data/audit && chown node:node /data/audit
COPY --chown=node:node packages/mcp/deploy/openclaw/plugins/suzaku-output-guard/ /opt/suzaku-openclaw-extensions/suzaku-output-guard/
COPY --chmod=755 packages/mcp/deploy/openclaw/entrypoint.sh /usr/local/bin/suzaku-entrypoint.sh
COPY --chmod=755 packages/mcp/deploy/openclaw/register-heartbeat-cron.sh /usr/local/bin/register-heartbeat-cron.sh
COPY --chmod=755 packages/mcp/deploy/openclaw/render-config.mjs /usr/local/lib/suzaku/render-config.mjs
COPY --chmod=755 packages/mcp/deploy/openclaw/verify-heartbeat-cron.mjs /usr/local/lib/suzaku/verify-heartbeat-cron.mjs
USER node

# The official Moonshot provider is external to the OpenClaw image. Pin it to the
# same release as the host, then retain an offline seed because the named state
# volume hides image-time ~/.openclaw content after its first creation.
RUN node openclaw.mjs plugins install --pin @openclaw/moonshot-provider@2026.7.1 \
    && cp -a /home/node/.openclaw/npm/projects /opt/openclaw-plugin-seed/npm/

COPY --from=build /app/node_modules/ /mcp/node_modules/
COPY --from=build /app/dist/ /mcp/dist/
COPY --from=build /app/bin/ /mcp/bin/
COPY --from=build /app/package.json /mcp/
COPY --from=build /app/packages/mcp/dist/ /mcp/packages/mcp/dist/
COPY --from=build /app/packages/mcp/node_modules/ /mcp/packages/mcp/node_modules/
COPY --from=build /app/packages/mcp/package.json /mcp/packages/mcp/

ENV SUZAKU_CLI_PATH=/mcp/bin/cli.js
ENV SUZAKU_MCP_PATH=/mcp/packages/mcp/dist/server.js

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:18789/readyz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["suzaku-entrypoint.sh"]
