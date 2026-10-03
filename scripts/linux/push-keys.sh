#!/usr/bin/env bash
# Turn on push notifications for an existing Game Central server: adds a Web Push key pair to .env
# (once; it never replaces keys that are already there). Run from the Game Central folder, then
# restart:   bash scripts/linux/push-keys.sh && docker compose up -d
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "No .env here. Run scripts/linux/server-env.sh first." >&2; exit 1; }
if grep -q '^VAPID_PUBLIC_KEY=.\+' .env; then
  echo "Push keys are already set in .env."
  exit 0
fi
command -v openssl >/dev/null || { echo "openssl is needed (apt install openssl)." >&2; exit 1; }
key=$(openssl ecparam -name prime256v1 -genkey -noout)
private=$(printf '%s\n' "$key" | openssl ec -outform DER 2>/dev/null | tail -c +8 | head -c 32 | base64 | tr '+/' '-_' | tr -d '=\n')
public=$(printf '%s\n' "$key" | openssl ec -pubout -outform DER 2>/dev/null | tail -c 65 | base64 | tr '+/' '-_' | tr -d '=\n')
site=$(sed -n 's/^SITE_ADDRESS=//p' .env | head -1)
sed -i '/^VAPID_\(PUBLIC\|PRIVATE\)_KEY=$/d; /^VAPID_SUBJECT=/d' .env
cat >> .env <<ENV

# Push notifications (Web Push). Keep these: changing them signs everyone's devices out of push.
VAPID_PUBLIC_KEY=$public
VAPID_PRIVATE_KEY=$private
VAPID_SUBJECT=mailto:admin@${site:-example.com}
ENV
echo "Added push keys to .env. Restart with: docker compose up -d"
