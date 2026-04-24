# Deploy Runbook — stremingChatAI

Full operator documentation for provisioning, deploying, and operating the stremingChatAI stack on a single Contabo VPS using Docker Compose, Caddy, and (optionally) GitHub Actions.

> **Current mode**: the project ships with a manual `docker compose` flow. The full GitHub Actions + hardened `deploy` user setup below is kept as a reference for when/if the demo graduates beyond portfolio use. If you're just iterating on the VPS, start at [§0 Manual deploy cheat sheet](#0-manual-deploy-cheat-sheet).

---

## Table of Contents

0. [Manual deploy cheat sheet](#0-manual-deploy-cheat-sheet)
1. [Prerequisites](#1-prerequisites)
2. [Required GitHub Secrets](#2-required-github-secrets)
3. [First-time VPS Bootstrap](#3-first-time-vps-bootstrap)
4. [Langfuse Bootstrap (first deploy only)](#4-langfuse-bootstrap-first-deploy-only)
5. [UptimeRobot Setup](#5-uptimerobot-setup)
6. [Normal Deploy](#6-normal-deploy)
7. [Rollback Procedure](#7-rollback-procedure)
8. [Backup Procedure](#8-backup-procedure)
9. [Common Failures](#9-common-failures)
10. [Post-Deploy Performance Checks](#10-post-deploy-performance-checks)
11. [Frontend Re-render Profiling](#11-frontend-re-render-profiling)
12. [Tear Down](#12-tear-down)

---

## 0. Manual deploy cheat sheet

The quick flow we use day-to-day on the VPS. Assumes the repo is already cloned at `/opt/stremingchat` and `.env.prod` is populated.

> ⚠️ **The Contabo terminal mangles multi-line pastes** (`\`-continuations and `&&` chains break). Paste commands one line at a time.

### Redeploy after a code change

```bash
cd /opt/stremingchat
git pull
docker compose --profile apps build backend frontend
docker compose --profile apps up -d --force-recreate backend frontend
docker compose ps
```

Expect all `apps` services to show `Up (healthy)` within ~60s. `chat-migrate` exits `0` — that's correct, it runs once per deploy.

### First boot (observability + apps)

```bash
cd /opt/stremingchat
docker compose --profile observability up -d        # Langfuse stack (db, clickhouse, redis, minio, web, worker)
# wait ~60s for clickhouse + langfuse-web to settle
docker compose --profile apps up -d                 # postgres + migrate + backend + frontend + caddy
```

### Healthcheck a single service

```bash
docker compose ps
docker inspect chat-backend --format '{{json .State.Health}}'
docker exec chat-backend node -e "fetch('http://localhost:3001/api/health').then(r=>r.json().then(j=>console.log(r.status,j)))"
docker compose logs --tail=100 backend
```

The inline `node -e "fetch(...)"` is the same command the healthcheck runs (see `docker-compose.yml:173`). If it prints `200 { status: 'ok', ... }` the backend is healthy; anything else, read the logs.

### Common one-liners

```bash
# Restart only the backend (no rebuild)
docker compose --profile apps restart backend

# Tail logs across all app services
docker compose --profile apps logs -f

# Pull latest images if you rebuild elsewhere (CI)
docker compose --profile apps pull && docker compose --profile apps up -d

# Drop into Postgres
docker compose exec postgres psql -U chatuser -d chatdemo
```

### Port layout (important)

- **3001** backend (Nest). Host-mapped `3001:3001`.
- **3000** frontend (Next.js). Host-mapped `3000:3000`.
- **5432** Postgres (host-mapped for debugging; restrict via UFW in prod).
- **80 / 443** Caddy — the only ports that should be publicly exposed.

Backend and frontend share `.env.prod`, and `PORT` is overridden per service in the compose file — do not set `PORT` explicitly in `.env.prod`, or you'll re-introduce the collision documented in §9.

---

## 1. Prerequisites

### VPS Specification

| Requirement | Minimum | Recommended |
|---|---|---|
| Provider | Any | Contabo VPS S SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| vCPU | 4 | 6 |
| RAM | 8 GB | 12 GB |
| Disk | 50 GB SSD | 100 GB SSD |
| IPv4 | Required | Static public IP |

> ⚠️ **Self-signed TLS**: Caddy issues a self-signed certificate via `tls internal`. Browsers will show a security warning — click "Advanced → Proceed" for demo purposes. A real domain with `tls <email>` removes this warning.

### Architecture Overview

```
Browser
  │
  ▼ HTTPS :443 (self-signed)
╔══════════════╗
║    Caddy     ║  ← single ingress, TLS termination
╚══════════════╝
  │        │        │
  ▼        ▼        ▼
backend  frontend  langfuse-web
:3001    :3000     :3000
  │                  │
postgres          clickhouse
:5432             :8123
```

All services run inside Docker Compose on the VPS. Only ports 80, 443, and 22 (SSH) are open externally.

### Prerequisites Checklist

- [ ] Contabo VPS provisioned (Ubuntu 22.04 LTS, public IP noted)
- [ ] SSH key pair generated for the `deploy` user
- [ ] GitHub repository cloned/forked
- [ ] `gh` CLI installed locally (for setting secrets)
- [ ] All GitHub Secrets configured (see §2)

---

## 2. Required GitHub Secrets

Configure all secrets via the GitHub repository Settings → Secrets and variables → Actions, or using the `gh` CLI:

```bash
gh secret set SECRET_NAME --body "value"
```

### CI/CD Secrets

| Secret | Value | Notes |
|---|---|---|
| `VPS_HOST` | `185.10.20.30` | VPS public IP |
| `VPS_USER` | `deploy` | SSH username (created by bootstrap) |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH...` | Private key for the deploy user |
| `VPS_PORT` | `22` | SSH port |

### Application Secrets

| Secret | Example / How to generate | Notes |
|---|---|---|
| `GEMINI_API_KEY` | From Google AI Studio | Required for streaming chat |
| `DATABASE_URL` | `postgresql://chatuser:${POSTGRES_PASSWORD}@postgres:5432/chatdemo` | Prisma connection string |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | App Postgres password |
| `COOKIE_SECRET` | `openssl rand -hex 32` | Express session signing key |
| `HOST_HAS_TLS` | `true` | Enables `Secure` cookie flag; set to `true` on VPS |
| `PUBLIC_URL` | `https://185.10.20.30` | VPS public URL — no trailing slash |

### Langfuse Secrets

> ⚠️ **CRITICAL — Write-once values**: `LANGFUSE_SALT` and `LANGFUSE_ENCRYPTION_KEY` are **write-once**. Once any data is written to Langfuse, changing these values **permanently corrupts** the Langfuse database. Generate them ONCE, store them securely, and NEVER rotate.

| Secret | How to generate | Notes |
|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | From Langfuse UI after first boot | Set after §4 Langfuse bootstrap |
| `LANGFUSE_SECRET_KEY` | From Langfuse UI after first boot | Set after §4 Langfuse bootstrap |
| `LANGFUSE_SALT` | `openssl rand -hex 32` | **WRITE-ONCE — never change** |
| `LANGFUSE_ENCRYPTION_KEY` | `openssl rand -hex 32` | **WRITE-ONCE — exactly 64 hex chars** |
| `LANGFUSE_DB_PASSWORD` | `openssl rand -hex 32` | Langfuse Postgres password |
| `LANGFUSE_NEXTAUTH_SECRET` | `openssl rand -hex 32` | NextAuth signing key for Langfuse UI |
| `LANGFUSE_NEXTAUTH_URL` | `https://185.10.20.30/langfuse` | Must match `PUBLIC_URL + /langfuse` |

### Infrastructure Secrets

| Secret | Example | Notes |
|---|---|---|
| `CLICKHOUSE_PASSWORD` | `openssl rand -hex 32` | ClickHouse password for Langfuse |
| `REDIS_PASSWORD` | `openssl rand -hex 32` | Redis password |
| `MINIO_ROOT_USER` | `minio` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | `openssl rand -hex 32` | MinIO admin password |
| `GHCR_TOKEN` | GitHub PAT with `read:packages` | VPS image pull token (NOT the CI push token) |

> **Auto-provided (no setup needed)**: `GITHUB_TOKEN` is injected automatically by GitHub Actions and used for GHCR push in the `build-and-push` job.

**Total user-configured secrets: 22**

---

## 3. First-time VPS Bootstrap

The bootstrap script idempotently configures a fresh Ubuntu 22.04 VPS. It is safe to re-run.

### Step 1: Copy the script to the VPS

From your local machine:

```bash
scp scripts/vps-bootstrap.sh root@<VPS_IP>:/tmp/vps-bootstrap.sh
```

### Step 2: Run the bootstrap script as root

```bash
ssh root@<VPS_IP> \
  'DEPLOY_AUTHORIZED_KEY="ssh-ed25519 AAAA…yourkey… deploy@laptop" bash /tmp/vps-bootstrap.sh'
```

Replace `ssh-ed25519 AAAA…yourkey…` with the **public** key of your deploy SSH key pair.

What the script does (idempotently):
1. Installs `curl`, `ca-certificates`, `gnupg`, `lsb-release`, `ufw`, `git`
2. Installs Docker CE from the official APT repository (skips if already installed)
3. Creates the `deploy` Linux user and adds it to the `docker` group
4. Writes your public key to `~deploy/.ssh/authorized_keys`
5. Hardens SSH: disables root login and password authentication
6. Configures UFW: deny all incoming except ports 22, 80, 443
7. Creates `/opt/stremingchat` owned by `deploy:deploy`
8. Clones the repository to `/opt/stremingchat` (or pulls if already cloned)
9. Creates `/opt/backups` for database backup dumps

### Step 3: Verify the bootstrap

```bash
# After bootstrap completes, root SSH will be disabled — switch to deploy user
ssh deploy@<VPS_IP>

# Verify Docker
docker --version
docker compose version

# Verify UFW
sudo ufw status

# Verify repository
ls /opt/stremingchat
```

> ⚠️ **After bootstrap, root SSH login is disabled.** All subsequent access must use `deploy@<VPS_IP>`.

---

## 4. Langfuse Bootstrap (first deploy only)

Langfuse API keys do not exist until after the Langfuse service has started and you have created an organization and project. Follow this sequence on your VERY FIRST deploy:

### Option A — Guided helper script (recommended)

After the first deploy completes and services are running, SSH into the VPS and run:

```bash
ssh deploy@<VPS_IP>
bash /opt/stremingchat/scripts/first-deploy-runbook.sh
```

The script guides you through each step interactively.

### Option B — Manual steps

**Step 1:** Start the observability stack on the VPS:

```bash
cd /opt/stremingchat
docker compose --profile observability up -d
```

**Step 2:** Wait ~60 seconds for Langfuse to start, then open in browser:

```
https://<VPS_IP>/langfuse/
```

Accept the certificate warning (self-signed TLS).

**Step 3:** In the Langfuse UI:
1. Sign up / create an account
2. Create an Organization (e.g. `stremingchat`)
3. Create a Project (e.g. `production`)
4. Go to **Settings → API Keys → Create new API key**
5. Copy both the **Public Key** and **Secret Key**

**Step 4:** Update GitHub Secrets from your local machine:

```bash
gh secret set LANGFUSE_PUBLIC_KEY --body "pk-lf-…"
gh secret set LANGFUSE_SECRET_KEY --body "sk-lf-…"
```

> ⚠️ **CRITICAL — LANGFUSE_SALT and LANGFUSE_ENCRYPTION_KEY are WRITE-ONCE.**
>
> Generate these values ONCE and never change them:
>
> ```bash
> gh secret set LANGFUSE_SALT           --body "$(openssl rand -hex 32)"
> gh secret set LANGFUSE_ENCRYPTION_KEY --body "$(openssl rand -hex 32)"
> ```
>
> Changing these after data exists **permanently corrupts the Langfuse database**. There is no recovery path.

**Step 5:** Trigger a full redeploy:

```bash
gh workflow run deploy.yml --ref main
# or: git commit --allow-empty -m "chore: trigger redeploy" && git push
```

**Step 6:** Verify a trace appears in Langfuse:
1. Open `https://<VPS_IP>/` in the browser
2. Send a chat message
3. In Langfuse UI, go to **Traces** — a trace should appear within ~30 seconds

---

## 5. UptimeRobot Setup

Free external uptime monitoring with alert on downtime.

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free tier supports up to 50 monitors)
2. Click **Add New Monitor**
3. Configure:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `stremingChatAI`
   - **URL**: `https://<VPS_IP>/api/health`
   - **Monitoring Interval**: `5 minutes`
   - **Alert Contacts**: your email address
4. Click **Create Monitor**

Expected response:
- HTTP Status: `200`
- Body contains: `{"status":"ok"}`

---

## 6. Normal Deploy

Once everything is bootstrapped, all subsequent deploys are automatic:

```bash
git push origin main
```

The `deploy.yml` pipeline runs automatically:

| Job | What it does | ~Time |
|---|---|---|
| `ci` | Lint + typecheck + tests + frontend build | ~1 min |
| `build-and-push` | Docker build (matrix: backend, frontend) + push to GHCR | ~2 min |
| `deploy-ssh` | SSH to VPS, render `.env.prod`, pull images, migrate, `docker compose up -d` | ~1 min |
| `health` | `curl -fsk https://localhost/api/health` on VPS with 120s retry loop | ~10s |
| `lighthouse` | Lighthouse CI audit against `PUBLIC_URL/c/new` (warn-only, never blocks) | ~30s |

Total: **~4–5 minutes** from push to live.

Monitor progress at: `https://github.com/OmarCorr/stremingChatAI/actions`

---

## 7. Rollback Procedure

### Rollback to a specific image tag

Find the SHA of the last known-good deploy from GitHub Actions run history:

```bash
# List locally available images (on VPS):
docker images ghcr.io/omarcorr/stremingchat-backend
docker images ghcr.io/omarcorr/stremingchat-frontend
```

Edit `.env.prod` on the VPS to pin the previous image tags:

```bash
ssh deploy@<VPS_IP>
cd /opt/stremingchat

# Edit .env.prod — replace BACKEND_IMAGE_TAG and FRONTEND_IMAGE_TAG
# Example: BACKEND_IMAGE_TAG=sha-abc1234  FRONTEND_IMAGE_TAG=sha-abc1234
nano .env.prod

# Restart with pinned tags (no image pull needed — old image is local)
docker compose up -d
```

> ⚠️ **Do NOT run `docker system prune`** aggressively — previous SHA-tagged images must remain available locally for rollback.

### Migration rollback

Prisma migrations are **forward-only**. If a migration was applied and needs to be reverted:

```bash
# 1. Diagnose — see which migration failed
docker compose logs migrate

# 2. Mark a failed migration as rolled-back (escape hatch):
docker compose run --rm migrate \
  pnpm --filter @streaming-chat/database prisma migrate resolve --rolled-back <migration_name>

# 3. For data migrations, restore from backup (see §8)
```

---

## 8. Backup Procedure

### Manual backup (recommended before deploys or demos)

```bash
ssh deploy@<VPS_IP>
cd /opt/stremingchat

# Dump to a timestamped file
docker compose exec -T postgres \
  pg_dump -U postgres stremingchat \
  > /opt/backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Or compressed:
docker compose exec -T postgres \
  pg_dump -U postgres stremingchat \
  | gzip > /opt/backups/backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Automated daily backup via cron

Add to `deploy` user's crontab (`crontab -e`):

```cron
0 3 * * * cd /opt/stremingchat && docker compose exec -T postgres pg_dump -U postgres stremingchat | gzip > /opt/backups/backup_$(date +\%Y\%m\%d).sql.gz
```

### Restore from backup

```bash
# Restore uncompressed:
docker compose exec -T postgres \
  psql -U postgres stremingchat < /opt/backups/backup_20241231.sql

# Restore compressed:
gunzip -c /opt/backups/backup_20241231.sql.gz \
  | docker compose exec -T postgres psql -U postgres stremingchat
```

---

## 9. Common Failures

| Symptom | Diagnostic command | Fix |
|---|---|---|
| Caddy fails to start or 502 on all routes | `docker compose logs caddy` | Check `Caddyfile` syntax. Run `docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile`. Ensure `backend` and `frontend` are healthy. |
| `langfuse-worker` restarts in a loop | `docker compose logs langfuse-worker` | ClickHouse likely not healthy yet. Wait 60s and run `docker compose restart langfuse-worker`. |
| `migrate` service fails | `docker compose logs migrate` | Inspect the SQL error. Fix the migration file, push a corrective migration, or use `prisma migrate resolve --rolled-back <name>`. |
| GHCR image pull fails on VPS | `docker login ghcr.io -u <user> -p <GHCR_TOKEN>` | Rotate `GHCR_TOKEN` in GitHub Secrets (PAT must have `read:packages`). Update via `gh secret set GHCR_TOKEN`. |
| Cookie not `Secure` over HTTPS | `curl -k -i -X POST https://localhost/api/sessions \| grep Set-Cookie` | Verify `HOST_HAS_TLS=true` in `/opt/stremingchat/.env.prod`. Redeploy. |
| Backend fails to start | `docker compose logs backend` | Check if `migrate` completed successfully (`docker compose ps migrate`). Ensure `postgres` is healthy. |
| Browser shows TLS certificate warning | Browser screen | Expected for `tls internal` (self-signed). Click "Advanced → Proceed". To remove, set a real domain and use `tls your@email.com` in Caddyfile. |
| Lighthouse CI fails score threshold | GitHub Actions → lighthouse job artifacts | Does not block deploy (job is `continue-on-error: true`). Investigate bundle size or A11y regressions via the uploaded Lighthouse report artifact. |
| Frontend shows blank page / 500 | `docker compose logs frontend` | Check if `backend` is healthy (`docker compose ps`). Check for missing env vars in `.env.prod`. |
| Langfuse UI unreachable at `/langfuse/` | `docker compose logs langfuse-web` | ClickHouse and Postgres must be healthy first. Run `docker compose ps` — all `--profile observability` services must show `Up (healthy)` or `Up`. |
| Port 3000 or 3001 reachable externally | `sudo ufw status` | UFW rule is missing or disabled. Re-run `ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable`. Backend/frontend MUST NOT expose ports to the host. |
| `chat-backend` is permanently unhealthy, `docker inspect` shows `ExitCode 1, Output ""` | `docker exec chat-backend node -e "fetch('http://localhost:3001/api/health').then(r=>console.log(r.status))"` | If the status is **429**, the ThrottlerGuard is rate-limiting `/api/health`. Check every `@SkipThrottle()` in `apps/backend/src/modules/**/*.controller.ts` and make sure it passes BOTH named throttlers explicitly: `@SkipThrottle({ short: true, long: true })`. With named throttlers, `@SkipThrottle()` with no args is a silent no-op. See `docs/ARCHITECTURE.md § 7`. |
| `fetch failed` when testing `/api/health` on the expected port from inside the container | `docker exec chat-backend node -e "console.log('PORT='+process.env.PORT)"` | The backend isn't listening there. Verify `PORT` isn't overridden in `.env.prod`; the compose file overrides it to `3001` for backend. If `PORT=3000` leaks in, the backend and frontend collide. |

---

## 10. Post-Deploy Performance Checks

### Verify stats query (closes S3)

After generating at least a few real conversations on the deployed VPS, connect to Postgres and run `EXPLAIN ANALYZE` on the stats query:

```bash
ssh deploy@<VPS_IP>
cd /opt/stremingchat

docker compose exec postgres psql -U postgres stremingchat
```

```sql
-- Run the stats query with EXPLAIN ANALYZE to check index usage
EXPLAIN ANALYZE
  SELECT
    c.id            AS conversation_id,
    c."createdAt",
    COUNT(m.id)     AS message_count,
    MAX(m."createdAt") AS last_message_at
  FROM "Conversation" c
  LEFT JOIN "Message" m ON m."conversationId" = c.id
  GROUP BY c.id, c."createdAt"
  ORDER BY c."createdAt" DESC
  LIMIT 50;
```

Expected: `Seq Scan` is acceptable at demo scale. If the table grows beyond 10,000 rows, add an index on `"Message"."conversationId"`.

---

## 11. Frontend Re-render Profiling

### Check for per-token re-renders in MessageList (closes W4)

1. Open the deployed app in Chrome
2. Open DevTools → **Performance** tab
3. Click **Record** and send a chat message
4. Record for ~10 seconds while tokens stream in
5. Stop recording
6. Look for long tasks (>50ms, shown as red in the flame chart) in the `MessageList` component

If long tasks are found:
- Open `apps/frontend/src/components/MessageList.tsx`
- Replace the scroll-trigger `useState` with a `useRef` — see the `useAutoScroll` refactor pattern documented in the frontend-chat change archive
- Use `React.memo` on individual `MessageBubble` components to prevent sibling re-renders during streaming

---

## 12. Tear Down

To fully tear down the stack on the VPS:

```bash
ssh deploy@<VPS_IP>
cd /opt/stremingchat

# Stop all containers and remove named volumes (⚠️ deletes all data)
docker compose --profile observability --profile apps down -v

# Remove images (optional)
docker images | grep stremingchat | awk '{print $3}' | xargs docker rmi -f
```

To decommission the VPS:
1. Take a Contabo control panel snapshot for archival
2. Rotate / delete all GitHub Secrets to prevent accidental re-deploy
3. Destroy the VPS from the Contabo control panel
