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

# Only copy manifests so layer is cached when source changes
COPY package.json bun.lock* ./

# Reproducible install (fails if lockfile out of sync)
RUN bun install --frozen-lockfile

# ----------------------------------------------------------------------------
# Stage 2: builder  — generate Prisma client + build Next.js standalone
# ----------------------------------------------------------------------------
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Bring over installed dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (respects .dockerignore)
COPY . .

# --- Build-time env / args ---
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Database is always PostgreSQL in production
ARG DATABASE_URL="postgresql://anichin:anichin@db:5432/anichin?schema=public"

# Generate Prisma client (must run BEFORE next build)
RUN bunx prisma generate

# Set DEPLOY_TARGET=standalone so build.js knows to:
# 1. Use output: "standalone" in next.config.ts
# 2. Copy .next/static + public into .next/standalone/
ENV DEPLOY_TARGET=standalone

# Build Next.js (uses scripts/build.js — detects DEPLOY_TARGET)
RUN bun run build

# ----------------------------------------------------------------------------
# Stage 3: runner  — minimal production image
# ----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install wget for HEALTHCHECK (alpine doesn't ship it by default)
RUN apk add --no-cache wget

# Create non-root user for security (never run as root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# --- Copy artifacts from builder (chown to non-root user) ---

# 1. Standalone server (includes minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 2. Static chunks (NOT included in standalone by default — must copy manually)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 3. Public assets (poster SVGs, PWA icons, og-image, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 4. Prisma schema (in case runtime migration is needed)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Create writable directories (logs + SQLite fallback for dev-only images)
RUN mkdir -p /app/logs /app/db && \
    chown -R nextjs:nodejs /app/logs /app/db

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Healthcheck — poll the lightweight /api health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api > /dev/null 2>&1 || exit 1

# Next.js standalone server.js (runs on Node.js runtime)
CMD ["node", "server.js"]
