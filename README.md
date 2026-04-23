# Streaming Chat

Full-stack AI chat demo with streaming, persistence, cancellation, and error handling. Built as a portfolio/sales artifact demonstrating production-grade AI feature integration.

## Tech Stack

- **Frontend**: Next.js 15 + TypeScript 5 strict + Tailwind CSS 4
- **Backend**: NestJS 10 + Prisma 5 + Gemini 2.5 Flash
- **Infra**: PostgreSQL 16 + Langfuse v3 (self-hosted) + Docker Compose

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker >= 24 with Docker Compose plugin

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd stremingChatAI
cp .env.example .env
# Edit .env — fill in POSTGRES_PASSWORD, generate LANGFUSE_SALT + LANGFUSE_ENCRYPTION_KEY
pnpm install
```

### 2. Generate Langfuse secrets

```bash
# In .env, fill these two vars:
openssl rand -hex 32  # → LANGFUSE_SALT
openssl rand -hex 32  # → LANGFUSE_ENCRYPTION_KEY
```

### 3. Start database

```bash
docker compose up postgres -d
# Wait for health check to pass (usually ~5s)
```

### 4. Run Prisma migration

```bash
pnpm prisma:migrate
# Creates tables: Session, Conversation, Message
```

### 5. Start development servers

```bash
# Terminal 1 — backend on http://localhost:3001
pnpm dev:backend

# Terminal 2 — frontend on http://localhost:3000
pnpm dev:frontend
```

## Docker Compose profiles

```bash
# Default (app Postgres only)
docker compose up -d

# With Langfuse observability stack
docker compose --profile observability up -d
# Langfuse UI: http://localhost:3100

# Full production containers (requires Dockerfiles from deploy change)
docker compose --profile observability --profile apps up -d
```

## Available scripts

| Script | Description |
|--------|-------------|
| `pnpm install` | Install all workspace dependencies |
| `pnpm dev:backend` | Start NestJS dev server (port 3001) |
| `pnpm dev:frontend` | Start Next.js dev server (port 3000) |
| `pnpm build` | Build all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm typecheck` | TypeScript check all workspaces |
| `pnpm test` | Run tests across all workspaces |
| `pnpm prisma:generate` | Regenerate Prisma client |
| `pnpm prisma:migrate` | Run pending Prisma migrations |

## Deploy

**Live URL**: `https://<VPS_IP>/` — self-signed TLS (expect browser warning; click "Advanced → Proceed")

### Architecture

```
Browser → Caddy:443 (self-signed TLS)
            ├── /api/*       → backend:3001 (NestJS)
            ├── /langfuse/*  → langfuse-web:3000
            └── /*           → frontend:3000 (Next.js)
```

Single Contabo VPS + Docker Compose + Caddy. Auto-deploys on every `git push origin main` via GitHub Actions (`deploy.yml`). Total pipeline time: ~4–5 minutes.

CI badge: ![Deploy](https://github.com/OmarCorr/stremingChatAI/actions/workflows/deploy.yml/badge.svg)

For the full operator runbook — VPS bootstrap, GitHub Secrets, Langfuse setup, rollback, backup, and troubleshooting — see **[docs/DEPLOY.md](docs/DEPLOY.md)**.
