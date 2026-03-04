FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/keeper/package.json packages/keeper/
COPY src/ src/
COPY tsconfig.json ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages/keeper/ packages/keeper/
RUN pnpm build && cd packages/keeper && pnpm build

FROM base AS run
WORKDIR /app
COPY --from=deps /app/node_modules node_modules/
COPY --from=deps /app/packages/keeper/node_modules packages/keeper/node_modules/
COPY --from=build /app/dist dist/
COPY --from=build /app/packages/keeper/dist packages/keeper/dist/
COPY package.json ./
COPY packages/keeper/package.json packages/keeper/

ENTRYPOINT ["node", "packages/keeper/dist/index.js"]
