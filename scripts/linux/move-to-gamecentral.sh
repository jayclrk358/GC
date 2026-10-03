#!/usr/bin/env bash
# Once, on a server set up before the app was renamed Game Central (it used to be called
# "magnox"): moves the site's data to the new names, then starts it again.
#
#   git pull && scripts/linux/move-to-gamecentral.sh
#
# Docker keeps each install's data in volumes named after it (magnox_pgdata → gamecentral_pgdata,
# and so on), and the database and its user had the old name too. This copies the volumes (the old
# ones are kept until you remove them), renames the database and its user, updates a couple of
# settings in .env, and starts everything under the new name. The site is offline while it runs:
# a minute or so, plus the time to copy uploads if they're kept on this server.
set -euo pipefail
cd "$(dirname "$0")/../.."

OLD=magnox
NEW=gamecentral
VOLUMES=(pgdata redisqueue media caddydata)

die() {
  echo "$*" >&2
  exit 1
}

[ -f .env ] || die "No .env here: run this from the Game Central folder on the server."
command -v docker >/dev/null || die "Docker isn't installed here."

get() {
  sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

if ! docker volume inspect "${OLD}_pgdata" >/dev/null 2>&1; then
  echo "Nothing to move: this server has no data from before the rename."
  exit 0
fi
if docker volume inspect "${NEW}_pgdata" >/dev/null 2>&1; then
  die "${NEW}_pgdata already exists, so the move has been done (or started) already."
fi

echo "▸ Stopping the site (its data stays where it is)"
docker compose -p "$OLD" down --remove-orphans

echo "▸ Copying the data to the new names"
copied=()
for v in "${VOLUMES[@]}"; do
  docker volume inspect "${OLD}_$v" >/dev/null 2>&1 || continue
  copied+=("${OLD}_$v")
  echo "  ${OLD}_$v → ${NEW}_$v"
  # Labelled as Docker Compose would have, so it adopts them as its own.
  docker volume create \
    --label "com.docker.compose.project=$NEW" \
    --label "com.docker.compose.volume=$v" \
    "${NEW}_$v" >/dev/null
  docker run --rm --entrypoint sh \
    -v "${OLD}_$v:/from:ro" -v "${NEW}_$v:/to" \
    postgres:16-alpine -c 'cp -a /from/. /to/'
done

echo "▸ Renaming the database and its user"
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -q >/dev/null 2>&1; do sleep 1; done
psql() { docker compose exec -T postgres psql -q -v ON_ERROR_STOP=1 -d postgres "$@"; }
# A session can't rename the user it's signed in as, so a short-lived helper does it.
psql -U "$OLD" -c 'CREATE ROLE gc_rename SUPERUSER LOGIN'
psql -U gc_rename -c "ALTER DATABASE $OLD RENAME TO $NEW" -c "ALTER ROLE $OLD RENAME TO $NEW"
# Set the password again: renaming clears it if it was stored the old (MD5) way.
password=$(get POSTGRES_PASSWORD)
printf "ALTER ROLE %s PASSWORD :'pw';\nDROP ROLE gc_rename;\n" "$NEW" |
  psql -U "$NEW" -v pw="${password:-$NEW}"

echo "▸ Updating .env"
sed -i -e "s/^EMAIL_FROM=\"Magnox /EMAIL_FROM=\"Game Central /" \
  -e "s/^# Magnox server settings/# Game Central server settings/" .env
# Uploads in S3 or R2 stay in the bucket they're in: the default bucket name changed with the app.
if [ "$(get STORAGE_DRIVER)" = s3 ] && [ -z "$(get S3_BUCKET)" ]; then
  echo "S3_BUCKET=$OLD" >>.env
fi

echo "▸ Starting the site"
docker compose up -d --build

cat <<DONE
✔ Moved. Once you've checked everything works, remove the old copies of the data:
  docker volume rm ${copied[*]}
DONE
