#!/bin/sh
# PostgreSQL backup: private custom dump + gzipped SQL + private manifest.
# Usage: ./scripts/backup-db.sh [backup-name]

set -eu
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_NAME="${PGDATABASE:-anichin}"
DB_USER="${PGUSER:-anichin}"
DB_HOST="${PGHOST:-db}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [ -n "${1:-}" ]; then
  BACKUP_NAME="$1"
else
  BACKUP_NAME="auto-$(date +%Y%m%d-%H%M%S)"
fi

case "$BACKUP_NAME" in
  ''|*[!A-Za-z0-9_-]*) echo "ERROR: backup name may contain only letters, digits, '_' and '-'." >&2; exit 2 ;;
esac
if [ "${#BACKUP_NAME}" -gt 128 ]; then
  echo "ERROR: backup name is too long (max 128 characters)." >&2
  exit 2
fi
case "$RETENTION_DAYS" in
  ''|*[!0-9]*) echo "ERROR: BACKUP_RETENTION_DAYS must be a non-negative integer." >&2; exit 2 ;;
esac

# Only change permissions on a dedicated backup directory, never a broad or
# shared system directory (or an ancestor containing the caller's working tree).
is_shared_path() {
  case "$1" in
    /|/tmp|/var/tmp|/home|/root|/var|/usr|/etc|/opt|/srv|/proc|/sys|/dev|/run|/boot|/mnt|/media|/var/lib|/var/backups|/usr/local|/data)
      return 0 ;;
    *) return 1 ;;
  esac
}
has_dot_components() {
  case "$1" in
    -*|.|./|..|../|../*|*/..|*/../|*/../*|*/./|*/./*|*/.) return 0 ;;
    *) return 1 ;;
  esac
}
if is_shared_path "$BACKUP_DIR" || has_dot_components "$BACKUP_DIR"; then
  echo "ERROR: BACKUP_DIR must be a dedicated directory, not a root/shared system path." >&2
  exit 2
fi
mkdir -p "$BACKUP_DIR"
if [ -L "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: BACKUP_DIR must be a real directory, not a symlink." >&2
  exit 2
fi
BACKUP_DIR=$(CDPATH= cd -P "$BACKUP_DIR" && pwd -P)
if is_shared_path "$BACKUP_DIR"; then
  echo "ERROR: BACKUP_DIR resolves to a root/shared system path." >&2
  exit 2
fi
CURRENT_DIR=$(pwd -P)
case "$CURRENT_DIR/" in
  "$BACKUP_DIR/"*)
    echo "ERROR: BACKUP_DIR must not contain the current working directory." >&2
    exit 2
    ;;
esac
chmod 700 "$BACKUP_DIR"

BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"
DUMP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.dump"
MANIFEST_FILE="${BACKUP_DIR}/${BACKUP_NAME}.manifest"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
for final in "$DUMP_FILE" "$BACKUP_FILE" "$MANIFEST_FILE"; do
  if [ -e "$final" ] || [ -L "$final" ]; then
    echo "ERROR: refusing to overwrite existing backup: $(basename "$final")" >&2
    exit 1
  fi
done

TMP_DUMP="${BACKUP_DIR}/.${BACKUP_NAME}.dump.tmp.$$"
TMP_SQL="${BACKUP_DIR}/.${BACKUP_NAME}.sql.tmp.$$"
TMP_SQL_GZ="${BACKUP_DIR}/.${BACKUP_NAME}.sql.gz.tmp.$$"
TMP_MANIFEST="${BACKUP_DIR}/.${BACKUP_NAME}.manifest.tmp.$$"
cleanup() {
  rm -f "$TMP_DUMP" "$TMP_SQL" "$TMP_SQL_GZ" "$TMP_MANIFEST"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

printf '%s\n' "Starting PostgreSQL backup: ${BACKUP_NAME} (${TIMESTAMP})"
printf '%s\n' "Waiting for database..."
ready=0
for i in $(seq 1 30); do
  if pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" != "1" ]; then
  echo "ERROR: database did not become ready." >&2
  exit 1
fi

# Temp files remain private (umask 077); only publish final names when complete.
pg_dump \
  -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges --format=custom --compress=9 \
  -f "$TMP_DUMP"
pg_dump \
  -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges --insert \
  -f "$TMP_SQL"
gzip -9 -c "$TMP_SQL" > "$TMP_SQL_GZ"
rm -f "$TMP_SQL"

DUMP_SIZE=$(du -h "$TMP_DUMP" | cut -f1)
SQL_SIZE=$(du -h "$TMP_SQL_GZ" | cut -f1)
PG_VERSION=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW version;" 2>/dev/null | xargs)
cat > "$TMP_MANIFEST" <<EOF
backup_name: ${BACKUP_NAME}
database: ${DB_NAME}
host: ${DB_HOST}
timestamp: ${TIMESTAMP}
size_dump: ${DUMP_SIZE}
size_sql_gz: ${SQL_SIZE}
pg_version: ${PG_VERSION}
EOF

chmod 600 "$TMP_DUMP" "$TMP_SQL_GZ" "$TMP_MANIFEST"
mv "$TMP_DUMP" "$DUMP_FILE"
mv "$TMP_SQL_GZ" "$BACKUP_FILE"
mv "$TMP_MANIFEST" "$MANIFEST_FILE"

printf '%s\n' "Backup complete: ${BACKUP_NAME} (files mode 600, directory mode 700)"
printf '  .dump: %s\n' "$DUMP_SIZE"
printf '  .sql.gz: %s\n' "$SQL_SIZE"

# Retention is limited to automatically generated backups and a numeric age.
find "$BACKUP_DIR" -name 'auto-*.dump' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name 'auto-*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
find "$BACKUP_DIR" -name 'auto-*.manifest' -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true

echo "Backup operation finished."
