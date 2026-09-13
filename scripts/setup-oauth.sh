#!/bin/bash
# ============================================================================
# AniChin — OAuth Setup Wizard (Interactive)
# Walks you through setting up Google + GitHub OAuth for production.
#
# Usage:
#   ./scripts/setup-oauth.sh
#
# What it does:
#   1. Generates a secure NEXTAUTH_SECRET + TWO_FACTOR_ENCRYPTION_KEY
#   2. Validates existing .env values
#   3. Guides you through Google OAuth Console setup (step-by-step)
#   4. Guides you through GitHub OAuth App setup
#   5. Verifies callback URLs match your NEXTAUTH_URL
#   6. Tests the OAuth providers endpoint
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Symbols
CHECK="${GREEN}✓${NC}"
CROSS="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"
INFO="${BLUE}ℹ${NC}"
ARROW="${CYAN}→${NC}"

ENV_FILE="${1:-.env}"
PRODUCTION_DOMAIN=""

print_header() {
    echo ""
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${PURPLE}  ${1}${NC}"
    echo -e "${PURPLE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_step() {
    echo ""
    echo -e "${BLUE}▶ Step ${1}: ${2}${NC}"
}

print_success() {
    echo -e "${CHECK} ${1}"
}

print_warning() {
    echo -e "${WARN} ${1}"
}

print_error() {
    echo -e "${CROSS} ${1}"
}

print_info() {
    echo -e "${INFO} ${1}"
}

print_arrow() {
    echo -e "  ${ARROW} ${1}"
}

prompt() {
    local var=$1
    local prompt=$2
    local default=${3:-}
    local value=""
    if [ -n "$default" ]; then
        read -p "$(echo -e ${CYAN}${prompt}${NC} [${default}]: )" value
        value="${value:-$default}"
    else
        read -p "$(echo -e ${CYAN}${prompt}${NC}: )" value
    fi
    eval "$var=\"$value\""
}

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    print_warning "No .env file found at $ENV_FILE"
    read -p "Create from .env.production template? (Y/n): " create_env
    if [[ "${create_env:-Y}" =~ ^[Yy]$ ]]; then
        cp .env.production "$ENV_FILE"
        print_success "Created $ENV_FILE from template"
    else
        print_error "Cannot continue without .env file"
        exit 1
    fi
fi

print_header "AniChin OAuth Setup Wizard"
echo ""
echo "This wizard will guide you through setting up Google + GitHub OAuth"
echo "for your AniChin production deployment."
echo ""
echo "  Env file: $ENV_FILE"
echo ""

# ============================================================
print_header "Step 0: Verify NextAuth basics"
# ============================================================

# Check NEXTAUTH_URL
NEXTAUTH_URL=$(grep -E "^NEXTAUTH_URL=" "$ENV_FILE" | cut -d= -f2- || echo "")
if [ -z "$NEXTAUTH_URL" ] || [[ "$NEXTAUTH_URL" == *"REPLACE"* ]]; then
    print_error "NEXTAUTH_URL is not set in $ENV_FILE"
    prompt NEXTAUTH_URL "Enter your production URL (e.g., https://anichin.id)"
    sed -i.bak "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=$NEXTAUTH_URL|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
    print_success "Updated NEXTAUTH_URL=$NEXTAUTH_URL"
else
    print_success "NEXTAUTH_URL = $NEXTAUTH_URL"
fi

# Ensure HTTPS in production
if [[ "$NEXTAUTH_URL" != https://* ]]; then
    print_error "Production URL must use HTTPS! Got: $NEXTAUTH_URL"
    print_info "OAuth providers require HTTPS for production apps."
    exit 1
fi
print_success "HTTPS verified"

PRODUCTION_DOMAIN=$(echo "$NEXTAUTH_URL" | sed 's|https://||; s|http://||; s|/.*||; s|:.*||')
print_info "Production domain: $PRODUCTION_DOMAIN"

# Check NEXTAUTH_SECRET
NEXTAUTH_SECRET=$(grep -E "^NEXTAUTH_SECRET=" "$ENV_FILE" | cut -d= -f2- || echo "")
if [ -z "$NEXTAUTH_SECRET" ] || [[ "$NEXTAUTH_SECRET" == *"REPLACE"* ]]; then
    print_warning "NEXTAUTH_SECRET is not set"
    read -p "Generate a secure random secret now? (Y/n): " gen_secret
    if [[ "${gen_secret:-Y}" =~ ^[Yy]$ ]]; then
        NEXTAUTH_SECRET=$(openssl rand -base64 32)
        sed -i.bak "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$NEXTAUTH_SECRET|" "$ENV_FILE"
        rm -f "$ENV_FILE.bak"
        print_success "Generated NEXTAUTH_SECRET (32+ chars)"
    else
        print_error "NEXTAUTH_SECRET required for OAuth"
        exit 1
    fi
else
    print_success "NEXTAUTH_SECRET already set"
fi

# ============================================================
print_header "Step 1: Google OAuth Setup"
# ============================================================
echo ""
echo "You need a Google Cloud project with OAuth 2.0 credentials."
echo "If you don't have one yet, follow the steps below."
echo ""

# Check if Google OAuth already configured
GOOGLE_CLIENT_ID=$(grep -E "^GOOGLE_CLIENT_ID=" "$ENV_FILE" | cut -d= -f2- || echo "")
if [ -n "$GOOGLE_CLIENT_ID" ] && [[ "$GOOGLE_CLIENT_ID" != *"REPLACE"* ]]; then
    print_success "Google OAuth already configured:"
    print_arrow "Client ID: ${GOOGLE_CLIENT_ID:0:30}..."
    read -p "Reconfigure Google OAuth? (y/N): " reconfig_google
    if [[ ! "${reconfig_google:-N}" =~ ^[Yy]$ ]]; then
        print_info "Keeping existing Google OAuth config"
        skip_google=1
    fi
fi

if [[ -z "${skip_google:-}" ]]; then
    print_step "1.1" "Open Google Cloud Console"
    echo ""
    echo -e "  Open this URL in your browser:"
    echo ""
    echo -e "  ${CYAN}https://console.cloud.google.com/apis/credentials${NC}"
    echo ""
    read -p "  Press Enter when you've opened the page..."

    print_step "1.2" "Create OAuth Client ID (if not exists)"
    echo ""
    echo "  1. Click \"Create Credentials\" → \"OAuth client ID\""
    echo "  2. Application type: ${CYAN}Web application${NC}"
    echo "  3. Name: AniChin Production"
    echo ""
    echo "  4. Authorized JavaScript origins (add these):"
    echo -e "     ${GREEN}https://$PRODUCTION_DOMAIN${NC}"
    echo -e "     ${GREEN}https://www.$PRODUCTION_DOMAIN${NC}"
    echo ""
    echo "  5. Authorized redirect URIs (add this — EXACT match!):"
    echo -e "     ${GREEN}https://$PRODUCTION_DOMAIN/api/auth/callback/google${NC}"
    echo ""
    read -p "  Press Enter once you've created the OAuth client..."

    print_step "1.3" "Copy Google credentials"
    echo ""
    prompt GOOGLE_CLIENT_ID "Paste your Google Client ID"
    prompt GOOGLE_CLIENT_SECRET "Paste your Google Client Secret"

    # Save to .env
    sed -i.bak "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID|" "$ENV_FILE"
    sed -i.bak "s|^GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
    print_success "Google OAuth credentials saved to $ENV_FILE"

    print_step "1.4" "Publish OAuth consent screen (if not done)"
    echo ""
    echo "  For production, your OAuth consent screen must be published:"
    echo ""
    echo -e "  ${CYAN}https://console.cloud.google.com/apis/credentials/consent${NC}"
    echo ""
    echo "  1. Click \"Publish App\" (or \"Push to production\")"
    echo "  2. Verify your domain if prompted (add HTML file to your site)"
    echo ""
    read -p "  Press Enter once OAuth consent is published..."
fi

# ============================================================
print_header "Step 2: GitHub OAuth Setup"
# ============================================================
echo ""
echo "You need a GitHub OAuth App."
echo ""

GITHUB_CLIENT_ID=$(grep -E "^GITHUB_CLIENT_ID=" "$ENV_FILE" | cut -d= -f2- || echo "")
if [ -n "$GITHUB_CLIENT_ID" ] && [[ "$GITHUB_CLIENT_ID" != *"REPLACE"* ]]; then
    print_success "GitHub OAuth already configured:"
    print_arrow "Client ID: ${GITHUB_CLIENT_ID:0:20}..."
    read -p "Reconfigure GitHub OAuth? (y/N): " reconfig_github
    if [[ ! "${reconfig_github:-N}" =~ ^[Yy]$ ]]; then
        print_info "Keeping existing GitHub OAuth config"
        skip_github=1
    fi
fi

if [[ -z "${skip_github:-}" ]]; then
    print_step "2.1" "Open GitHub Developer Settings"
    echo ""
    echo -e "  Open this URL in your browser:"
    echo ""
    echo -e "  ${CYAN}https://github.com/settings/developers${NC}"
    echo ""
    read -p "  Press Enter when you've opened the page..."

    print_step "2.2" "Create OAuth App (if not exists)"
    echo ""
    echo "  1. Click \"New OAuth App\""
    echo "  2. Fill in:"
    echo "     - Application name: AniChin Production"
    echo "     - Homepage URL: https://$PRODUCTION_DOMAIN"
    echo "     - Authorization callback URL:"
    echo -e "       ${GREEN}https://$PRODUCTION_DOMAIN/api/auth/callback/github${NC}"
    echo "  3. Click \"Register application\""
    echo ""
    read -p "  Press Enter once the app is created..."

    print_step "2.3" "Copy GitHub credentials"
    echo ""
    echo "  On the OAuth app settings page:"
    echo -e "  ${ARROW} Copy the ${CYAN}Client ID${NC} (shown on the page)"
    echo -e "  ${ARROW} Click \"Generate a new client secret\""
    echo -e "  ${ARROW} Copy the ${CYAN}Client Secret${NC} (shown only once!)"
    echo ""
    prompt GITHUB_CLIENT_ID "Paste your GitHub Client ID"
    prompt GITHUB_CLIENT_SECRET "Paste your GitHub Client Secret"

    # Save to .env
    sed -i.bak "s|^GITHUB_CLIENT_ID=.*|GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID|" "$ENV_FILE"
    sed -i.bak "s|^GITHUB_CLIENT_SECRET=.*|GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
    print_success "GitHub OAuth credentials saved to $ENV_FILE"

    print_step "2.4" "Optional: Upload app logo"
    echo ""
    echo "  On the OAuth app settings page:"
    echo -e "  ${ARROW} Upload a 200×200 px logo (recommended)"
    echo ""
    read -p "  Press Enter to continue..."
fi

# ============================================================
print_header "Step 3: 2FA Encryption Key"
# ============================================================
TWO_FACTOR_KEY=$(grep -E "^TWO_FACTOR_ENCRYPTION_KEY=" "$ENV_FILE" | cut -d= -f2- || echo "")
if [ -z "$TWO_FACTOR_KEY" ] || [[ "$TWO_FACTOR_KEY" == *"REPLACE"* ]]; then
    print_warning "TWO_FACTOR_ENCRYPTION_KEY is not set"
    print_info "This key encrypts user 2FA secrets at rest. Generate one now."
    read -p "Generate TWO_FACTOR_ENCRYPTION_KEY? (Y/n): " gen_2fa
    if [[ "${gen_2fa:-Y}" =~ ^[Yy]$ ]]; then
        TWO_FACTOR_KEY=$(openssl rand -base64 32)
        sed -i.bak "s|^TWO_FACTOR_ENCRYPTION_KEY=.*|TWO_FACTOR_ENCRYPTION_KEY=$TWO_FACTOR_KEY|" "$ENV_FILE"
        rm -f "$ENV_FILE.bak"
        print_success "Generated TWO_FACTOR_ENCRYPTION_KEY"
    fi
else
    print_success "TWO_FACTOR_ENCRYPTION_KEY already set"
fi

# ============================================================
print_header "Step 4: Verify Configuration"
# ============================================================
echo ""
echo "Verifying OAuth configuration..."
echo ""

# Re-read env
GOOGLE_CLIENT_ID=$(grep -E "^GOOGLE_CLIENT_ID=" "$ENV_FILE" | cut -d= -f2- || echo "")
GOOGLE_CLIENT_SECRET=$(grep -E "^GOOGLE_CLIENT_SECRET=" "$ENV_FILE" | cut -d= -f2- || echo "")
GITHUB_CLIENT_ID=$(grep -E "^GITHUB_CLIENT_ID=" "$ENV_FILE" | cut -d= -f2- || echo "")
GITHUB_CLIENT_SECRET=$(grep -E "^GITHUB_CLIENT_SECRET=" "$ENV_FILE" | cut -d= -f2- || echo "")

ALL_OK=true

# Check Google
echo "Google OAuth:"
if [ -n "$GOOGLE_CLIENT_ID" ] && [[ "$GOOGLE_CLIENT_ID" != *"REPLACE"* ]] && [ -n "$GOOGLE_CLIENT_SECRET" ] && [[ "$GOOGLE_CLIENT_SECRET" != *"REPLACE"* ]]; then
    print_success "Google Client ID: ${GOOGLE_CLIENT_ID:0:30}..."
    print_success "Google Client Secret: ${GOOGLE_CLIENT_SECRET:0:8}****"
    # Check format
    if [[ "$GOOGLE_CLIENT_ID" == *".apps.googleusercontent.com" ]]; then
        print_success "Client ID format looks valid"
    else
        print_warning "Client ID format unusual (expected to end with .apps.googleusercontent.com)"
    fi
    if [[ "$GOOGLE_CLIENT_SECRET" == GOCSPX-* ]]; then
        print_success "Client Secret format looks valid"
    else
        print_warning "Client Secret format unusual (expected to start with GOCSPX-)"
    fi
else
    print_error "Google OAuth not configured"
    ALL_OK=false
fi
echo ""

# Check GitHub
echo "GitHub OAuth:"
if [ -n "$GITHUB_CLIENT_ID" ] && [[ "$GITHUB_CLIENT_ID" != *"REPLACE"* ]] && [ -n "$GITHUB_CLIENT_SECRET" ] && [[ "$GITHUB_CLIENT_SECRET" != *"REPLACE"* ]]; then
    print_success "GitHub Client ID: ${GITHUB_CLIENT_ID:0:20}..."
    print_success "GitHub Client Secret: ${GITHUB_CLIENT_SECRET:0:8}****"
    # Check length
    if [ ${#GITHUB_CLIENT_SECRET} -ge 32 ]; then
        print_success "Client Secret length looks valid (≥32 chars)"
    else
        print_warning "Client Secret looks short (${#GITHUB_CLIENT_SECRET} chars, expected ≥32)"
    fi
else
    print_error "GitHub OAuth not configured"
    ALL_OK=false
fi
echo ""

# Check callback URLs
echo "Callback URLs (set these in OAuth provider dashboards!):"
print_arrow "Google: https://$PRODUCTION_DOMAIN/api/auth/callback/google"
print_arrow "GitHub: https://$PRODUCTION_DOMAIN/api/auth/callback/github"
echo ""

# ============================================================
print_header "Step 5: Test Local Server"
# ============================================================
read -p "Restart dev server and test OAuth providers endpoint? (Y/n): " test_server
if [[ "${test_server:-Y}" =~ ^[Yy]$ ]]; then
    print_info "Restarting dev server..."
    pkill -f "next dev" 2>/dev/null || true
    sleep 2

    # Start in background
    nohup node node_modules/.bin/next dev -p 3000 -H :: > /tmp/oauth-test.log 2>&1 &
    sleep 10

    # Test endpoint
    print_info "Testing /api/auth/oauth-providers..."
    RESPONSE=$(curl -s --max-time 10 http://localhost:3000/api/auth/oauth-providers 2>&1 || echo "FAILED")
    if echo "$RESPONSE" | grep -q '"google"' && echo "$RESPONSE" | grep -q '"github"'; then
        print_success "OAuth providers endpoint works!"
        echo -e "  ${ARROW} $RESPONSE"
    else
        print_error "OAuth providers endpoint failed"
        echo -e "  ${ARROW} Response: $RESPONSE"
    fi

    # Cleanup
    pkill -f "next dev" 2>/dev/null || true
fi

# ============================================================
print_header "Summary"
# ============================================================
echo ""
if $ALL_OK; then
    echo -e "${GREEN}✅ OAuth setup complete!${NC}"
    echo ""
    echo "Next steps:"
    print_arrow "Restart your dev server: bun run dev"
    print_arrow "Visit http://localhost:3000/auth/login"
    print_arrow "Verify OAuth buttons appear below login form"
    print_arrow "Test sign-in flow end-to-end"
    echo ""
    echo -e "${YELLOW}For production deploy:${NC}"
    echo "  1. Set these env vars in GitHub Secrets:"
    print_arrow "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
    print_arrow "GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET"
    print_arrow "NEXTAUTH_SECRET, NEXTAUTH_URL"
    print_arrow "TWO_FACTOR_ENCRYPTION_KEY"
    echo "  2. Deploy via GitHub Actions:"
    print_arrow "gh workflow run deploy.yml"
    echo ""
    echo "  3. Verify production OAuth:"
    print_arrow "curl https://$PRODUCTION_DOMAIN/api/auth/oauth-providers"
    print_arrow "Should return both google + github providers"
    echo ""
    echo -e "${BLUE}📚 Full docs: docs/PRODUCTION-OAUTH.md${NC}"
else
    echo -e "${RED}❌ OAuth setup incomplete${NC}"
    echo ""
    echo "Please fix the errors above and re-run this wizard."
fi
echo ""
