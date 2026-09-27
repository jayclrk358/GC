# Caddy with the Caddyfile built in, so `docker compose up -d --build` picks up config changes.
# (A bind-mounted Caddyfile keeps the old copy after `git pull` until Caddy is recreated.)
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
