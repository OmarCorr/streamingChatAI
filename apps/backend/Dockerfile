# syntax=docker/dockerfile:1.7
# ADR-4: node:20-slim (Debian) — DO NOT change to Alpine.
# Alpine uses musl libc; Prisma engines are glibc-compiled and crash on musl.
# See: https://www.prisma.io/docs/orm/prisma-client/deployment/caveats-when-deploying-to-aws-platforms

# ---------- base ----------
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
# openssl: required by Prisma engine at runtime and during generate.
# ca-certificates: required for HTTPS calls (Langfuse SDK, Gemini SDK).
RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.18.2 --activate
WORKDIR /app

# ---------- deps (pnpm fetch — hydrates offline store) ----------
FROM base AS deps
# Copy only the files that determine the dependency graph.
# This layer is invalidated only when the lockfile or a package.json changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/database/package.json packages/database/package.json
# pnpm fetch downloads packages into the pnpm store without linking.
# BuildKit cache mount keeps the store across builds.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch --frozen-lockfile

# ---------- build ----------
FROM deps AS build
# Copy full monorepo source (node_modules excluded via .dockerignore).
COPY . .
# Install from the warmed store — offline keeps the build hermetic.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
# Generate Prisma client before NestJS compilation (backend imports from @streaming-chat/database).
RUN pnpm --filter @streaming-chat/database prisma:generate
# Compile NestJS to dist/.
RUN pnpm --filter @streaming-chat/backend build
# Produce a production-only artifact at /out (strips devDeps, preserves workspace links as copies).
# --legacy: pnpm v10+ requires inject-workspace-packages=true by default;
# --legacy restores the pnpm v9 deploy behaviour (copy deps without injection).
RUN pnpm --filter @streaming-chat/backend --prod deploy --legacy /out

# ---------- runtime ----------
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001
# Prisma engine and HTTPS calls require openssl + ca-certificates.
RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Non-root user for security (node:20-slim already includes a 'node' user with uid 1000).
WORKDIR /app
# Copy production artifact from build stage.
COPY --from=build --chown=node:node /out ./
# pnpm deploy resolves workspace:* links into real copies inside /out/node_modules.
# The Prisma generated client lives at packages/database/generated/client inside the workspace,
# and pnpm deploy copies @streaming-chat/database into /out/node_modules/@streaming-chat/database.
# However, the generated/ directory may be empty or absent if prisma:generate ran before deploy.
# Copy it explicitly from the build stage to guarantee presence.
COPY --from=build --chown=node:node /app/packages/database/generated ./node_modules/@streaming-chat/database/generated
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
