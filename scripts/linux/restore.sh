#!/usr/bin/env bash
# Restore a backup made by scripts/linux/backup.sh. Everything in the database (and, for local
# uploads, the uploaded files) is replaced by what's in the backup.
#
#   bash scripts/linux/restore.sh backups/2026-10-02_031700
#
# The site is stopped while it restores and started again afterwards. Restoring on a new server:
# copy the backup's env file to .env first, then run this.
set -euo pipefail
cd "$(dirname "$0")/../.."
src="${1:-}"
[ -n "$src" ] && [ -f "$src/db.sql.gz" ] || {
  echo "Usage: bash scripts/linux/restore.sh <backup folder> (one with db.sql.gz in it)" >&2
  exit 1
}
[ -f .env ] || { echo "No .env here. Copy $src/env to .env first." >&2; exit 1; }
setting() { sed -n "s/^$1=//p" .env | tail -1 | sed 's/^"\(.*\)"$/\1/'; }
external_db="$(setting EXTERNAL_DATABASE_URL)"
storage="$(setting STORAGE_DRIVER)"

gzip -t "$src/db.sql.gz"
echo "This replaces the site's database$([ "${storage:-local}" = "local" ] && [ -f "$src/media.tar.gz" ] && echo " and uploads") with the backup from $(basename "$src")."
read -r -p "Type restore to continue: " answer
[ "$answer" = "restore" ] || { echo "Nothing changed."; exit 1; }

echo "Stopping the site..."
docker compose stop caddy web realtime worker >/dev/null 2>&1 || true

echo "Restoring the database..."
# Empty it, then load the backup, all in one transaction: if anything fails, nothing changes.
reset_sql='SET client_min_messages = warning; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
if [ -n "$external_db" ]; then
  { echo "$reset_sql"; gunzip -c "$src/db.sql.gz"; } |
    docker run --rm -i postgres:16-alpine psql -q --single-transaction -v ON_ERROR_STOP=1 "$external_db" >/dev/null
else
  docker compose up -d postgres >/dev/null
  until docker compose exec -T postgres pg_isready -U magnox -d magnox >/dev/null 2>&1; do sleep 1; done
  { echo "$reset_sql"; gunzip -c "$src/db.sql.gz"; } |
    docker compose exec -T postgres psql -q --single-transaction -v ON_ERROR_STOP=1 -U magnox -d magnox >/dev/null
fi

if [ "${storage:-local}" = "local" ] && [ -f "$src/media.tar.gz" ]; then
  echo "Restoring uploads..."
  docker compose run --rm --no-deps -T --entrypoint sh worker -c \
    'rm -rf /data/media/* && tar xzf - -C /data' < "$src/media.tar.gz"
fi

echo "Starting the site..."
docker compose up -d >/dev/null
echo "Restored $(basename "$src"). New database changes since then (if any) apply on start."
