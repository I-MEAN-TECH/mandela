#!/usr/bin/env bash
# backup-school.sh - nightly per-school Postgres backup (ops runbook).
# Usage: BACKUP_DIR=/var/backups/mandela ./scripts/backup-school.sh
# Cron: 15 2 * * *  cd /srv/mandela && BACKUP_DIR=/var/backups/mandela ./scripts/backup-school.sh >> /var/log/mandela-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
PGHOST="${POSTGRES_HOST:-127.0.0.1}"
PGPORT="${POSTGRES_PORT:-54329}"
PGUSER="${POSTGRES_USER:-mandela}"
PGPASSWORD="${POSTGRES_PASSWORD:-mandela_dev_pw}"
export PGPASSWORD

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "[backup] starting $STAMP -> $BACKUP_DIR"

# Every mandela_<school> database, dumped schema+data, gzipped.
DBS="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d mandela_control -tAc "SELECT db_name FROM school WHERE state='active'")"
if [ -z "$DBS" ]; then
  echo "[backup] no active schools found - nothing to do"
  exit 0
fi

for DB in $DBS; do
  OUT="$BACKUP_DIR/${DB}-${STAMP}.sql.gz"
  echo "[backup] dumping $DB"
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB" --no-owner | gzip > "$OUT"
  # Integrity probe: the gzip must decompress and contain a CREATE.
  if ! gunzip -c "$OUT" | head -c 100000 | grep -q "PostgreSQL database dump"; then
    echo "[backup] ERROR: $DB dump failed integrity probe - removing $OUT" >&2
    rm -f "$OUT"
    exit 1
  fi
  echo "[backup] ok: $OUT ($(du -h "$OUT" | cut -f1))"
done

# Rotation
echo "[backup] pruning dumps older than $KEEP_DAYS days"
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "[backup] done"
