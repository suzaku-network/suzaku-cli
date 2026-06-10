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

# Native deps for usb/node-hid (Ledger transport) — needed at compile time
RUN apt-get update && apt-get install -y --no-install-recommends \
    libusb-1.0-0-dev libudev-dev python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm (pinned to match packageManager field) and build
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate \
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
# Pinned — minimum safe version is 2026.4.22 (Claw Chain sandbox fixes); 2026.6.5 includes the May/June advisory batch.
# To upgrade: bump tag+digest deliberately after reading the changelog, then run `openclaw doctor` in the container.
FROM ghcr.io/openclaw/openclaw:2026.6.5@sha256:037f49ba1595be9502fb345138d727cd0cfaecf1392cbe0cfe053fb4681386cd AS bot

# Install mcporter + runtime libs for usb/node-hid (CLI imports Ledger transport at load time)
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    libusb-1.0-0 libudev1 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g mcporter@0.12.0 \
    && mkdir -p /home/node/.openclaw/workspace/config \
    && chown -R node:node /home/node/.openclaw
COPY --chmod=755 packages/mcp/deploy/openclaw/entrypoint.sh /usr/local/bin/suzaku-entrypoint.sh
USER node

COPY --from=build /app/node_modules/ /mcp/node_modules/
COPY --from=build /app/dist/ /mcp/dist/
COPY --from=build /app/bin/ /mcp/bin/
COPY --from=build /app/package.json /mcp/
COPY --from=build /app/packages/mcp/dist/ /mcp/packages/mcp/dist/
COPY --from=build /app/packages/mcp/node_modules/ /mcp/packages/mcp/node_modules/
COPY --from=build /app/packages/mcp/package.json /mcp/packages/mcp/

ENV SUZAKU_CLI_PATH=/mcp/bin/cli.js
ENV SUZAKU_MCP_PATH=/mcp/packages/mcp/dist/server.js

ENTRYPOINT ["suzaku-entrypoint.sh"]
