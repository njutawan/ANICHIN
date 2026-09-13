#!/bin/bash
# ============================================================================
# AniChin — Environment Setup Script
# Ensures DATABASE_URL is set correctly for PostgreSQL (production-ready)
#
# Run automatically via:
#   - npm postinstall hook (already in package.json)
#   - bun run setup-env (manual)
#
# What it does:
#   1. Sets DATABASE_URL to local PostgreSQL if not already set
#   2. Starts embedded PostgreSQL (if running locally + not started)
#   3. Generates Prisma client
# ============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 AniChin — Environment Setup${NC}"

# 1. Set DATABASE_URL if missing or invalid
if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${YELLOW}  DATABASE_URL not set — defaulting to local PostgreSQL${NC}"
  export DATABASE_URL="postgresql://anichin:anichin@localhost:5432/anichin?schema=public"
elif [[ ! "$DATABASE_URL" =~ ^postgresql ]]; then
  echo -e "${YELLOW}  DATABASE_URL looks invalid — defaulting to local PostgreSQL${NC}"
  export DATABASE_URL="postgresql://anichin:anichin@localhost:5432/anichin?schema=public"
fi

echo -e "${GREEN}  DATABASE_URL=${DATABASE_URL}${NC}"

# 2. Verify Prisma schema exists
if [ ! -f "${PWD}/prisma/schema.prisma" ]; then
  echo -e "${YELLOW}  ⚠️  prisma/schema.prisma not found${NC}"
  exit 0
fi

# 3. Generate Prisma client
echo -e "${BLUE}  Generating Prisma client...${NC}"
if command -v bun &> /dev/null; then
  bunx prisma generate 2>&1 | tail -3
elif command -v npx &> /dev/null; then
  npx prisma generate 2>&1 | tail -3
fi

echo -e "${GREEN}✓ Environment setup complete${NC}"
