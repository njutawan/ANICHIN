# Vercel Deployment Guide — AniChin

Complete step-by-step guide to deploy AniChin to Vercel.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Step 1: Set Up External Database](#step-1-set-up-external-database)
- [Step 2: Set Up External Redis](#step-2-set-up-external-redis-optional)
- [Step 3: Get OAuth Credentials](#step-3-get-oauth-credentials)
- [Step 4: Deploy to Vercel](#step-4-deploy-to-vercel)
- [Step 5: Configure Environment Variables](#step-5-configure-environment-variables)
- [Step 6: Run Database Migration](#step-6-run-database-migration)
- [Step 7: Verify Deployment](#step-7-verify-deployment)
- [Vercel-Specific Adaptations](#vercel-specific-adaptations)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

AniChin was originally built for Docker/self-hosted deployment, but has been adapted to work on Vercel's serverless platform. The key differences:

| Component | Docker (Original) | Vercel (Adapted) |
|-----------|-------------------|------------------|
| **Database** | SQLite file OR PostgreSQL in container | **External PostgreSQL** (Vercel Postgres, Neon, Supabase) |
| **Redis** | Redis in container | **External Redis** (Upstash, optional) |
| **Filesystem** | Read-write (logs, audit) | **Read-only** (in-memory logs only) |
| **Build output** | Standalone (`.next/standalone/server.js`) | **Vercel-native** (`.next/` directory) |
| **Process model** | Long-running Node.js process | **Serverless functions** (per-request) |
| **Audit logs** | File-based (`logs/audit.jsonl`) | **In-memory + console** (Vercel captures stdout) |

---

## Prerequisites

- ✅ Vercel account (free tier works for testing)
- ✅ GitHub repo with AniChin code
- ✅ External PostgreSQL database (see Step 1)
- ✅ OAuth credentials from Google + GitHub (see Step 3)
- ✅ Domain name (optional — Vercel provides `*.vercel.app` subdomain)

---

## Step 1: Set Up External Database

Vercel serverless has no persistent filesystem, so SQLite won't work. Choose one:

### Option A: Vercel Postgres (Easiest — same dashboard)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Open your project → **Storage** tab → **Create** → **Postgres**
3. Name: `anichin-prod` → **Create**
4. Click **Connect to project** → select your AniChin project
5. Copy the `DATABASE_URL` from **.env.local** tab

### Option B: Neon (Free tier — recommended)

1. Go to [neon.tech](https://neon.tech) → sign up with GitHub
2. Create new project → Name: `anichin`
3. Copy connection string:
   ```
   postgresql://user:password@ep-xxx.region.aws.neon.tech/anichin?sslmode=require
   ```
   ⚠️ **Important**: Must include `?sslmode=require` for Neon

### Option C: Supabase (Free tier — also good)

1. Go to [supabase.com](https://supabase.com) → sign up
2. New project → Name: `anichin` → set strong DB password
3. Settings → Database → Connection string → **URI**
4. Copy:
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
   ```

### Option D: Railway (Free trial)

1. Go to [railway.app](https://railway.app) → sign up with GitHub
2. New project → **Provision PostgreSQL**
3. **Connect** tab → copy `DATABASE_URL`

**Save your `DATABASE_URL`** — you'll need it in Step 5.

---

## Step 2: Set Up External Redis (Optional)

Redis is used for rate limiting + login lockout. Without it, the app falls back to in-memory (works, but rate limits reset on cold start).

### Option A: Upstash (Recommended — Vercel partner)

1. Go to [upstash.com](https://upstash.com) → sign up with GitHub
2. Create database → Name: `anichin` → Region: same as Vercel (e.g., `us-east-1` or `ap-southeast-1`)
3. Copy `REDIS_URL`:
   ```
   rediss://default:[PASSWORD]@[ENDPOINT].upstash.io:6379
   ```
   ⚠️ Must use `rediss://` (with SSL), not `redis://`

### Option B: Skip Redis (in-memory fallback)

If you skip Redis, rate limiting still works but:
- ⚠️ Rate limits reset on every cold start (per-serverless-instance)
- ⚠️ Login lockout is per-instance (not global)

For testing, this is fine. For production, use Upstash.

---

## Step 3: Get OAuth Credentials

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → enable OAuth consent screen (External)
3. Create OAuth 2.0 Client ID (Web application)
4. **Authorized redirect URIs:**
   ```
   https://YOUR-APP.vercel.app/api/auth/callback/google
   https://YOUR-CUSTOM-DOMAIN.com/api/auth/callback/google (if using custom domain)
   ```
5. Copy Client ID + Secret

### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. New OAuth App
3. **Authorization callback URL:**
   ```
   https://YOUR-APP.vercel.app/api/auth/callback/github
   ```
4. Copy Client ID + Secret

---

## Step 4: Deploy to Vercel

### Option A: Via Vercel Dashboard (Beginner-friendly)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Vercel auto-detects Next.js (framework preset: **Next.js**)
4. **Build & Development Settings**:
   - Build Command: `bun run vercel-build` (already in `vercel.json`)
   - Install Command: `bun install` (already in `vercel.json`)
   - Output Directory: `.next` (auto-detected)
5. **Environment Variables** — see Step 5 below
6. Click **Deploy**

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy from project root
cd /path/to/anichin
vercel

# Follow prompts:
# ? Set up and deploy "~/path/to/anichin"? [Y/n] y
# ? Which scope do you want to deploy to? your-username
# ? Link to existing project? [y/N] n
# ? What's your project's name? anichin
# ? In which directory is your code located? ./
# ? Want to modify these settings? [y/N] n
```

After first deploy, set environment variables (Step 5), then deploy to production:

```bash
vercel --prod
```

---

## Step 5: Configure Environment Variables

In Vercel dashboard → your project → **Settings → Environment Variables**, add each:

### Required Variables

| Name | Value | Environment |
|------|-------|-------------|
| `DATABASE_URL` | `postgresql://...` (from Step 1) | Production, Preview, Development |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` (generate) | Production, Preview, Development |
| `NEXTAUTH_URL` | `https://YOUR-APP.vercel.app` (your Vercel URL) | Production |
| `GOOGLE_CLIENT_ID` | from Google Cloud Console | Production, Preview, Development |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console | Production, Preview, Development |
| `GITHUB_CLIENT_ID` | from GitHub OAuth App | Production, Preview, Development |
| `GITHUB_CLIENT_SECRET` | from GitHub OAuth App | Production, Preview, Development |
| `TWO_FACTOR_ENCRYPTION_KEY` | `openssl rand -base64 32` (generate) | Production, Preview, Development |

### Optional Variables

| Name | Value | Notes |
|------|-------|-------|
| `REDIS_URL` | `rediss://default:...@xxx.upstash.io:6379` | From Step 2 (rate limiting) |
| `SMTP_HOST` | `smtp.sendgrid.net` | For email verification |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | `apikey` | |
| `SMTP_PASS` | `SG.xxx` (SendGrid API key) | |
| `SMTP_FROM` | `noreply@yourdomain.com` | |
| `SENTRY_DSN` | `https://xxx@sentry.io/xxx` | Error tracking |

### Generate Secrets

Run these locally to generate secure values:

```bash
# NEXTAUTH_SECRET (32+ chars)
openssl rand -base64 32

# TWO_FACTOR_ENCRYPTION_KEY (32+ chars)
openssl rand -base64 32
```

### Set via Vercel CLI

```bash
# Set each variable
vercel env add DATABASE_URL production
# Paste your DATABASE_URL

vercel env add NEXTAUTH_SECRET production
# Paste your generated secret

# Repeat for each variable...
```

---

## Step 6: Run Database Migration

After deploy, push the Prisma schema to your external PostgreSQL:

### Option A: Via Vercel CLI (Recommended)

```bash
# Install Vercel CLI if not installed
npm i -g vercel

# Pull env vars locally (so prisma can connect)
vercel env pull .env.local

# Generate Prisma client (schema.prisma sudah PostgreSQL — tidak ada swap)
bunx prisma generate

# Push schema to database
bunx prisma db push

# Run seed (creates initial anime data)
bun run seed
```

### Option B: Via Vercel Postgres Console

If using Vercel Postgres, you can run migrations from the dashboard:
1. Vercel dashboard → Storage → your Postgres → **Query** tab
2. Paste contents of `prisma/migrations/20261001000000_init/migration.sql`
3. Run

---

## Step 7: Verify Deployment

After deploy + migration, verify:

```bash
# 1. Health check
curl https://YOUR-APP.vercel.app/api/health
# Expected: {"status":"ok","checks":{"db":{"status":"ok"},...}}

# 2. Auth providers
curl https://YOUR-APP.vercel.app/api/auth/providers
# Expected: {"credentials":{...},"google":{...},"github":{...}}

# 3. OAuth providers list
curl https://YOUR-APP.vercel.app/api/auth/oauth-providers
# Expected: {"providers":[{"id":"google",...},{"id":"github",...}]}

# 4. Home page
curl -sI https://YOUR-APP.vercel.app/
# Expected: HTTP/2 200

# 5. Login page (check OAuth buttons render)
open https://YOUR-APP.vercel.app/auth/login
```

---

## Vercel-Specific Adaptations

The following changes were made to make AniChin Vercel-compatible:

### 1. `next.config.ts` — Conditional standalone output
```typescript
const isVercel = process.env.VERCEL === "1";
const isStandalone = !isVercel && process.env.DEPLOY_TARGET === "standalone";

const nextConfig: NextConfig = {
  // Only use standalone for Docker, NOT for Vercel
  ...(isStandalone ? { output: "standalone" as const } : {}),
  // ...
};
```

### 2. `package.json` — Vercel-specific build script
```json
{
  "scripts": {
    "vercel-build": "prisma generate && next build",
    "build": "node scripts/build.js"
  }
}
```

Vercel auto-runs `vercel-build` (recognized automatically). This:
- Generates Prisma client
- Runs `next build` (no standalone output for Vercel)

### 3. `vercel.json` — Vercel config
```json
{
  "framework": "nextjs",
  "buildCommand": "bun run vercel-build",
  "installCommand": "bun install",
  "outputDirectory": ".next",
  "regions": ["sin1"]
}
```

### 4. `src/lib/audit-log.ts` — Serverless-compatible
- Detects Vercel via `process.env.VERCEL === "1"`
- On Vercel: skips filesystem writes (read-only), uses in-memory buffer + console
- On Docker: writes to `logs/audit.jsonl` (persistent)

### 5. External services (not in code — config only)
- **PostgreSQL**: external (Vercel Postgres, Neon, Supabase, Railway)
- **Redis**: external (Upstash) — optional, in-memory fallback works
- **Email**: external SMTP (SendGrid, Mailgun, AWS SES)

---

## Troubleshooting

### Build fails with Prisma error
```
Error: Cannot find module '.prisma/client/default'
```
**Fix**: Ensure `postinstall: prisma generate` is in package.json (already set). Vercel runs this automatically after `bun install`.

### Build fails with `output: "standalone"` error
```
Error: Standalone output is not supported on Vercel
```
**Fix**: Make sure `next.config.ts` has the conditional check:
```typescript
const isVercel = process.env.VERCEL === "1";
const isStandalone = !isVercel && process.env.DEPLOY_TARGET === "standalone";
// ...
...(isStandalone ? { output: "standalone" as const } : {}),
```

### Runtime error: `Cannot read properties of undefined (reading 'findMany')`
**Cause**: DATABASE_URL not set or DB not migrated.
**Fix**:
1. Verify `DATABASE_URL` is set in Vercel env vars (Production environment)
2. Run migration (Step 6)
3. Redeploy

### OAuth error: `redirect_uri_mismatch`
**Fix**: Update OAuth provider dashboard with Vercel URL:
- Google Console: add `https://YOUR-APP.vercel.app/api/auth/callback/google`
- GitHub OAuth App: set callback URL to `https://YOUR-APP.vercel.app/api/auth/callback/github`

### OAuth error: `redirect_uri_mismatch` on custom domain
**Fix**: If using custom domain, add BOTH:
- `https://YOUR-APP.vercel.app/api/auth/callback/{google,github}`
- `https://yourdomain.com/api/auth/callback/{google,github}`

### Health check shows `db.status: "fail"`
**Cause**: DB unreachable from Vercel.
**Fix**:
1. Verify `DATABASE_URL` includes `?sslmode=require` (Neon, Supabase require SSL)
2. Check if DB allows connections from Vercel's IP range (most cloud DBs do by default)
3. Test connection from local: `psql $DATABASE_URL`

### Rate limiting doesn't work (resets every request)
**Cause**: No Redis configured, in-memory fallback resets on cold start.
**Fix**: Set up Upstash Redis (Step 2) and set `REDIS_URL` env var.

### Cold start is slow (5-10 seconds)
**Cause**: Serverless function needs to spin up + load Prisma client.
**Fix**:
- Vercel Pro: enable `Edge Functions` for faster cold starts
- Or use Docker deploy instead (long-running process)

### Audit logs show empty on Vercel
**Cause**: Vercel has read-only filesystem — file-based logging disabled.
**Fix**: View logs in Vercel dashboard → your project → **Logs** tab. All `console.log/error` output is captured and searchable.

---

## Quick Reference

### Vercel Build Commands

| Script | What it does | When Vercel runs it |
|--------|--------------|---------------------|
| `installCommand` | `bun install` | After git push, before build |
| `postinstall` | `prisma generate` | After install (auto) |
| `buildCommand` | `bun run vercel-build` | After install (set in vercel.json) |
| `vercel-build` | `prisma generate && next build` | The actual build step |

### Required Environment Variables (8 minimum)

```
DATABASE_URL              ← external PostgreSQL URL
NEXTAUTH_SECRET           ← random 32+ char string
NEXTAUTH_URL              ← https://your-app.vercel.app
GOOGLE_CLIENT_ID          ← from Google Cloud Console
GOOGLE_CLIENT_SECRET      ← from Google Cloud Console
GITHUB_CLIENT_ID          ← from GitHub Developer Settings
GITHUB_CLIENT_SECRET      ← from GitHub Developer Settings
TWO_FACTOR_ENCRYPTION_KEY ← random 32+ char string
```

### Verification Commands

```bash
# After deploy, verify:
curl https://YOUR-APP.vercel.app/api/health
curl https://YOUR-APP.vercel.app/api/auth/oauth-providers
curl https://YOUR-APP.vercel.app/api/auth/providers

# View logs:
vercel logs [deployment-url]

# Open in browser:
open https://YOUR-APP.vercel.app
```

---

## Need Help?

- **Vercel docs**: https://vercel.com/docs
- **Next.js on Vercel**: https://vercel.com/docs/frameworks/nextjs
- **Prisma on Vercel**: https://www.prisma.io/docs/guides/deploying-to-vercel
- **AniChin deployment guide**: `docs/DEPLOYMENT.md` (Docker-focused)
- **OAuth setup guide**: `docs/PRODUCTION-OAUTH.md`

---

**Ready to deploy!** Follow Steps 1-7 above. The code is already Vercel-compatible — just configure environment variables and you're live. 🚀
