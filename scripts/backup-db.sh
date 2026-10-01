#!/bin/sh
# ============================================================================
# AniChin — PostgreSQL Backup Script
# Creates compressed backup of anichin database
# Usage:
#   ./scripts/backup-db.sh [backup-name]
#   ./scripts/backup-db.sh pre-deploy-20260101-120000
#   ./scripts/backup-db.sh
# Cron: scheduled daily at 02:00 by backup-cron container
# ============================================================================

set -eu

BACKUP_DIR="/backups"
DB_NAME="${PGDATABASE:-anichin}"
DB_USER="${PGUSER:-anichin}"
DB_HOST="${PGHOST:-db}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

# Backup name: provided arg or auto-timestamped
if [ -n "${1:-}" ]; then
  BACKUP_NAME="$1"
else
  BACKUP_NAME="auto-$(date +%Y%m%d-%H%M%S)"
fi

BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Starting PostgreSQL backup"
echo "   Database:  ${DB_NAME}"
echo "   Host:      ${DB_HOST}"
echo "   File:      ${BACKUP_FILE}"
echo "   Timestamp: ${TIMESTAMP}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for DB to be ready
echo "⏳ Waiting for database..."
for i in $(seq 1 30); do
  if pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    echo "✓ Database is ready"
    break
  fi
  echo "  attempt $i/30..."
  sleep 2
done

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Dump database (custom format for parallel restore) + gzip compress
echo "💾 Creating backup..."
pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --format=custom \
  --compress=9 \
  -f "${BACKUP_DIR}/${BACKUP_NAME}.dump"

# Also create plain SQL version (gzipped) for human-readable diff
pg_dump \
  -h "$DB_HOST" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --insert \
  | gzip -9 > "$BACKUP_FILE"

# Create manifest
cat > "${BACKUP_DIR}/${BACKUP_NAME}.manifest" << EOF
backup_name: ${BACKUP_NAME}
database: ${DB_NAME}
host: ${DB_HOST}
timestamp: ${TIMESTAMP}
size_dump: $(du -h "${BACKUP_DIR}/${BACKUP_NAME}.dump" | cut -f1)
size_sql_gz: $(du -h "$BACKUP_FILE" | cut -f1)
pg_version: $(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW version;" 2>/dev/null | xargs)
EOF

echo "✅ Backup complete: ${BACKUP_DIR}/${BACKUP_NAME}"
echo "   .dump: $(du -h "${BACKUP_DIR}/${BACKUP_NAME}.dump" | cut -f1)"
echo "   .sql.gz: $(du -h "$BACKUP_FILE" | cut -f1)"

# Cleanup old backups (retention)
echo "🧹 Cleaning up backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "auto-*.dump" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "auto-*.sql.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "auto-*.manifest" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

# List remaining backups
echo "📁 Current backups:"
ls -1 "$BACKUP_DIR"/*.dump 2>/dev/null | wc -l | xargs echo "  Total backups:"
du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 | xargs echo "  Total size:"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Backup completed successfully"
