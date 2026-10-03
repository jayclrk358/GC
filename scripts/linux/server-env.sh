#!/usr/bin/env bash
# Creates .env for hosting Game Central with Docker (docker-compose.yml + docker-compose.prod.yml).
#
#   scripts/linux/server-env.sh                    this machine only: https://localhost
#   scripts/linux/server-env.sh 192.168.1.50       your network: https://192.168.1.50
#   scripts/linux/server-env.sh gamecentral.example.com a domain on the internet (real certificates)
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
voice_ip=""
if [ "$host" = "localhost" ]; then
  site="localhost"; media="media.localhost"; media_url="https://media.localhost"
elif [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # No domain: Caddy signs its own certificate and uploads get their own port.
  site="$host"; media="$host:8443"; media_url="https://$host:8443"
  # Voice audio goes straight to this address rather than to one found online.
  voice_ip="LIVEKIT_USE_EXTERNAL_IP=false
LIVEKIT_NODE_IP=$host"
else
  site="$host"; media="media.$host"; media_url="https://media.$host"
fi

# A Web Push key pair (P-256), made with openssl so the server needs nothing else.
vapid_key=$(openssl ecparam -name prime256v1 -genkey -noout)
vapid_private=$(printf '%s\n' "$vapid_key" | openssl ec -outform DER 2>/dev/null | tail -c +8 | head -c 32 | base64 | tr '+/' '-_' | tr -d '=\n')
vapid_public=$(printf '%s\n' "$vapid_key" | openssl ec -pubout -outform DER 2>/dev/null | tail -c 65 | base64 | tr '+/' '-_' | tr -d '=\n')

cat > .env <<ENV
# Game Central server settings (created by scripts/linux/server-env.sh). Keep this file private.
# Plain \`docker compose\` commands use the server overrides too, and start voice (LiveKit).
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
COMPOSE_PROFILES=voice
APP_URL=https://$site
SITE_ADDRESS=$site
MEDIA_ADDRESS=$media
MEDIA_BASE_URL=$media_url
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)

# Push notifications on phones and computers (Web Push). Keep these: changing them signs
# everyone's devices out of push.
VAPID_PUBLIC_KEY=$vapid_public
VAPID_PRIVATE_KEY=$vapid_private
VAPID_SUBJECT=mailto:admin@$site

# Email. Empty sends everything to the built-in Mailpit inbox (http://localhost:8025 on the
# server). For real email: SMTP_URL=smtps://user:password@smtp.example.com:465 (a user name that
# is an email address has its @ written as %40, e.g. no-reply%40example.com; EMAIL_FROM must be
# that address too)
SMTP_URL=
EMAIL_FROM="Game Central <no-reply@$site>"
# REQUIRE_EMAIL_VERIFICATION=true

# Optional sign-in providers and the Cloudflare Turnstile check on sign-up, sign-in and votes
# (see .env.example for all options).
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
PLATFORM_ADMIN_EMAILS=

# Voice channels (LiveKit). Open 7881/tcp and 7882/udp on the firewall for the audio.
# To turn voice off, empty both keys and remove "voice" from COMPOSE_PROFILES above.
LIVEKIT_API_KEY=$(openssl rand -hex 8)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
$voice_ip
ENV
chmod 600 .env
echo "Created .env for https://$site (uploads: $media_url)."
echo "For voice channels, open ports 7881/tcp and 7882/udp on the firewall."
