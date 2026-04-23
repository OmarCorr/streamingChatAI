#!/usr/bin/env bash
# scripts/first-deploy-runbook.sh
# Guided first-deploy runbook for Langfuse bootstrap.
# Run ON THE VPS after the first deploy.yml run has started services.
#
# Usage: bash /opt/stremingchat/scripts/first-deploy-runbook.sh
set -euo pipefail

VPS_IP="$(hostname -I | awk '{print $1}')"

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║           stremingChatAI — First Deploy Runbook                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

echo "═══ Step 1: Start observability profile ═══════════════════════════"
echo ""
echo "  cd /opt/stremingchat"
echo "  docker compose --profile observability up -d"
echo ""
echo "Press ENTER once done..."
read -r

echo ""
echo "═══ Step 2: Wait for Langfuse to be reachable (~60s) ══════════════"
echo ""
echo "Polling https://${VPS_IP}/langfuse — waiting for HTTP 200..."
max_attempts=30
attempt=0
until curl -sk --max-time 5 "https://${VPS_IP}/langfuse" -o /dev/null -w "%{http_code}" 2>/dev/null | grep -q "200\|30[12]"; do
  attempt=$((attempt + 1))
  if [[ $attempt -ge $max_attempts ]]; then
    echo ""
    echo "WARNING: Langfuse did not respond after ${max_attempts} attempts."
    echo "Check status with: docker compose logs langfuse-web"
    break
  fi
  printf "  [%02d/%02d] Not ready yet, retrying in 5s...\r" "$attempt" "$max_attempts"
  sleep 5
done
echo ""
echo "  Langfuse is reachable (or timed out — check logs if so)."

echo ""
echo "═══ Step 3: Open Langfuse UI in browser ═══════════════════════════"
echo ""
echo "  Open in your browser (accept the self-signed certificate warning):"
echo ""
echo "    https://${VPS_IP}/langfuse/"
echo ""
echo "  ⚠️  IMPORTANT: Accept the browser certificate warning before proceeding."
echo "  (Click 'Advanced' → 'Proceed to ${VPS_IP} (unsafe)')"
echo ""
echo "Press ENTER once you have the Langfuse UI open..."
read -r

echo ""
echo "═══ Step 4: Create organization and project ════════════════════════"
echo ""
echo "  In the Langfuse UI:"
echo "  1. Click 'Sign Up' → create an account"
echo "  2. Create an Organization (any name, e.g. 'stremingchat')"
echo "  3. Create a Project (any name, e.g. 'production')"
echo "  4. Go to Settings → API Keys → Create new API key"
echo "  5. Copy BOTH the Public Key and Secret Key"
echo ""
echo "Press ENTER once you have both API keys..."
read -r

echo ""
echo "═══ Step 5: Update GitHub Secrets ═════════════════════════════════"
echo ""
echo "  Run the following commands from your LOCAL machine (requires 'gh' CLI):"
echo ""
echo "    gh secret set LANGFUSE_PUBLIC_KEY --body \"<paste Public Key here>\""
echo "    gh secret set LANGFUSE_SECRET_KEY --body \"<paste Secret Key here>\""
echo ""
echo "  ⚠️  WARNING: LANGFUSE_SALT and LANGFUSE_ENCRYPTION_KEY are WRITE-ONCE."
echo "              If you have NOT set them yet, generate them now:"
echo ""
echo "    gh secret set LANGFUSE_SALT          --body \"\$(openssl rand -hex 32)\""
echo "    gh secret set LANGFUSE_ENCRYPTION_KEY --body \"\$(openssl rand -hex 32)\""
echo ""
echo "  CRITICAL: After ANY data is written to Langfuse, NEVER change LANGFUSE_SALT"
echo "            or LANGFUSE_ENCRYPTION_KEY. Doing so CORRUPTS the Langfuse database."
echo ""
echo "Press ENTER once GitHub Secrets are updated..."
read -r

echo ""
echo "═══ Step 6: Trigger full redeploy ══════════════════════════════════"
echo ""
echo "  Push any commit to main — or trigger the workflow manually:"
echo ""
echo "    gh workflow run deploy.yml --ref main"
echo ""
echo "  The deploy.yml pipeline will now render .env.prod with the new"
echo "  Langfuse keys and restart all services."
echo ""
echo "  Monitor progress at:"
echo "    https://github.com/OmarCorr/stremingChatAI/actions"
echo ""

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Runbook complete. After the redeploy finishes, verify:          ║"
echo "║  • App loads at https://${VPS_IP}/           (expect TLS warn)  ║"
echo "║  • Health endpoint: curl -k https://${VPS_IP}/api/health        ║"
echo "║  • Langfuse traces appear after first chat message               ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
