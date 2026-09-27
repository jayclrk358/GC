#!/usr/bin/env bash
# Creates .env for hosting Magnox with Docker (docker-compose.yml + docker-compose.prod.yml).
#
#   scripts/linux/server-env.sh                    this machine only: https://localhost
#   scripts/linux/server-env.sh 192.168.1.50       your network: https://192.168.1.50
#   scripts/linux/server-env.sh magnox.example.com a domain on the internet (real certificates)
#
# Secrets are random. Run it once, before the first start: the database password is fixed when
# the database is first created.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -f .env ]; then
  echo ".env already exists. Move it away first if you really want a new one." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "openssl is needed (apt install openssl)." >&2; exit 1; }

host="${1:-localhost}"
if [ "$host" = "localhost" ]; then
  site="localhost"; media="media.localhost"; media_url="https://media.localhost"
elif [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # No domain: Caddy signs its own certificate and uploads get their own port.
  site="$host"; media="$host:8443"; media_url="https://$host:8443"
else
  site="$host"; media="media.$host"; media_url="https://media.$host"
fi

cat > .env <<ENV
# Magnox server settings (created by scripts/linux/server-env.sh). Keep this file private.
# Plain \`docker compose\` commands use the server overrides too.
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
APP_URL=https://$site
SITE_ADDRESS=$site
MEDIA_ADDRESS=$media
MEDIA_BASE_URL=$media_url
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)

# Email. Empty sends everything to the built-in Mailpit inbox (http://localhost:8025 on the
# server). For real email: SMTP_URL=smtps://user:password@smtp.example.com:465
SMTP_URL=
EMAIL_FROM="Magnox <no-reply@$site>"
# REQUIRE_EMAIL_VERIFICATION=true

# Optional sign-in providers and the Cloudflare Turnstile check on sign-up, sign-in and votes
# (see .env.example for all options).
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
PLATFORM_ADMIN_EMAILS=
ENV
chmod 600 .env
echo "Created .env for https://$site (uploads: $media_url)."
