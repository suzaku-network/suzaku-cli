FROM node:22-slim@sha256:2f3571d6b2768c8f6a4e24e67e9e3a2ad7227c423b621fc5e4c4efa54e1a67f7 AS build

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

# Install pnpm (pinned to match packageManager field) and build
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate \
    && pnpm install --frozen-lockfile \
    && pnpm build \
    && cd packages/mcp && pnpm build

# ── Runtime stage (distroless — no shell, no package manager) ──
FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:15a04dd6d85b47a5f5ca64dd7de0dcb3e16b52b9f68e323da01ad8f09fe71f0d

WORKDIR /app

# Copy built artifacts (distroless has no shell — COPY only)
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/dist/ dist/
COPY --from=build /app/bin/ bin/
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/mcp/dist/ packages/mcp/dist/
COPY --from=build /app/packages/mcp/node_modules/ packages/mcp/node_modules/
COPY --from=build /app/packages/mcp/package.json packages/mcp/

# Create audit log directory (distroless nonroot UID is 65532)
COPY --from=build --chown=65532:65532 /app/packages/mcp/dist/ packages/mcp/dist/

ENV SUZAKU_CLI_PATH=/app/bin/cli.js
ENV SUZAKU_MCP_AUDIT_DIR=/data/audit

ENTRYPOINT ["node", "packages/mcp/dist/server.js", "--read-only"]
