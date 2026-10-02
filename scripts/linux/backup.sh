#!/usr/bin/env bash
# Back up a Magnox server: the database, uploaded files (when they're stored on this machine) and
# .env (its secrets are needed to restore). Run from anywhere; backups go to backups/ in the
# Magnox folder (or BACKUP_DIR), one folder per run, and the newest BACKUP_KEEP (14) are kept.
#
#   bash scripts/linux/backup.sh                  back up now
#   bash scripts/linux/backup.sh --install-cron   also back up every night at 03:17
#
# Optional, in .env or the environment:
#   BACKUP_DIR=/srv/magnox-backups   where backups go
#   BACKUP_KEEP=30                   how many to keep
#   BACKUP_RCLONE_REMOTE=r2:backups  also copy each backup off the server with rclone
# Restore with scripts/linux/restore.sh. Redis isn't backed up: it only holds caches and queues.
set -euo pipefail
cd "$(dirname "$0")/../.."
root=$(pwd)

if [ "${1:-}" = "--install-cron" ]; then
  line="17 3 * * * cd $root && bash scripts/linux/backup.sh >> $root/backups/backup.log 2>&1"
  mkdir -p backups
  if crontab -l 2>/dev/null | grep -qF "scripts/linux/backup.sh"; then
    echo "A nightly backup is already in your crontab (crontab -l to see it)."
  else
    (crontab -l 2>/dev/null; echo "$line") | crontab -
    echo "Nightly backups at 03:17 are on. Log: backups/backup.log"
  fi
fi

[ -f .env ] || { echo "No .env here. Is this the Magnox folder?" >&2; exit 1; }
setting() { sed -n "s/^$1=//p" .env | tail -1 | sed 's/^"\(.*\)"$/\1/'; }
dir="${BACKUP_DIR:-$(setting BACKUP_DIR)}"; dir="${dir:-$root/backups}"
keep="${BACKUP_KEEP:-$(setting BACKUP_KEEP)}"; keep="${keep:-14}"
remote="${BACKUP_RCLONE_REMOTE:-$(setting BACKUP_RCLONE_REMOTE)}"
external_db="$(setting EXTERNAL_DATABASE_URL)"
storage="$(setting STORAGE_DRIVER)"

stamp=$(date -u +%Y-%m-%d_%H%M%S)
out="$dir/$stamp"
umask 077
mkdir -p "$out"
echo "Backing up to $out"

# The database, as plain SQL (restore.sh empties the database before loading it).
dump_opts=(--no-owner --no-privileges)
if [ -n "$external_db" ]; then
  docker run --rm -i postgres:16-alpine pg_dump "${dump_opts[@]}" "$external_db" | gzip -6 > "$out/db.sql.gz"
else
  docker compose exec -T postgres pg_dump -U magnox -d magnox "${dump_opts[@]}" | gzip -6 > "$out/db.sql.gz"
fi
gzip -t "$out/db.sql.gz"
echo "  database   $(du -h "$out/db.sql.gz" | cut -f1)"

# Uploads, when they're on this machine (with S3 or R2, use the bucket's own versioning or
# replication instead).
if [ "${storage:-local}" = "local" ]; then
  docker compose run --rm --no-deps -T --entrypoint tar worker czf - -C /data media > "$out/media.tar.gz"
  echo "  uploads    $(du -h "$out/media.tar.gz" | cut -f1)"
else
  echo "  uploads    skipped (stored in S3; back up the bucket separately)"
fi

cp .env "$out/env"
echo "  settings   .env (keep backups private: it holds the site's secrets)"

if [ -n "$remote" ]; then
  if command -v rclone >/dev/null; then
    rclone copy "$out" "$remote/$stamp" && echo "  copied to $remote/$stamp"
  else
    echo "  BACKUP_RCLONE_REMOTE is set but rclone isn't installed (apt install rclone)." >&2
  fi
fi

# Keep the newest $keep backups.
ls -1d "$dir"/20??-??-??_?????? 2>/dev/null | sort | head -n "-$keep" | while read -r old; do
  rm -rf -- "$old" && echo "  removed old backup $(basename "$old")"
done
echo "Done."
