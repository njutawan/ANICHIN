# syntax=docker/dockerfile:1.6

# ============================================================================
# AniChin — Next.js 16 standalone production image
# Multi-stage build:  deps → builder → runner
# ============================================================================

# ----------------------------------------------------------------------------
# Stage 1: deps  — install all dependencies (cached layer)
# ----------------------------------------------------------------------------
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Prisma memilih target engine berdasarkan libssl yang tersedia di sistem.
# Alpine TIDAK menyertakan OpenSSL (image Node/Bun resmi hanya memasang
# libstdc++), sehingga tanpa paket ini `prisma generate` diam-diam memilih
# engine `linux-musl` (OpenSSL 1.1) yang gagal dimuat di Alpine 3.17+ karena
# libssl.so.1.1 sudah tidak ada. Install `openssl` (CLI + libssl.so.3) supaya
# deteksi menghasilkan `linux-musl-openssl-3.0.x` — lihat juga catatan di
# stage `runner` yang harus punya libssl yang sama.
RUN apk add --no-cache openssl

# Only copy manifests so layer is cached when source changes
COPY package.json bun.lock* ./

# Reproducible install (fails if lockfile out of sync)
RUN bun install --frozen-lockfile

# ----------------------------------------------------------------------------
# Stage 2: builder  — generate Prisma client + build Next.js standalone
# ----------------------------------------------------------------------------
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Same reason as the `deps` stage: Prisma needs OpenSSL present so that both the
# generated engine target and the runtime engine target agree.
RUN apk add --no-cache openssl

# Bring over installed dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (respects .dockerignore)
COPY . .

# --- Build-time env / args ---
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Database is always PostgreSQL in production. The URL is only needed by
# `prisma generate` (which never connects) — `next build` no longer touches the
# DB because every page is rendered per-request (see `dynamic` in the root
# layout), so the image can be built without a reachable database.
# Auth secrets are runtime-only too: src/lib/auth.ts validates NEXTAUTH_SECRET
# when authentication is used, not when Next.js imports routes during build.
# Never pass NEXTAUTH_SECRET or OAuth credentials as build args.
ARG DATABASE_URL="postgresql://anichin:anichin@db:5432/anichin?schema=public"
# Informational: kept in sync with docker-compose/CI build args.
ARG DATABASE_PROVIDER=postgresql

# --- Build args untuk nilai yang di-INLINE saat build (prefix NEXT_PUBLIC_) ---
# Nilai NEXT_PUBLIC_* tidak bisa ditimpa saat runtime: Next.js menggantinya
# dengan literal di bundle. Sebelumnya dua nilai ini tidak pernah dikirim saat
# build, sehingga:
#   • canonical/OG/sitemap di bundle browser jatuh ke DEFAULT_SITE_URL
#     (src/lib/site.ts) — benar untuk anichin.id, salah untuk domain lain.
#   • versi cache service worker (NEXT_PUBLIC_BUILD_ID) memakai fallback
#     timestamp alih-alih commit, jadi cache tidak pernah "sengaja" basi.
# Kirim dari compose/CI:
#   docker build --build-arg NEXT_PUBLIC_SITE_URL="$NEXTAUTH_URL" .
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_BUILD_ID=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID

# Generate Prisma client (must run BEFORE next build)
RUN bunx prisma generate

# Set DEPLOY_TARGET=standalone so build.js knows to:
# 1. Use output: "standalone" in next.config.ts
# 2. Copy .next/static + public into .next/standalone/
ENV DEPLOY_TARGET=standalone

# Build Next.js (uses scripts/build.js — detects DEPLOY_TARGET)
RUN bun run build

# ----------------------------------------------------------------------------
# Stage 3: migrate — one-shot Prisma CLI image (docker-compose `migrate`)
#
# Why a separate stage: the runner image (node:24-alpine) has neither `bunx`
# nor the Prisma CLI/engines, so `bunx prisma migrate deploy` could never run
# there — and because `web` has `depends_on: migrate: service_completed_
# successfully`, the whole stack failed to start. This stage reuses everything
# the builder already installed.
# NOTE: keep this stage BEFORE `runner` so the default build target stays the
# slim runtime image.
# ----------------------------------------------------------------------------
FROM builder AS migrate

WORKDIR /app
ENV NODE_ENV=production

CMD ["bunx", "prisma", "migrate", "deploy"]

# ----------------------------------------------------------------------------
# Stage 4: runner  — minimal production image
#
# Node 24 (Active LTS) — bukan node:20 lagi: Node 20 sudah End-Of-Life sejak
# April 2026 (tidak ada patch keamanan lagi) dan image resminya tidak lagi
# dirawat di nodejs/docker-node. Node 24 juga memenuhi syarat Next 16 (≥20.9).
# ----------------------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# wget    → dipakai HEALTHCHECK (alpine tidak menyertakan wget).
# openssl → Prisma query engine (libquery_engine-*.so.node) di-link ke libssl,
#           dan Prisma mendeteksi versi libssl saat runtime di direktori /lib,
#           /usr/lib untuk memilih nama engine. Tanpa paket ini, container
#           gagal melayani request pertama dengan:
#             Prisma Client could not locate the Query Engine for runtime
#             "linux-musl-openssl-3.0.x"
#           (gejala: /api/health balas 503 → healthcheck Docker gagal).
RUN apk add --no-cache wget openssl

# Create non-root user for security (never run as root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# --- Copy artifacts from builder (chown to non-root user) ---

# 1. Standalone server (includes minimal node_modules + Prisma engine)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 2. Static chunks (NOT included in standalone by default — must copy manually)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 3. Public assets (poster SVGs, PWA icons, og-image, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 4. Prisma schema (in case runtime migration is needed)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Fail the build early if the Prisma engine did not make it into the image —
# jauh lebih murah daripada menemukannya saat container melayani trafik.
RUN test -n "$(find /app/node_modules/.prisma/client -maxdepth 1 -name 'libquery_engine-*.so.node' -print -quit)" \
    || (echo "FATAL: Prisma query engine hilang dari .next/standalone — cek outputFileTracingIncludes di next.config.ts" >&2 && exit 1)

# Create writable log directory (the schema is PostgreSQL-only — the old
# /app/db "SQLite fallback" directory was dead weight from the pre-Postgres
# era and has been removed; see P1-12 in docs/CODE-REVIEW.md).
RUN mkdir -p /app/logs && \
    chown -R nextjs:nodejs /app/logs

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Healthcheck — poll the lightweight /api health endpoint
# Poll the real health endpoint (it verifies the DB + memory + Redis), so a
# container with a dead database is reported unhealthy instead of green.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health > /dev/null 2>&1 || exit 1

# Next.js standalone server.js (runs on Node.js runtime)
CMD ["node", "server.js"]
