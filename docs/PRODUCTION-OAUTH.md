# OAuth Production Setup Guide — Google + GitHub

Complete step-by-step guide to configure OAuth providers for **production** deployment.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Manual Setup](#manual-setup)
  - [1. Generate Secure Secrets](#1-generate-secure-secrets)
  - [2. Configure Google OAuth](#2-configure-google-oauth)
  - [3. Configure GitHub OAuth](#3-configure-github-oauth)
  - [4. Set Environment Variables](#4-set-environment-variables)
  - [5. Verify Configuration](#5-verify-configuration)
- [Deploy to Production](#deploy-to-production)
- [Multiple Environments](#multiple-environments)
- [Troubleshooting](#troubleshooting)
- [Security Checklist](#security-checklist)

---

## Prerequisites

- ✅ AniChin deployed to a server with HTTPS (e.g., `https://anichin.id`)
- ✅ `NEXTAUTH_SECRET` set (32+ chars random)
- ✅ Domain DNS pointing to your server
- ✅ Caddy/nginx with auto-HTTPS enabled
- ✅ Access to:
  - [Google Cloud Console](https://console.cloud.google.com/)
  - [GitHub Developer Settings](https://github.com/settings/developers)

---

## Quick Start (5 minutes)

Use the interactive setup wizard:

```bash
# On your server
cd /opt/anichin
./scripts/setup-oauth.sh
```

The wizard will:
1. Generate secure `NEXTAUTH_SECRET` + `TWO_FACTOR_ENCRYPTION_KEY`
2. Validate existing `.env` values
3. Walk you through Google OAuth Console step-by-step
4. Walk you through GitHub OAuth App setup
5. Verify callback URLs match your domain
6. Test the OAuth providers endpoint

Then verify everything works:

```bash
bun run scripts/verify-oauth.ts https://anichin.id
```

---

## Manual Setup

### 1. Generate Secure Secrets

You need 3 cryptographically secure secrets:

```bash
# NEXTAUTH_SECRET — for signing JWT tokens
openssl rand -base64 32
# Example output: K9x2mP7vQ4wL8nR3tB6yF1hJ5kD0gH9sZ+abc123=

# TWO_FACTOR_ENCRYPTION_KEY — for encrypting 2FA secrets at rest
openssl rand -base64 32
# Example output: M4nB7vC2xZ9pQ1rT6sL8wE3yJ5kD0fG7h+xyz789=

# POSTGRES_PASSWORD — for production database
openssl rand -base64 24 | tr -d '/+=' | head -c 32
# Example output: Xk9Pm2QvR7sT3wB6nF1hJ5kD0gH9sZ
```

**Save these securely** — if lost, all user sessions will be invalidated.

---

### 2. Configure Google OAuth

#### 2.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click project dropdown (top bar) → **New Project**
3. Name: `AniChin Production`
4. Click **Create**
5. Switch to the new project (use dropdown)

#### 2.2 Configure OAuth Consent Screen

1. Navigate to **APIs & Services → OAuth consent screen**
2. User type: **External** (unless you have Google Workspace)
3. Click **Create**
4. Fill in **App information**:
   - App name: `AniChin`
   - User support email: `support@anichin.id`
   - App logo (optional): upload 120×120 px logo
5. Fill in **App domain**:
   - Application home page: `https://anichin.id`
   - Application privacy policy URL: `https://anichin.id/privacy`
   - Application terms of service URL: `https://anichin.id/terms`
6. Fill in **Authorized domains**:
   - `anichin.id`
7. Developer contact email: `admin@anichin.id`
8. Click **Save and Continue**

#### 2.3 Configure Scopes

1. On the **Scopes** page, click **Add or Remove Scopes**
2. Add these scopes (both required):
   - `./auth/userinfo.email` — see user's email
   - `./auth/userinfo.profile` — see name + avatar
3. Click **Update** → **Save and Continue**

#### 2.4 Add Test Users (skip if publishing immediately)

1. On **Test users** page, add your email + team members (up to 100)
2. Click **Save and Continue**
3. Review summary → **Back to Dashboard**

#### 2.5 Publish OAuth Consent Screen

For production, you MUST publish:

1. Go back to **OAuth consent screen**
2. Click **Publish App** (or **Push to Production**)
3. Confirm — app is now live for any Google user to sign in

> ⚠️ If you need sensitive scopes (drive, calendar, etc.), Google requires verification. For just `email` + `profile`, no verification needed.

#### 2.6 Create OAuth 2.0 Client ID

1. Navigate to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `AniChin Production`
5. **Authorized JavaScript origins** (add ALL that apply):
   ```
   https://anichin.id
   https://www.anichin.id
   ```
6. **Authorized redirect URIs** (must match EXACTLY):
   ```
   https://anichin.id/api/auth/callback/google
   https://www.anichin.id/api/auth/callback/google
   ```
7. Click **Create**
8. Copy **Client ID** and **Client Secret**:
   - Client ID looks like: `123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com`
   - Client Secret looks like: `GOCSPX-abcdefghijklmnopqrstuvwxyz123456`

#### 2.7 (Optional) Configure OAuth Branding

1. On **OAuth consent screen → Branding**:
   - App logo: 120×120 px PNG
   - Primary color: `#f59e0b` (AniChin amber)
2. Save

---

### 3. Configure GitHub OAuth

#### 3.1 Create OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App** (or use existing)
3. Fill in:
   - **Application name**: `AniChin Production`
   - **Homepage URL**: `https://anichin.id`
   - **Application description**: `Nonton anime subtitle Indonesia terlengkap`
   - **Authorization callback URL**: `https://anichin.id/api/auth/callback/github`
4. Click **Register application**

#### 3.2 Generate Client Secret

1. On the app's settings page, find **Client ID** (visible)
2. Click **Generate a new client secret**
3. Copy the secret immediately — **shown only once!**
4. (Optional) Upload app logo (200×200 px recommended)

#### 3.3 (Optional) Configure App Permissions

By default, GitHub OAuth apps have read-only access to public user data (email, name, avatar). If you need private repo access etc., you'd configure additional scopes in `auth.ts`. For AniChin, default scopes are sufficient.

---

### 4. Set Environment Variables

#### For Docker Compose Deployment

Edit `.env` on the server:

```bash
ssh deploy@your-server
cd /opt/anichin
nano .env
```

Update these values:

```env
# Required for any auth
NEXTAUTH_SECRET=K9x2mP7vQ4wL8nR3tB6yF1hJ5kD0gH9sZ+abc123=
NEXTAUTH_URL=https://anichin.id

# Google OAuth
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz123456

# GitHub OAuth
GITHUB_CLIENT_ID=Iv1.abcdefghijkl
GITHUB_CLIENT_SECRET=abcdefghijklmnopqrstuvwxyz1234567890abcdef

# 2FA encryption
TWO_FACTOR_ENCRYPTION_KEY=M4nB7vC2xZ9pQ1rT6sL8wE3yJ5kD0fG7h+xyz789=
```

Restart the server:

```bash
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

#### For GitHub Actions Deployment

Set GitHub Secrets:

```bash
# Required GitHub Secrets
gh secret set NEXTAUTH_SECRET --body "K9x2mP7vQ4wL8nR3tB6yF1hJ5kD0gH9sZ+abc123="
gh secret set NEXTAUTH_URL --body "https://anichin.id"
gh secret set GOOGLE_CLIENT_ID --body "123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com"
gh secret set GOOGLE_CLIENT_SECRET --body "GOCSPX-abcdefghijklmnopqrstuvwxyz123456"
gh secret set OAUTH_GITHUB_CLIENT_ID --body "Iv1.abcdefghijkl"
gh secret set OAUTH_GITHUB_CLIENT_SECRET --body "abcdefghijklmnopqrstuvwxyz1234567890abcdef"
gh secret set TWO_FACTOR_ENCRYPTION_KEY --body "M4nB7vC2xZ9pQ1rT6sL8wE3yJ5kD0fG7h+xyz789="
```

The CI/CD pipeline (`deploy.yml`) automatically validates these secrets are set before deploying.

#### For Vercel / Railway / Render

1. Open project settings → Environment Variables
2. Add each variable above with Production environment
3. Redeploy

---

### 5. Verify Configuration

#### 5.1 Run Verification Script

```bash
# Local (with .env set)
bun run scripts/verify-oauth.ts

# Against production URL
bun run scripts/verify-oauth.ts https://anichin.id
```

Expected output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 OAuth Verification Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ NEXTAUTH_SECRET is set
     Length: 44 chars
  ✓ NEXTAUTH_SECRET is strong (≥32 chars)
     Current length: 44 — need ≥32
  ✓ NEXTAUTH_URL is set
     https://anichin.id
  ✓ NEXTAUTH_URL uses HTTPS (production)
  ✓ GOOGLE_CLIENT_ID is set
     123456789012-abcdefghi...
  ✓ GOOGLE_CLIENT_ID has valid format
  ✓ GOOGLE_CLIENT_SECRET is set
     GOCS****
  ✓ GOOGLE_CLIENT_SECRET has valid format
  ✓ GITHUB_CLIENT_ID is set
     Iv1.abcdefghijkl...
  ✓ GITHUB_CLIENT_SECRET is set
     abcd****
  ✓ GITHUB_CLIENT_SECRET is strong (≥32 chars)
     Current: 42 chars
  ✓ /api/auth/oauth-providers responds
  ✓ /api/auth/providers responds
  ✓ Both Google + GitHub providers active
  ✓ Google provider active
  ✓ GitHub provider active

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ Passed:  16
  ⚠ Warnings: 0
  ✗ Failed:  0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ OAuth configuration verified successfully!
```

#### 5.2 Manual Verification

```bash
# Test OAuth providers endpoint
curl https://anichin.id/api/auth/oauth-providers
# Expected: {"providers":[{"id":"google","name":"Google","icon":"chrome"},{"id":"github","name":"GitHub","icon":"github"}]}

# Test full NextAuth providers list
curl https://anichin.id/api/auth/providers | python3 -m json.tool
# Expected: {"credentials":{...},"google":{...},"github":{...}}

# Test login page (should show OAuth buttons)
curl -s https://anichin.id/auth/login | grep -E "Masuk dengan (Google|GitHub)"
```

#### 5.3 Browser Test

1. Open `https://anichin.id/auth/login`
2. Verify both "Masuk dengan Google" and "Masuk dengan GitHub" buttons appear below the form
3. Click "Masuk dengan Google":
   - Should redirect to `https://accounts.google.com/o/oauth2/...`
   - Sign in with a Google account
   - Should redirect back to `https://anichin.id/`
   - User should be logged in (avatar shows in header)
4. Click "Masuk dengan GitHub":
   - Should redirect to `https://github.com/login/oauth/authorize?...`
   - Authorize the app
   - Should redirect back to `https://anichin.id/`
   - User should be logged in

---

## Deploy to Production

### Option 1: Deploy via GitHub Actions (Recommended)

1. Push your code to `main` branch
2. GitHub Actions automatically:
   - Validates OAuth env vars are set as secrets
   - Builds Docker image with PostgreSQL target
   - Pushes to container registry (optional)
   - SSH to deploy server
   - Runs database migrations
   - Restarts containers
   - Health check (6 retries)
   - Auto-rollback if health fails
3. Smoke tests:
   - `/api/health` returns `{"status":"ok"}`
   - `/api/auth/providers` returns credentials + google + github

### Option 2: Manual Docker Compose Deploy

```bash
# SSH to server
ssh deploy@your-server

# Pull latest code
cd /opt/anichin
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

# Wait for health
sleep 30
curl http://localhost:3000/api/health | grep -q '"status":"ok"' && echo "✅ Deployed"

# Verify OAuth
curl http://localhost:3000/api/auth/oauth-providers
# Should show: {"providers":[{"id":"google",...},{"id":"github",...}]}
```

---

## Multiple Environments

For dev + staging + production, create **separate OAuth apps** per environment:

| Env | Domain | Google Project | GitHub OAuth App |
|-----|--------|-----------------|------------------|
| Dev | `localhost:3000` | `AniChin Dev` | `AniChin Dev` |
| Staging | `staging.anichin.id` | `AniChin Staging` | `AniChin Staging` |
| Production | `anichin.id` | `AniChin Production` | `AniChin Production` |

Each app should have its own callback URLs pointing to the correct environment.

### Dev OAuth Setup (localhost)

For local development, you can use real Google + GitHub OAuth with `http://localhost:3000` as callback:

**Google**:
- Authorized JavaScript origins: `http://localhost:3000`
- Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`

**GitHub**:
- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

---

## Troubleshooting

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `redirect_uri_mismatch` | Callback URL in OAuth app doesn't match exactly | Verify protocol (https), no trailing slash, exact subdomain |
| `invalid_client` | Wrong Client ID or Secret | Re-copy from OAuth provider dashboard |
| `access_denied` | User cancelled, or OAuth app not published | Publish OAuth consent screen (Google) |
| OAuth buttons not showing | Env vars not set, or server not restarted | Set env vars + restart dev server |
| `redirect_uri_mismatch` after deploy | Production callback URL not added to OAuth app | Add `https://yourdomain.com/api/auth/callback/google` |
| OAuth works in dev but not prod | Cookie `secure` flag mismatch | Ensure `NEXTAUTH_URL=https://...` (not http) |
| `state mismatch` error | Clock skew or cookies cleared mid-flow | User retries, sync server clock with NTP |
| Profile pic not loading | OAuth avatar URL blocked by CSP | Check `next.config.ts` `images.remotePatterns` allows provider domains |
| Google "Sign in with Google temporarily disabled" | OAuth app verification needed (rare) | Submit for verification, or limit to test users |

### Debug Mode

Enable verbose OAuth logging:

```env
# In .env
NEXT_PUBLIC_DEBUG_OAUTH=1
```

This will surface OAuth config warnings in server logs.

### Check Server Logs

```bash
# Tail Docker web service logs
docker compose -f docker-compose.prod.yml logs -f web | grep -E "auth|oauth|google|github"

# Tail Caddy access log (OAuth callback requests)
docker compose -f docker-compose.prod.yml exec caddy tail -f /data/access.log | grep callback
```

### Test Callback URLs Individually

```bash
# Google callback (should return 400 without code, not 404)
curl -I https://anichin.id/api/auth/callback/google
# Expected: HTTP/2 400 (missing code param)

# GitHub callback (should return 400 without code, not 404)
curl -I https://anichin.id/api/auth/callback/github
# Expected: HTTP/2 400 (missing code param)
```

If you get 404, the route isn't registered — restart the server.

---

## Security Checklist

### Pre-Deploy

- [ ] `NEXTAUTH_SECRET` is 32+ chars, generated via `openssl rand -base64 32`
- [ ] `NEXTAUTH_URL` uses `https://` (not http)
- [ ] `TWO_FACTOR_ENCRYPTION_KEY` set if 2FA enabled
- [ ] OAuth Client IDs/Secrets are real values (not "REPLACE_WITH_...")
- [ ] Callback URLs in Google Console + GitHub Developer Settings match exactly:
  - `https://anichin.id/api/auth/callback/google`
  - `https://anichin.id/api/auth/callback/github`
- [ ] OAuth consent screen published (Google)
- [ ] Server clock synced via NTP (prevents `state mismatch` errors)

### Post-Deploy

- [ ] `curl https://anichin.id/api/auth/oauth-providers` returns both providers
- [ ] Login page shows both OAuth buttons
- [ ] Google sign-in works end-to-end
- [ ] GitHub sign-in works end-to-end
- [ ] User appears in DB with `emailVerified` set
- [ ] Logout works (session cookie cleared)
- [ ] HTTPS certificate valid (check via `curl -I https://anichin.id`)
- [ ] HSTS header present (`Strict-Transport-Security`)

### Ongoing

- [ ] Rotate `NEXTAUTH_SECRET` every 6-12 months (invalidates all sessions)
- [ ] Monitor OAuth app usage in Google Console + GitHub settings
- [ ] Review user signup patterns for abuse
- [ ] Keep OAuth client libraries updated (`next-auth`, `bcryptjs`)

---

## Quick Reference

### Required Environment Variables

```env
# Core auth
NEXTAUTH_SECRET=<32+ char random string>
NEXTAUTH_URL=https://anichin.id

# Google OAuth
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# GitHub OAuth
GITHUB_CLIENT_ID=<from GitHub Developer Settings>
GITHUB_CLIENT_SECRET=<from GitHub Developer Settings>

# 2FA encryption (optional but recommended)
TWO_FACTOR_ENCRYPTION_KEY=<32+ char random string>
```

### Callback URLs

```
Google: https://anichin.id/api/auth/callback/google
GitHub: https://anichin.id/api/auth/callback/github
```

### Verification Commands

```bash
# Check providers endpoint
curl https://anichin.id/api/auth/oauth-providers

# Run full verification
bun run scripts/verify-oauth.ts https://anichin.id

# Run setup wizard
./scripts/setup-oauth.sh
```

---

## Need Help?

- **Google OAuth docs**: https://developers.google.com/identity/protocols/oauth2
- **GitHub OAuth docs**: https://docs.github.com/en/developers/apps/building-oauth-apps
- **NextAuth Google provider**: https://next-auth.js.org/providers/google
- **NextAuth GitHub provider**: https://next-auth.js.org/providers/github
- **AniChin OAuth setup wizard**: `./scripts/setup-oauth.sh`
- **AniChin OAuth verifier**: `bun run scripts/verify-oauth.ts`
