#!/bin/sh
# PostgreSQL restore from a named custom-format backup.
# Destructive: target DB is dropped and recreated after explicit confirmation.
# Usage: ./scripts/restore-db.sh <backup-name>

set -eu
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_NAME="${PGDATABASE:-anichin}"
DB_USER="${PGUSER:-anichin}"
DB_HOST="${PGHOST:-db}"

# Never chmod a broad/shared system path or an ancestor of the caller's tree.
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

validate_identifier() {
  label="$1"
  value="$2"
  case "$value" in
    ''|*[!A-Za-z0-9_]*) echo "ERROR: ${label} may contain only letters, digits, and underscores." >&2; exit 2 ;;
  esac
  if [ "${#value}" -gt 63 ]; then
    echo "ERROR: ${label} is too long (max 63 characters)." >&2
    exit 2
  fi
}

validate_identifier 'database name' "$DB_NAME"
validate_identifier 'database user' "$DB_USER"
case "$DB_NAME" in
  postgres|template0|template1)
    echo "ERROR: refusing to restore over a PostgreSQL system database." >&2
    exit 2
    ;;
esac

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup-name>" >&2
  echo "Available backups:"
  ls -1 "${BACKUP_DIR}"/*.dump 2>/dev/null | sed 's|.*/||; s|\.dump$||' || echo "  No backups found"
  exit 1
fi

BACKUP_NAME="$1"
case "$BACKUP_NAME" in
  ''|*[!A-Za-z0-9_-]*) echo "ERROR: backup name may contain only letters, digits, '_' and '-'." >&2; exit 2 ;;
esac
if [ "${#BACKUP_NAME}" -gt 128 ]; then
  echo "ERROR: backup name is too long (max 128 characters)." >&2
  exit 2
fi

DUMP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.dump"
if [ ! -f "$DUMP_FILE" ] || [ -L "$DUMP_FILE" ]; then
  echo "ERROR: backup file is missing, not a regular file, or is a symlink." >&2
  exit 1
fi

# Ensure restored artifacts are not left world-readable (including older dumps).
chmod 600 "$DUMP_FILE"

printf '%s\n' "Starting restore from backup '${BACKUP_NAME}' into database '${DB_NAME}'."
if [ "${FORCE:-0}" != "1" ]; then
  printf "This DROPS and recreates '%s'. Type the database name to continue: " "$DB_NAME"
  read -r CONFIRM
  if [ "$CONFIRM" != "$DB_NAME" ]; then
    echo "Restore cancelled."
    exit 1
  fi
fi

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

# DB_NAME / DB_USER are restricted to safe SQL identifiers above.
psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -U "$DB_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
EOF

psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -U "$DB_USER" -d postgres <<EOF
DROP DATABASE IF EXISTS "${DB_NAME}";
CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}";
EOF

# Target is a new empty database; no --clean/retry fallback that could hide a
# partially failed restore. --exit-on-error ensures failures are visible.
pg_restore \
  -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges --exit-on-error --jobs=4 \
  "$DUMP_FILE"

TABLE_COUNT=$(psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | xargs)
ANIME_COUNT=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c 'SELECT count(*) FROM "Anime";' 2>/dev/null | xargs || echo "0")
printf '%s\n' "Restore complete. Tables: ${TABLE_COUNT}; Anime rows: ${ANIME_COUNT}."
