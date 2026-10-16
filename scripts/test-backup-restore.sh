#!/bin/sh
# Disposable-database integration test for backup/restore scripts.
# Requires PostgreSQL client tools and a superuser connection in PG* env vars.
# This script creates/drops ONLY unique temporary databases; never point it at
# a production database. In CI it runs against an ephemeral PostgreSQL service.

set -eu

RESTORE_SCRIPT="${1:-./scripts/restore-db.sh}"
BACKUP_SCRIPT="${2:-./scripts/backup-db.sh}"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
export PGHOST PGPORT PGUSER
: "${PGPASSWORD:?Set PGPASSWORD for the disposable PostgreSQL test service}"
export PGPASSWORD

TMP_DIR=$(mktemp -d)
SUFFIX="$(date +%s)_$$"
SOURCE_DB="backup_src_${SUFFIX}"
TARGET_DB="backup_dst_${SUFFIX}"
cleanup() {
  dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$TARGET_DB" >/dev/null 2>&1 || true
  dropdb --if-exists --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$SOURCE_DB" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Reject broad/shared or symlinked backup directories before touching the DB.
for unsafe_dir in / /tmp /var /home "$PWD"; do
  if BACKUP_DIR="$unsafe_dir" PGDATABASE=unused sh "$BACKUP_SCRIPT" should-not-run >/dev/null 2>&1; then
    echo "ERROR: backup script accepted a shared system directory: $unsafe_dir" >&2
    exit 1
  fi
  if BACKUP_DIR="$unsafe_dir" PGDATABASE=unused FORCE=1 sh "$RESTORE_SCRIPT" restore-probe >/dev/null 2>&1; then
    echo "ERROR: restore script accepted a shared system directory: $unsafe_dir" >&2
    exit 1
  fi
done
mkdir "$TMP_DIR/real-backups"
chmod 755 "$TMP_DIR/real-backups"
ln -s "$TMP_DIR/real-backups" "$TMP_DIR/backup-link"
if BACKUP_DIR="$TMP_DIR/backup-link" PGDATABASE=unused sh "$BACKUP_SCRIPT" should-not-run >/dev/null 2>&1; then
  echo "ERROR: backup script accepted a symlinked backup directory." >&2
  exit 1
fi
[ "$(stat -c '%a' "$TMP_DIR/real-backups")" = '755' ] || {
  echo "ERROR: backup script changed permissions through a directory symlink." >&2
  exit 1
}
if BACKUP_DIR="$TMP_DIR/backup-link" PGDATABASE=unused FORCE=1 \
  sh "$RESTORE_SCRIPT" restore-probe >/dev/null 2>&1; then
  echo "ERROR: restore script accepted a symlinked backup directory." >&2
  exit 1
fi

# Path traversal input must be rejected before a file lookup or any DB action.
if BACKUP_DIR="$TMP_DIR" PGDATABASE="$TARGET_DB" FORCE=1 \
  sh "$RESTORE_SCRIPT" '../outside' >/dev/null 2>&1; then
  echo "ERROR: restore script accepted a path-traversal backup name." >&2
  exit 1
fi

createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$SOURCE_DB"
createdb --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" "$TARGET_DB"
psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" <<'SQL'
CREATE TABLE backup_restore_probe (
  id integer PRIMARY KEY,
  marker text NOT NULL
);
INSERT INTO backup_restore_probe VALUES (1, 'restored-from-disposable-backup');
SQL

BACKUP_DIR="$TMP_DIR" PGDATABASE="$SOURCE_DB" PGUSER="$PGUSER" PGHOST="$PGHOST" \
  BACKUP_RETENTION_DAYS=14 sh "$BACKUP_SCRIPT" restore-probe

[ "$(stat -c '%a' "$TMP_DIR")" = '700' ] || {
  echo "ERROR: backup directory is not private (expected mode 700)." >&2
  exit 1
}
[ "$(stat -c '%a' "$TMP_DIR/restore-probe.dump")" = '600' ] || {
  echo "ERROR: backup dump is not private (expected mode 600)." >&2
  exit 1
}
[ "$(stat -c '%a' "$TMP_DIR/restore-probe.sql.gz")" = '600' ] || {
  echo "ERROR: compressed SQL backup is not private (expected mode 600)." >&2
  exit 1
}
[ "$(stat -c '%a' "$TMP_DIR/restore-probe.manifest")" = '600' ] || {
  echo "ERROR: backup manifest is not private (expected mode 600)." >&2
  exit 1
}

# Exercise the real destructive restore code only against the disposable target.
BACKUP_DIR="$TMP_DIR" PGDATABASE="$TARGET_DB" PGUSER="$PGUSER" PGHOST="$PGHOST" \
  FORCE=1 sh "$RESTORE_SCRIPT" restore-probe

RESTORED=$(psql -v ON_ERROR_STOP=1 -At \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$TARGET_DB" \
  -c "SELECT marker FROM backup_restore_probe WHERE id = 1;")
[ "$RESTORED" = 'restored-from-disposable-backup' ] || {
  echo "ERROR: restored data did not match the disposable backup." >&2
  exit 1
}

SOURCE_REMAINS=$(psql -v ON_ERROR_STOP=1 -At \
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" \
  -c "SELECT marker FROM backup_restore_probe WHERE id = 1;")
[ "$SOURCE_REMAINS" = 'restored-from-disposable-backup' ] || {
  echo "ERROR: source test database unexpectedly changed." >&2
  exit 1
}

echo "Backup/restore integration test passed using disposable databases only."
