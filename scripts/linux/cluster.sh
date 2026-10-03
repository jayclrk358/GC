#!/usr/bin/env bash
# Run Magnox on several servers: this one (the main server, which keeps the databases, the worker,
# voice and Caddy) plus app servers that run more copies of the web app and realtime server.
# Caddy here spreads visitors over all of them. See "Several servers" in the README.
#
#   scripts/linux/cluster.sh setup 10.0.0.2 10.0.0.3 10.0.0.4
#       once, on the main server: its private address first, then each app server's
#   scripts/linux/cluster.sh deploy
#       build, then update this server and each app server in turn (also after `git pull`)
#   scripts/linux/cluster.sh status
#       whether each server is answering
#
# The app servers need Docker, and this server must reach them with `ssh root@<address>` using a
# key. In .env, CLUSTER_SSH_USER sets another user (who must be allowed to run docker) and
# CLUSTER_NODE_DIR another folder on the app servers (default: magnox, in that user's home).
set -euo pipefail
cd "$(dirname "$0")/../.."

die() {
  echo "$*" >&2
  exit 1
}

usage() {
  cat >&2 <<'USAGE'
Usage:
  cluster.sh setup <this server's private address> <app server address>...
  cluster.sh deploy
  cluster.sh status
USAGE
  exit 1
}

[ -f .env ] || die "No .env here: set this server up first (scripts/linux/server-env.sh)."

# A value from .env (the last one wins), without surrounding quotes.
get() {
  sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Set a value in .env, in place of any earlier one.
put() {
  local tmp
  tmp=$(mktemp)
  grep -v "^$1=" .env >"$tmp" || true
  printf '%s=%s\n' "$1" "$2" >>"$tmp"
  # Rewritten in place, so .env keeps its owner and permissions.
  cat "$tmp" >.env
  rm -f "$tmp"
}

is_ipv4() { [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; }

ssh_user() { local u; u=$(get CLUSTER_SSH_USER); echo "${u:-root}"; }
node_dir() { local d; d=$(get CLUSTER_NODE_DIR); echo "${d:-magnox}"; }
on_node() {
  local ip=$1
  shift
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$(ssh_user)@$ip" "$@"
}

nodes() {
  local list
  list=$(get CLUSTER_NODES)
  [ -n "$list" ] || die "This server isn't set up for several servers yet: run $0 setup first."
  echo "$list"
}

setup() {
  [ $# -ge 2 ] || usage
  local main=$1
  shift
  local ip
  for ip in "$main" "$@"; do
    is_ipv4 "$ip" || die "\"$ip\" isn't an IPv4 address. Use each server's private network address."
  done
  if command -v ip >/dev/null && ! ip -4 addr show | grep -q "inet $main/"; then
    die "$main isn't an address of this server. Give this server's private address first."
  fi
  # Every server has to see the same uploads.
  if [ "$(get STORAGE_DRIVER)" != s3 ]; then
    die "Uploads are kept on this server's disk (STORAGE_DRIVER=local), where the app servers
can't see them. Move them to S3 or R2 first: see \"Several servers\" in the README."
  fi

  [ -n "$(get REDIS_PASSWORD)" ] || put REDIS_PASSWORD "$(openssl rand -hex 24)"
  put PRIVATE_IP "$main"
  put CLUSTER_NODES "\"$*\""
  local web="web:3000" realtime="realtime:3001"
  for ip in "$@"; do
    web+=" $ip:3000"
    realtime+=" $ip:3001"
  done
  put WEB_UPSTREAMS "\"$web\""
  put REALTIME_UPSTREAMS "\"$realtime\""
  # Each web app and realtime server keeps up to 10 database connections.
  put POSTGRES_MAX_CONNECTIONS $((60 + 25 * $#))

  local files
  files=$(get COMPOSE_FILE)
  files=${files:-docker-compose.yml:docker-compose.prod.yml}
  case ":$files:" in
    *:docker-compose.cluster.yml:*) ;;
    *) files+=":docker-compose.cluster.yml" ;;
  esac
  put COMPOSE_FILE "$files"

  echo "✔ This server ($main) will share the work with: $*"
  echo "  Next: $0 deploy"
}

# The .env for an app server: this server's settings, with the addresses of what runs here.
node_env() {
  local ip=$1 main pg redis smtp livekit otel
  main=$(get PRIVATE_IP)
  pg=$(get POSTGRES_PASSWORD)
  redis=$(get REDIS_PASSWORD)
  smtp=$(get SMTP_URL)
  livekit=$(get LIVEKIT_API_URL)
  otel=$(get OTEL_SERVICE_NAME)
  echo "# Made by scripts/linux/cluster.sh on the main server, and replaced on every deploy:"
  echo "# change settings in the main server's .env, then run cluster.sh deploy there."
  grep -Ev '^(COMPOSE_[A-Z_]*|PRIVATE_IP|CLUSTER_[A-Z_]*|WEB_UPSTREAMS|REALTIME_UPSTREAMS|POSTGRES_[A-Z_]*|REDIS_PASSWORD|EXTERNAL_[A-Z_]*|DATABASE_URL|DATABASE_PREPARE|REDIS_QUEUE_URL|REDIS_CACHE_URL|SMTP_URL|LIVEKIT_API_URL|OTEL_SERVICE_NAME)=' .env |
    grep -v '^# Magnox server settings' || true
  cat <<ENV

# This app server, and the main server's services it uses.
PRIVATE_IP=$ip
DATABASE_URL=$(get EXTERNAL_DATABASE_URL | grep . || echo "postgres://magnox:${pg:-magnox}@$main:5432/magnox")
DATABASE_PREPARE=$(get EXTERNAL_DATABASE_PREPARE | grep . || echo true)
REDIS_QUEUE_URL=$(get EXTERNAL_REDIS_QUEUE_URL | grep . || echo "redis://:$redis@$main:6379/0")
REDIS_CACHE_URL=$(get EXTERNAL_REDIS_CACHE_URL | grep . || echo "redis://:$redis@$main:6380/0")
SMTP_URL=${smtp:-smtp://$main:1025}
LIVEKIT_API_URL=${livekit:-http://$main:7880}
OTEL_SERVICE_NAME=${otel:-magnox}
ENV
}

# Wait for a URL to answer (from this server), up to two minutes.
wait_for() {
  local url=$1
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null --max-time 3 "$url" 2>/dev/null && return 0
    sleep 2
  done
  return 1
}

# Wait for this server's web app, up to two minutes.
wait_here() {
  for _ in $(seq 1 60); do
    docker compose exec -T web node -e \
      "fetch('http://localhost:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" \
      2>/dev/null && return 0
    sleep 2
  done
  return 1
}

deploy() {
  local list ip dir
  list=$(nodes)
  dir=$(node_dir)
  command -v curl >/dev/null || die "curl is needed (apt install curl)."

  echo "▸ Building"
  docker compose build

  # Every server runs exactly this build: the pages one server sends must match the scripts and
  # actions the others answer for.
  for ip in $list; do
    echo "▸ Sending it to $ip"
    on_node "$ip" "mkdir -p $dir"
    node_env "$ip" | on_node "$ip" "umask 077 && cat > $dir/.env"
    on_node "$ip" "cat > $dir/docker-compose.node.yml" <docker-compose.node.yml
    docker save magnox-web magnox-realtime | gzip -1 | on_node "$ip" "gunzip | docker load -q"
  done

  echo "▸ Updating this server (migrations run first)"
  docker compose up -d
  wait_here || die "The web app on this server isn't answering: see docker compose logs web"

  for ip in $list; do
    echo "▸ Updating $ip"
    on_node "$ip" "cd $dir && docker compose -f docker-compose.node.yml up -d"
    wait_for "http://$ip:3000/api/health" || die "The web app on $ip isn't answering: see
  ssh $(ssh_user)@$ip 'cd $dir && docker compose -f docker-compose.node.yml logs web'"
    wait_for "http://$ip:3001/health" || die "The realtime server on $ip isn't answering."
    # Old versions' images.
    on_node "$ip" "docker image prune -f >/dev/null" || true
  done
  echo "✔ Every server is up to date."
}

status() {
  local list ip url
  list=$(nodes)
  for ip in $list; do
    for url in "http://$ip:3000/api/health" "http://$ip:3001/health"; do
      if curl -fsS -o /dev/null --max-time 3 "$url" 2>/dev/null; then
        echo "✔ $url"
      else
        echo "✘ $url"
      fi
    done
  done
  docker compose ps --format 'table {{.Service}}\t{{.Status}}'
}

case "${1:-}" in
  setup) shift && setup "$@" ;;
  deploy) deploy ;;
  status) status ;;
  *) usage ;;
esac
