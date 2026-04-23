#!/usr/bin/env bash
# scripts/vps-bootstrap.sh
# Idempotent bootstrap of a fresh Ubuntu 22.04 VPS for stremingChatAI.
# Safe to re-run: guards protect every step from running twice.
#
# Usage (as root on first SSH access):
#   DEPLOY_AUTHORIZED_KEY="ssh-ed25519 AAAA… deploy@laptop" bash /tmp/vps-bootstrap.sh
#
# Optional flags:
#   --dry-run   Print commands without executing them
#   --verbose   Enable set -x tracing (or set VERBOSE=1)
set -euo pipefail

# ─── Flags ───────────────────────────────────────────────────────────────────
DRY_RUN=0
VERBOSE="${VERBOSE:-0}"

for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=1 ;;
    --verbose)  VERBOSE=1 ;;
  esac
done

[[ "$VERBOSE" == "1" ]] && set -x

# ─── Helpers ─────────────────────────────────────────────────────────────────
info()  { echo "[INFO]  $*"; }
ok()    { echo "[OK]    $*"; }
warn()  { echo "[WARN]  $*" >&2; }
fatal() { echo "[FATAL] $*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[DRY-RUN] $*"
  else
    "$@"
  fi
}

# ─── Root check ──────────────────────────────────────────────────────────────
[[ "$EUID" -eq 0 ]] || fatal "This script must be run as root. Try: sudo bash $0 $*"

# ─── Config ──────────────────────────────────────────────────────────────────
DEPLOY_USER="deploy"
REPO_URL="https://github.com/OmarCorr/stremingChatAI.git"
REPO_PATH="/opt/stremingchat"
AUTHORIZED_KEY="${DEPLOY_AUTHORIZED_KEY:-}"

# ─── Step 1: System update + essential packages ───────────────────────────────
info "Step 1: Updating package index and installing essentials..."
run apt-get update -qq
run apt-get install -y -qq \
  curl \
  ca-certificates \
  gnupg \
  lsb-release \
  ufw \
  git
ok "Essential packages installed."

# ─── Step 2: Install Docker CE from official APT repo ────────────────────────
install_docker() {
  info "Adding Docker APT repository..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  run apt-get update -qq
  run apt-get install -y -qq \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin
  ok "Docker CE installed."
}

info "Step 2: Checking Docker installation..."
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker already installed ($(docker --version)). Skipping."
else
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[DRY-RUN] Would install Docker CE from official APT repository."
  else
    install_docker
  fi
fi

# ─── Step 3: Create deploy user with docker group ────────────────────────────
info "Step 3: Creating deploy user..."
if id "$DEPLOY_USER" >/dev/null 2>&1; then
  ok "User '$DEPLOY_USER' already exists. Skipping useradd."
else
  run useradd -m -s /bin/bash "$DEPLOY_USER"
  ok "User '$DEPLOY_USER' created."
fi

run usermod -aG docker "$DEPLOY_USER"
ok "User '$DEPLOY_USER' added to docker group."

# ─── Step 4: Configure SSH authorized_keys for deploy user ───────────────────
info "Step 4: Configuring SSH access for deploy user..."
DEPLOY_HOME="/home/${DEPLOY_USER}"
DEPLOY_SSH_DIR="${DEPLOY_HOME}/.ssh"

if [[ -n "$AUTHORIZED_KEY" ]]; then
  if [[ "$DRY_RUN" != "1" ]]; then
    run mkdir -p "$DEPLOY_SSH_DIR"
    # Append key only if not already present
    if ! grep -qF "$AUTHORIZED_KEY" "${DEPLOY_SSH_DIR}/authorized_keys" 2>/dev/null; then
      echo "$AUTHORIZED_KEY" >> "${DEPLOY_SSH_DIR}/authorized_keys"
      ok "Authorized key added to ${DEPLOY_SSH_DIR}/authorized_keys."
    else
      ok "Authorized key already present. Skipping."
    fi
    chmod 700 "$DEPLOY_SSH_DIR"
    chmod 600 "${DEPLOY_SSH_DIR}/authorized_keys"
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$DEPLOY_SSH_DIR"
  else
    echo "[DRY-RUN] Would write DEPLOY_AUTHORIZED_KEY to ${DEPLOY_SSH_DIR}/authorized_keys"
  fi
else
  warn "DEPLOY_AUTHORIZED_KEY is not set. SSH key NOT configured for '${DEPLOY_USER}'."
  warn "You must manually add a public key to ${DEPLOY_SSH_DIR}/authorized_keys before disabling root login."
fi

# ─── Step 5: Harden SSH (disable root login + password auth) ─────────────────
info "Step 5: Hardening SSH configuration..."
SSHD_HARDENING="/etc/ssh/sshd_config.d/hardening.conf"

if [[ "$DRY_RUN" != "1" ]]; then
  # Write to a drop-in file to avoid patching sshd_config directly
  cat > "$SSHD_HARDENING" <<'EOF'
# Managed by vps-bootstrap.sh — do not edit manually
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
EOF
  chmod 644 "$SSHD_HARDENING"

  # Ensure IncludeDir is enabled in the main sshd_config (Ubuntu 22.04 includes it by default)
  if ! grep -q "^Include /etc/ssh/sshd_config.d/\*.conf" /etc/ssh/sshd_config 2>/dev/null; then
    echo "Include /etc/ssh/sshd_config.d/*.conf" >> /etc/ssh/sshd_config
  fi

  run systemctl reload sshd
  ok "SSH hardened: root login and password auth disabled."
else
  echo "[DRY-RUN] Would write ${SSHD_HARDENING} and reload sshd."
fi

# ─── Step 6: Configure UFW firewall ──────────────────────────────────────────
info "Step 6: Configuring UFW firewall..."
run ufw default deny incoming
run ufw default allow outgoing
run ufw allow 22/tcp
run ufw allow 80/tcp
run ufw allow 443/tcp
# --force suppresses interactive prompt
run ufw --force enable
ok "UFW configured: DENY incoming (except 22/80/443), ALLOW outgoing."

# ─── Step 7: Create /opt/stremingchat owned by deploy:deploy ─────────────────
info "Step 7: Creating application directory..."
if [[ "$DRY_RUN" != "1" ]]; then
  mkdir -p "$REPO_PATH"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "$REPO_PATH"
  ok "Directory ${REPO_PATH} ready."
else
  echo "[DRY-RUN] Would create ${REPO_PATH} owned by ${DEPLOY_USER}:${DEPLOY_USER}."
fi

# ─── Step 8: Clone or pull repository ────────────────────────────────────────
info "Step 8: Cloning repository..."
if [[ "$DRY_RUN" != "1" ]]; then
  if [[ -d "${REPO_PATH}/.git" ]]; then
    ok "Repository already cloned. Pulling latest..."
    run sudo -u "$DEPLOY_USER" git -C "$REPO_PATH" pull --ff-only
  else
    run sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$REPO_PATH"
    ok "Repository cloned to ${REPO_PATH}."
  fi
else
  echo "[DRY-RUN] Would clone ${REPO_URL} → ${REPO_PATH} (or pull if already cloned)."
fi

# ─── Step 9: Pre-create bind-mount directories ───────────────────────────────
info "Step 9: Pre-creating Docker bind-mount directories..."
if [[ "$DRY_RUN" != "1" ]]; then
  mkdir -p /opt/backups
  chown "${DEPLOY_USER}:${DEPLOY_USER}" /opt/backups
  ok "Bind-mount and backup directories ready."
else
  echo "[DRY-RUN] Would create /opt/backups owned by ${DEPLOY_USER}:${DEPLOY_USER}."
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
VPS_IP="$(hostname -I | awk '{print $1}')"
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Bootstrap complete — summary                   ║"
echo "╠════════════════════════════════════════════════════════════╣"
printf "║  VPS IP:          %-41s║\n" "${VPS_IP}"
printf "║  Deploy user:     %-41s║\n" "${DEPLOY_USER} (home: ${DEPLOY_HOME})"
printf "║  Repo path:       %-41s║\n" "${REPO_PATH}"
printf "║  Docker:          %-41s║\n" "$(docker --version 2>/dev/null | cut -d' ' -f1-3 || echo 'installed')"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Next steps:                                                ║"
echo "║  1. Verify SSH as deploy:  ssh deploy@${VPS_IP}            ║"
echo "║  2. Add GitHub Secrets (see docs/DEPLOY.md)                ║"
echo "║  3. Push to main to trigger first deploy                   ║"
echo "║  4. Run scripts/first-deploy-runbook.sh for Langfuse setup ║"
echo "╚════════════════════════════════════════════════════════════╝"
