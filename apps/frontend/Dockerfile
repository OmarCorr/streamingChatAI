# syntax=docker/dockerfile:1.7
# ADR-4: node:20-slim (Debian) — DO NOT change to Alpine.
# ADR-11: output: 'standalone' in next.config.ts → minimal server.js runtime.
# IMPORTANT: Do NOT set NEXT_PUBLIC_LIGHTHOUSE_MODE in any stage.
#            Its presence silently disables SessionBootstrap in production.

# ---------- base ----------
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate
WORKDIR /app

# ---------- deps (pnpm fetch — hydrates offline store) ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/database/package.json packages/database/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# ---------- build ----------
FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
ENV NEXT_TELEMETRY_DISABLED=1
# Produces .next/standalone/ + .next/static/ (output: 'standalone' in next.config.ts).
# DO NOT set NEXT_PUBLIC_LIGHTHOUSE_MODE here.
RUN pnpm --filter @streaming-chat/frontend build
# Ensure public/ exists so the runtime COPY below never fails (project has no public assets yet).
RUN mkdir -p apps/frontend/public

# ---------- runtime ----------
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
# Non-root user (node:20-slim ships a 'node' user with uid 1000).
WORKDIR /app
# Standalone output contains a self-contained server.js + minimal node_modules.
# The monorepo layout means standalone emits to apps/frontend/ inside the root.
COPY --from=build --chown=node:node /app/apps/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build --chown=node:node /app/apps/frontend/public ./apps/frontend/public
USER node
EXPOSE 3000
# server.js is emitted at apps/frontend/server.js inside the standalone root.
CMD ["node", "apps/frontend/server.js"]
