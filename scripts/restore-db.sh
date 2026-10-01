#!/bin/sh
# ============================================================================
# AniChin — PostgreSQL Restore Script
# Restores anichin database from a backup file
# Usage:
#   ./scripts/restore-db.sh <backup-name>
#   ./scripts/restore-db.sh pre-deploy-20260101-120000
#   ./scripts/restore-db.sh auto-20260101-020000
# ============================================================================

set -eu

BACKUP_DIR="/backups"
DB_NAME="${PGDATABASE:-anichin}"
DB_USER="${PGUSER:-anichin}"
DB_HOST="${PGHOST:-db}"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup-name>"
  echo ""
  echo "Available backups:"
  ls -1 "${BACKUP_DIR}"/*.dump 2>/dev/null | sed 's|.*/||; s|\.dump$||' || echo "  No backups found"
  exit 1
fi

BACKUP_NAME="$1"
DUMP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.dump"

if [ ! -f "$DUMP_FILE" ]; then
  echo "❌ Backup file not found: $DUMP_FILE"
  echo ""
  echo "Available backups:"
  ls -1 "${BACKUP_DIR}"/*.dump 2>/dev/null | sed 's|.*/||; s|\.dump$||' || echo "  No backups found"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "♻️  Starting PostgreSQL restore"
echo "   Database:  ${DB_NAME}"
echo "   Host:      ${DB_HOST}"
echo "   Backup:    ${DUMP_FILE}"
echo "   Size:      $(du -h "$DUMP_FILE" | cut -f1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Confirmation prompt (skip if FORCE=1)
if [ "${FORCE:-0}" != "1" ]; then
  printf "⚠️  This will OVERWRITE current database. Continue? [y/N] "
  read -r CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "❌ Restore cancelled"
    exit 1
  fi
fi

# Wait for DB
echo "⏳ Waiting for database..."
for i in $(seq 1 30); do
  if pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  echo "  attempt $i/30..."
  sleep 2
done

# Step 1: Close all existing connections
echo "🔌 Closing existing connections..."
psql -h "$DB_HOST" -U "$DB_USER" -d postgres << EOF
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();
EOF

# Step 2: Drop and recreate database (clean slate)
echo "🗑️  Recreating database..."
psql -h "$DB_HOST" -U "$DB_USER" -d postgres << EOF
DROP DATABASE IF EXISTS "${DB_NAME}";
CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}";
EOF

# Step 3: Restore from backup (custom format for parallel restore)
echo "📥 Restoring from backup..."
pg_restore \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --jobs=4 \
  "$DUMP_FILE" || {
    # Custom format may have some errors on clean — try without clean
    echo "⚠️  Clean restore had errors, retrying without --clean..."
    pg_restore \
      -h "$DB_HOST" \
      -U "$DB_USER" \
      -d "$DB_NAME" \
      --no-owner \
      --no-privileges \
      --jobs=4 \
      "$DUMP_FILE"
  }

# Step 4: Verify restore
TABLE_COUNT=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | xargs)
ANIME_COUNT=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM \"Anime\";" 2>/dev/null | xargs || echo "0")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Restore complete"
echo "   Tables:     ${TABLE_COUNT}"
echo "   Anime rows: ${ANIME_COUNT}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
