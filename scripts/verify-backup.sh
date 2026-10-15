#!/usr/bin/env bash
# Verify a pg_dump backup by restoring it to a temp database and comparing
# row counts of key tables against the source.
#
# Usage:
#   DATABASE_URL=postgres://... ./scripts/verify-backup.sh [dump_file]
#   - Without a dump file, takes a fresh pg_dump first.
#   - BACKUP_DB_URL overrides the temp database name (default: <db>_restore_check).
set -euo pipefail

TABLES="tenants customers bookings payments"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

DUMP_FILE="${1:-/tmp/opencode/safi360-backup-$(date +%Y%m%d%H%M%S).dump}"
RESTORE_DB="${BACKUP_DB_URL:-${DATABASE_URL%/*}/restore_check}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "Taking fresh backup -> $DUMP_FILE"
  pg_dump --format=custom --file="$DUMP_FILE" "$DATABASE_URL"
fi

echo "Recreating temp database $RESTORE_DB"
psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS restore_check;" >/dev/null
psql "$DATABASE_URL" -c "CREATE DATABASE restore_check;" >/dev/null
pg_restore --no-owner --dbname="$RESTORE_DB" "$DUMP_FILE" >/dev/null

count() {
  psql -tAX -c "SELECT COUNT(*) FROM $1;" "$2"
}

FAILED=0
for table in $TABLES; do
  SRC=$(count "$table" "$DATABASE_URL")
  DST=$(count "$table" "$RESTORE_DB")
  if [ "$SRC" = "$DST" ]; then
    echo "OK   $table: $SRC rows"
  else
    echo "FAIL $table: source=$SRC restore=$DST" >&2
    FAILED=1
  fi
done

psql "$DATABASE_URL" -c "DROP DATABASE IF EXISTS restore_check;" >/dev/null

if [ "$FAILED" -ne 0 ]; then
  echo "Backup verification FAILED" >&2
  exit 1
fi
echo "Backup verification passed."
