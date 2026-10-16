#!/bin/bash
# ============================================================================
# AniChin — GitHub Secrets Setup Script for CI/CD Auto-Deploy
#
# Sets all required GitHub Secrets for production deployment via GitHub Actions.
#
# Prerequisites:
#   1. GitHub CLI installed: https://cli.github.com/
#   2. Authenticated: gh auth login
#   3. Inside the AniChin git repo with remote origin set
#
# Usage:
#   ./scripts/setup-github-secrets.sh
#
# What it sets:
#   - NEXTAUTH_SECRET, NEXTAUTH_URL
#   - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
#   - OAUTH_GITHUB_CLIENT_ID, OAUTH_GITHUB_CLIENT_SECRET (GitHub forbids secret names starting with GITHUB_)
#   - TWO_FACTOR_ENCRYPTION_KEY
#   - SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM
#   - POSTGRES_PASSWORD (role migrasi/owner, hak DDL)
#   - POSTGRES_APP_PASSWORD (role aplikasi DML-only — audit F-16)
#   - DATABASE_URL (constructed from POSTGRES_PASSWORD)
#   - REDIS_URL
#   - SITE_DOMAIN
#   - DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_HOST_KEY
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Symbols
CHECK="${GREEN}✓${NC}"
CROSS="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"
INFO="${BLUE}ℹ${NC}"

print_header() {
    echo ""
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${PURPLE}  ${1}${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ============================================================
print_header "AniChin — GitHub Secrets Setup"
# ============================================================
echo ""
echo "This script sets all required GitHub Secrets for CI/CD auto-deploy."
echo ""

# ── Check prerequisites ─────────────────────────────────────
if ! command -v gh &> /dev/null; then
    echo -e "${CROSS} GitHub CLI (gh) not installed"
    echo ""
    echo "Install from: https://cli.github.com/"
    echo "  macOS:  brew install gh"
    echo "  Linux:  sudo apt install gh  OR  https://github.com/cli/cli/releases"
    echo "  Windows: winget install --id GitHub.cli"
    echo ""
    echo "After install: gh auth login"
    exit 1
fi
echo -e "${CHECK} GitHub CLI installed"

# Check auth
if ! gh auth status &> /dev/null; then
    echo -e "${CROSS} Not authenticated with GitHub"
    echo ""
    echo "Run: gh auth login"
    echo "Choose: GitHub.com → HTTPS → Login with browser"
    exit 1
fi
echo -e "${CHECK} Authenticated with GitHub"
gh auth status | grep "Logged in" | head -1 | xargs echo "  "

# Check we're in a git repo with remote
REPO_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
if [ -z "$REPO_URL" ]; then
    echo -e "${CROSS} No git remote 'origin' found"
    echo ""
    echo "Are you in the AniChin repo? Set remote with:"
    echo "  git remote add origin https://github.com/your-username/anichin.git"
    exit 1
fi
echo -e "${CHECK} Git repo: ${REPO_URL#https://github.com/}"

# ============================================================
print_header "Step 1: Generate Crypto Secrets"
# ============================================================
echo ""
echo "Generating secure random secrets..."
echo ""

NEXTAUTH_SECRET=$(openssl rand -base64 32)
TWO_FACTOR_KEY=$(openssl rand -hex 32)  # wajib 64 hex char (AES-256-GCM, lihat src/lib/two-factor.ts)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
# F-16: password role aplikasi (DML saja) — BEDA dari role migrasi/owner.
POSTGRES_APP_PASSWORD=$(openssl rand -hex 32)

echo -e "${CHECK} NEXTAUTH_SECRET (44 chars): ${NEXTAUTH_SECRET:0:8}****"
echo -e "${CHECK} TWO_FACTOR_ENCRYPTION_KEY (64 hex chars): ${TWO_FACTOR_KEY:0:8}****"
echo -e "${CHECK} POSTGRES_PASSWORD (64 hex chars): ${POSTGRES_PASSWORD:0:8}****"
echo -e "${CHECK} POSTGRES_APP_PASSWORD (64 hex chars): ${POSTGRES_APP_PASSWORD:0:8}****"

# Save to backup file for reference
SECRETS_BACKUP="${HOME}/anichin-secrets-backup-$(date +%Y%m%d-%H%M%S).txt"
cat > "$SECRETS_BACKUP" << EOF
# AniChin Secrets Backup — $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ⚠️ STORE SECURELY — delete this file after saving to password manager

NEXTAUTH_SECRET=$NEXTAUTH_SECRET
TWO_FACTOR_ENCRYPTION_KEY=$TWO_FACTOR_KEY
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_APP_PASSWORD=$POSTGRES_APP_PASSWORD
EOF
chmod 600 "$SECRETS_BACKUP"
echo ""
echo -e "${WARN} Backup saved to: $SECRETS_BACKUP"
echo -e "  Store these in your password manager IMMEDIATELY."
echo -e "  Then delete the backup file: rm $SECRETS_BACKUP"
echo ""

# ============================================================
print_header "Step 2: Collect Site Configuration"
# ============================================================
echo ""
read -p "Production domain (e.g., anichin.id): " SITE_DOMAIN
SITE_DOMAIN="${SITE_DOMAIN:-anichin.id}"
NEXTAUTH_URL="https://$SITE_DOMAIN"
echo -e "${CHECK} NEXTAUTH_URL: $NEXTAUTH_URL"
echo ""

# ============================================================
print_header "Step 3: Collect OAuth Credentials"
# ============================================================
echo ""
echo "Google OAuth (from https://console.cloud.google.com/apis/credentials):"
echo ""
read -p "  GOOGLE_CLIENT_ID (.apps.googleusercontent.com): " GOOGLE_CLIENT_ID
read -s -p "  GOOGLE_CLIENT_SECRET (GOCSPX-...): " GOOGLE_CLIENT_SECRET
echo ""
echo ""
echo "GitHub OAuth (from https://github.com/settings/developers):"
echo ""
read -p "  GITHUB_CLIENT_ID (Iv1....): " GITHUB_CLIENT_ID
read -s -p "  GITHUB_CLIENT_SECRET (40-char hex): " GITHUB_CLIENT_SECRET
echo ""

# Validate formats
echo ""
echo "Validating formats..."
VALID=true
if [[ ! "$GOOGLE_CLIENT_ID" =~ \.apps\.googleusercontent\.com$ ]]; then
    echo -e "${WARN} GOOGLE_CLIENT_ID format unusual (expected .apps.googleusercontent.com suffix)"
    VALID=false
fi
if [[ ! "$GOOGLE_CLIENT_SECRET" =~ ^GOCSPX- ]]; then
    echo -e "${WARN} GOOGLE_CLIENT_SECRET format unusual (expected GOCSPX- prefix)"
    VALID=false
fi
if [ ${#GITHUB_CLIENT_SECRET} -lt 32 ]; then
    echo -e "${WARN} GITHUB_CLIENT_SECRET looks short (${#GITHUB_CLIENT_SECRET} chars, expected ≥32)"
    VALID=false
fi
if $VALID; then
    echo -e "${CHECK} All formats look valid"
fi

# ============================================================
print_header "Step 3b: Collect required SMTP credentials"
# ============================================================
echo ""
echo "SMTP is required for production email verification and password reset."
read -p "  SMTP host (e.g., smtp.sendgrid.net): " SMTP_HOST
read -p "  SMTP port [587]: " SMTP_PORT
SMTP_PORT="${SMTP_PORT:-587}"
read -p "  Implicit TLS on port 465? (true/false) [false]: " SMTP_SECURE
SMTP_SECURE="${SMTP_SECURE:-false}"
read -p "  SMTP username/API key: " SMTP_USER
read -s -p "  SMTP password/API secret: " SMTP_PASS
echo ""
read -p "  From address [no-reply@$SITE_DOMAIN]: " SMTP_FROM
SMTP_FROM="${SMTP_FROM:-no-reply@$SITE_DOMAIN}"
if [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ ${#SMTP_PASS} -lt 16 ]; then
    echo -e "${CROSS} SMTP host, username, and a password of at least 16 characters are required."
    exit 1
fi
if [[ ! "$SMTP_PORT" =~ ^[0-9]{1,5}$ ]] || [ "$SMTP_PORT" -lt 1 ] || [ "$SMTP_PORT" -gt 65535 ]; then
    echo -e "${CROSS} SMTP_PORT must be a number from 1 to 65535."
    exit 1
fi
if [[ ! "$SMTP_SECURE" =~ ^(true|false)$ ]]; then
    echo -e "${CROSS} SMTP_SECURE must be true or false."
    exit 1
fi

# ============================================================
print_header "Step 4: Collect Server Deploy Credentials"
# ============================================================
echo ""
echo "SSH deploy credentials (for GitHub Actions to SSH into your server):"
echo ""
read -p "  Deploy server IP/hostname: " DEPLOY_HOST
read -p "  SSH user (e.g., deploy): " DEPLOY_USER
read -p "  Path to SSH private key file: " SSH_KEY_PATH

# F-15: host key SSH yang dipin untuk pipeline (secret DEPLOY_HOST_KEY).
# ssh-keyscan di sini hanya ALAT BANTU: fingerprint yang ditampilkan WAJIB
# dicocokkan dengan kunci server sebenarnya sebelum disimpan — kalau tidak,
# trust-on-first-use hanya berpindah dari runner ke laptop ini.
SSH_HOST_KEY=""
if [ -n "${DEPLOY_HOST:-}" ] && command -v ssh-keyscan >/dev/null 2>&1; then
    echo ""
    echo "Mengambil host key dari $DEPLOY_HOST (ssh-keyscan)…"
    SSH_HOST_KEY=$(ssh-keyscan -H "$DEPLOY_HOST" 2>/dev/null || true)
    if [ -n "$SSH_HOST_KEY" ]; then
        HOST_KEY_TMP=$(mktemp)
        printf '%s\n' "$SSH_HOST_KEY" > "$HOST_KEY_TMP"
        echo "Fingerprint kunci yang terbaca:"
        ssh-keygen -lf "$HOST_KEY_TMP" 2>/dev/null || true
        rm -f "$HOST_KEY_TMP"
        echo -e "${WARN} Cocokkan fingerprint di atas dengan kunci server sebenarnya"
        echo -e "${WARN} (panel hosting / konsol / 'ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub' di server)."
        read -p "  Simpan kunci ini sebagai secret DEPLOY_HOST_KEY? (y/N): " SAVE_HOST_KEY
        if [[ ! "${SAVE_HOST_KEY:-N}" =~ ^[Yy]$ ]]; then
            SSH_HOST_KEY=""
            echo -e "${WARN} Dilewati — isi DEPLOY_HOST_KEY manual sebelum men-deploy, kalau tidak workflow akan berhenti di langkah 'Siapkan SSH'."
        fi
    else
        echo -e "${WARN} ssh-keyscan tidak mengembalikan kunci — DEPLOY_HOST_KEY dilewati."
    fi
fi

if [ ! -f "$SSH_KEY_PATH" ]; then
    echo -e "${CROSS} SSH key file not found: $SSH_KEY_PATH"
    echo ""
    echo "Generate one with:"
    echo "  ssh-keygen -t ed25519 -f ~/.ssh/anichin_deploy -C \"github-actions-deploy\""
    echo "  cat ~/.ssh/anichin_deploy.pub >> ~/.ssh/authorized_keys  # on server"
    exit 1
fi
echo -e "${CHECK} SSH key found: $SSH_KEY_PATH"
SSH_KEY_CONTENT=$(cat "$SSH_KEY_PATH")

# Optional: Registry config
read -p "  Use container registry? (y/N): " USE_REGISTRY
if [[ "${USE_REGISTRY:-N}" =~ ^[Yy]$ ]]; then
    read -p "  Registry URL (e.g., ghcr.io/your-username): " REGISTRY
    read -p "  Registry username: " REGISTRY_USER
    read -s -p "  Registry password/token: " REGISTRY_PASS
    echo ""
fi

# Optional: Slack webhook
read -p "  Slack webhook URL for deploy notifications? (leave empty to skip): " SLACK_WEBHOOK

# ============================================================
print_header "Step 5: Confirm and Set GitHub Secrets"
# ============================================================
echo ""
echo "About to set the following GitHub Secrets:"
echo ""
echo "  Authentication:"
echo "    NEXTAUTH_SECRET             = ${NEXTAUTH_SECRET:0:8}****"
echo "    NEXTAUTH_URL                = $NEXTAUTH_URL"
echo "    TWO_FACTOR_ENCRYPTION_KEY   = ${TWO_FACTOR_KEY:0:8}****"
echo ""
echo "  Email verification (required):"
echo "    SMTP_HOST                   = $SMTP_HOST"
echo "    SMTP_PORT                   = $SMTP_PORT"
echo "    SMTP_SECURE                 = $SMTP_SECURE"
echo "    SMTP_USER                   = $SMTP_USER"
echo "    SMTP_PASS                   = [set; value hidden]"
echo "    SMTP_FROM                   = $SMTP_FROM"
echo ""
echo "  OAuth:"
echo "    GOOGLE_CLIENT_ID            = ${GOOGLE_CLIENT_ID:0:30}..."
echo "    GOOGLE_CLIENT_SECRET        = ${GOOGLE_CLIENT_SECRET:0:8}****"
echo "    OAUTH_GITHUB_CLIENT_ID      = ${GITHUB_CLIENT_ID:0:20}..."
echo "    OAUTH_GITHUB_CLIENT_SECRET  = ${GITHUB_CLIENT_SECRET:0:8}****"
echo ""
echo "  Database:"
echo "    POSTGRES_PASSWORD           = ${POSTGRES_PASSWORD:0:8}**** (role migrasi/owner)"
echo "    POSTGRES_APP_PASSWORD       = ${POSTGRES_APP_PASSWORD:0:8}**** (role aplikasi, DML saja)"
echo "    DATABASE_URL                = postgresql://anichin:****@db:5432/anichin?schema=public"
echo "    REDIS_URL                   = redis://redis:6379"
echo ""
echo "  Deploy:"
echo "    DEPLOY_HOST                 = $DEPLOY_HOST"
echo "    DEPLOY_USER                 = $DEPLOY_USER"
echo "    DEPLOY_SSH_KEY              = [SSH private key contents]"
echo "    DEPLOY_HOST_KEY             = [known_hosts entry for $DEPLOY_HOST]"
echo "    SITE_DOMAIN                 = $SITE_DOMAIN"
[ -n "${REGISTRY:-}" ] && echo "    REGISTRY                    = $REGISTRY"
[ -n "${SLACK_WEBHOOK:-}" ] && echo "    SLACK_WEBHOOK               = [set]"
echo ""
read -p "Proceed? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# ============================================================
print_header "Step 6: Setting GitHub Secrets"
# ============================================================

set_secret() {
    local name=$1
    local value=$2
    printf "  Setting %-30s " "$name"
    if printf '%s' "$value" | gh secret set "$name" 2>/dev/null; then
        echo -e "${CHECK} Set"
    else
        echo -e "${CROSS} Failed"
        return 1
    fi
}

# Auth
set_secret "NEXTAUTH_SECRET" "$NEXTAUTH_SECRET"
set_secret "NEXTAUTH_URL" "$NEXTAUTH_URL"
set_secret "TWO_FACTOR_ENCRYPTION_KEY" "$TWO_FACTOR_KEY"

# SMTP (required for verified account registration and password reset)
set_secret "SMTP_HOST" "$SMTP_HOST"
set_secret "SMTP_PORT" "$SMTP_PORT"
set_secret "SMTP_SECURE" "$SMTP_SECURE"
set_secret "SMTP_USER" "$SMTP_USER"
set_secret "SMTP_PASS" "$SMTP_PASS"
set_secret "SMTP_FROM" "$SMTP_FROM"

# OAuth
set_secret "GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID"
set_secret "GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET"
set_secret "OAUTH_GITHUB_CLIENT_ID" "$GITHUB_CLIENT_ID"
set_secret "OAUTH_GITHUB_CLIENT_SECRET" "$GITHUB_CLIENT_SECRET"

# Database (constructed)
# Catatan: pipeline deploy TIDAK memakai secret DATABASE_URL (compose membentuk
# URL-nya sendiri). Yang disimpan di sini adalah URL ROLE MIGRASI/owner — jangan
# dipakai untuk menjalankan aplikasi, karena service `web` memakai role DML-only
# `anichin_app` lewat POSTGRES_APP_PASSWORD (audit F-16).
DATABASE_URL="postgresql://anichin:${POSTGRES_PASSWORD}@db:5432/anichin?schema=public"
set_secret "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
set_secret "POSTGRES_APP_PASSWORD" "$POSTGRES_APP_PASSWORD"
set_secret "DATABASE_URL" "$DATABASE_URL"
set_secret "REDIS_URL" "redis://redis:6379"

# Deploy
set_secret "DEPLOY_HOST" "$DEPLOY_HOST"
set_secret "DEPLOY_USER" "$DEPLOY_USER"
set_secret "DEPLOY_SSH_KEY" "$SSH_KEY_CONTENT"

# F-15: host key SSH yang dipin. Diambil dari server memakai ssh-keyscan, TETAPI
# fingerprint-nya wajib dicocokkan dengan kunci server sebenarnya (panel hosting /
# konsol / `ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub` di server) sebelum dipakai —
# kalau tidak, keyscan ini hanya memindahkan masalah TOFU dari runner ke laptop.
if [ -n "${SSH_HOST_KEY:-}" ]; then
    set_secret "DEPLOY_HOST_KEY" "$SSH_HOST_KEY"
else
    echo -e "  ${WARN} DEPLOY_HOST_KEY dilewati — jalankan: ssh-keyscan -H $DEPLOY_HOST > deploy_host_key.txt, cocokkan fingerprint-nya, lalu: gh secret set DEPLOY_HOST_KEY < deploy_host_key.txt"
fi
set_secret "SITE_DOMAIN" "$SITE_DOMAIN"

# Optional
if [ -n "${REGISTRY:-}" ]; then
    set_secret "REGISTRY" "$REGISTRY"
    set_secret "REGISTRY_USER" "$REGISTRY_USER"
    set_secret "REGISTRY_PASS" "$REGISTRY_PASS"
fi
if [ -n "${SLACK_WEBHOOK:-}" ]; then
    set_secret "SLACK_WEBHOOK" "$SLACK_WEBHOOK"
fi

# ============================================================
print_header "✅ Setup Complete!"
# ============================================================
echo ""
echo "All GitHub Secrets have been set. CI/CD pipeline is ready."
echo ""
echo "Next steps:"
echo -e "  ${CYAN}→${NC} Push to main branch to trigger deploy:"
echo "    git push origin main"
echo ""
echo -e "  ${CYAN}→${NC} Or trigger manually:"
echo "    gh workflow run deploy.yml -f environment=production"
echo ""
echo -e "  ${CYAN}→${NC} Watch deploy progress:"
echo "    gh run watch"
echo ""
echo -e "  ${CYAN}→${NC} Verify after deploy:"
echo "    curl https://$SITE_DOMAIN/api/health"
echo "    curl https://$SITE_DOMAIN/api/auth/oauth-providers"
echo ""
echo -e "${WARN} Remember to:"
echo "  - Delete backup file: rm $SECRETS_BACKUP"
echo "  - Save secrets to password manager"
echo "  - Test SSH from local: ssh -i ~/.ssh/anichin_deploy $DEPLOY_USER@$DEPLOY_HOST"
echo ""
echo -e "${BLUE}Full docs:${NC} docs/PRODUCTION-OAUTH.md"
echo -e "${BLUE}Deploy guide:${NC} docs/DEPLOYMENT.md"
