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
#   - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
#   - TWO_FACTOR_ENCRYPTION_KEY
#   - POSTGRES_PASSWORD
#   - DATABASE_URL (constructed from POSTGRES_PASSWORD)
#   - REDIS_URL
#   - SITE_DOMAIN
#   - DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY
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
TWO_FACTOR_KEY=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)

echo -e "${CHECK} NEXTAUTH_SECRET (44 chars): ${NEXTAUTH_SECRET:0:8}****"
echo -e "${CHECK} TWO_FACTOR_ENCRYPTION_KEY (44 chars): ${TWO_FACTOR_KEY:0:8}****"
echo -e "${CHECK} POSTGRES_PASSWORD (32 chars): ${POSTGRES_PASSWORD:0:8}****"

# Save to backup file for reference
SECRETS_BACKUP="${HOME}/anichin-secrets-backup-$(date +%Y%m%d-%H%M%S).txt"
cat > "$SECRETS_BACKUP" << EOF
# AniChin Secrets Backup — $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ⚠️ STORE SECURELY — delete this file after saving to password manager

NEXTAUTH_SECRET=$NEXTAUTH_SECRET
TWO_FACTOR_ENCRYPTION_KEY=$TWO_FACTOR_KEY
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
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
print_header "Step 4: Collect Server Deploy Credentials"
# ============================================================
echo ""
echo "SSH deploy credentials (for GitHub Actions to SSH into your server):"
echo ""
read -p "  Deploy server IP/hostname: " DEPLOY_HOST
read -p "  SSH user (e.g., deploy): " DEPLOY_USER
read -p "  Path to SSH private key file: " SSH_KEY_PATH

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
echo "  OAuth:"
echo "    GOOGLE_CLIENT_ID            = ${GOOGLE_CLIENT_ID:0:30}..."
echo "    GOOGLE_CLIENT_SECRET        = ${GOOGLE_CLIENT_SECRET:0:8}****"
echo "    GITHUB_CLIENT_ID            = ${GITHUB_CLIENT_ID:0:20}..."
echo "    GITHUB_CLIENT_SECRET        = ${GITHUB_CLIENT_SECRET:0:8}****"
echo ""
echo "  Database:"
echo "    POSTGRES_PASSWORD           = ${POSTGRES_PASSWORD:0:8}****"
echo "    DATABASE_URL                = postgresql://anichin:****@db:5432/anichin?schema=public"
echo "    REDIS_URL                   = redis://redis:6379"
echo ""
echo "  Deploy:"
echo "    DEPLOY_HOST                 = $DEPLOY_HOST"
echo "    DEPLOY_USER                 = $DEPLOY_USER"
echo "    DEPLOY_SSH_KEY              = [SSH private key contents]"
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
    if echo -n "$value" | gh secret set "$name" 2>/dev/null; then
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

# OAuth
set_secret "GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_ID"
set_secret "GOOGLE_CLIENT_SECRET" "$GOOGLE_CLIENT_SECRET"
set_secret "GITHUB_CLIENT_ID" "$GITHUB_CLIENT_ID"
set_secret "GITHUB_CLIENT_SECRET" "$GITHUB_CLIENT_SECRET"

# Database (constructed)
DATABASE_URL="postgresql://anichin:${POSTGRES_PASSWORD}@db:5432/anichin?schema=public"
set_secret "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
set_secret "DATABASE_URL" "$DATABASE_URL"
set_secret "REDIS_URL" "redis://redis:6379"

# Deploy
set_secret "DEPLOY_HOST" "$DEPLOY_HOST"
set_secret "DEPLOY_USER" "$DEPLOY_USER"
set_secret "DEPLOY_SSH_KEY" "$SSH_KEY_CONTENT"
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
