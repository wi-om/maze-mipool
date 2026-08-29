#!/usr/bin/env bash
# Deploy maze-mipool to k8s-dev (server2) → democc.mipool.io
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export APP_HOST="${APP_HOST:-democc.mipool.io}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/server2_wiadmin}"
SSH_HOST="${SSH_HOST:-server2.workinfinity.com}"
SSH_PORT="${SSH_PORT:-2223}"
SSH_USER="${SSH_USER:-wiadmin}"
CONTROL_PATH="${SSH_CONTROL_PATH:-/tmp/maze-mipool-dev-ssh-%C}"
REMOTE_ROOT="~/build/maze-mipool"

SSH_OPTS=(
  -i "$SSH_KEY"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
  -o BatchMode=yes
  -o ConnectTimeout=10
  -o ConnectionAttempts=20
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=8
  -o ControlMaster=auto
  -o "ControlPath=$CONTROL_PATH"
  -o ControlPersist=45m
  -p "$SSH_PORT"
)
SSH=(ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST")
RSYNC_RSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10 -o ConnectionAttempts=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=8 -o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=45m -p $SSH_PORT"

cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "$SSH_USER@$SSH_HOST" 2>/dev/null || true
}
trap cleanup EXIT

for dir in backend frontend; do
  if [[ ! -f "$ROOT/$dir/.env" ]]; then
    echo "Missing $dir/.env" >&2
    exit 1
  fi
  if [[ ! -s "$ROOT/$dir/.env" ]]; then
    echo "$dir/.env is empty on disk — save it before deploying." >&2
    exit 1
  fi
done

echo "==> Waiting for SSH to k8s-dev"
connected=0
for attempt in $(seq 1 8); do
  if "${SSH[@]}" 'echo "Connected to $(hostname)"'; then
    connected=1
    break
  fi
  sleep 10
done
[[ "$connected" == 1 ]] || { echo "Could not reach k8s-dev" >&2; exit 1; }

echo "==> Syncing source"
"${SSH[@]}" "rm -rf $REMOTE_ROOT/env && mkdir -p $REMOTE_ROOT/{backend,frontend,deploy,env} && chmod 700 $REMOTE_ROOT/env"
rsync -az --delete --partial --timeout=120 -e "$RSYNC_RSH" \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude .env --exclude '.env.*' --exclude scripts \
  "$ROOT/backend/" "$SSH_USER@$SSH_HOST:$REMOTE_ROOT/backend/"
rsync -az --delete --partial --timeout=120 -e "$RSYNC_RSH" \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude .env --exclude '.env.*' \
  "$ROOT/frontend/" "$SSH_USER@$SSH_HOST:$REMOTE_ROOT/frontend/"
rsync -az --delete --partial --timeout=120 -e "$RSYNC_RSH" \
  "$ROOT/deploy/" "$SSH_USER@$SSH_HOST:$REMOTE_ROOT/deploy/"
rsync -az --partial --timeout=60 -e "$RSYNC_RSH" \
  "$ROOT/backend/.env" "$SSH_USER@$SSH_HOST:$REMOTE_ROOT/env/backend.env"
rsync -az --partial --timeout=60 -e "$RSYNC_RSH" \
  "$ROOT/frontend/.env" "$SSH_USER@$SSH_HOST:$REMOTE_ROOT/env/frontend.env"

echo "==> Building and deploying on k8s-dev"
"${SSH[@]}" "APP_HOST='$APP_HOST' bash $REMOTE_ROOT/deploy/remote-deploy.sh"

echo "DEPLOY_OK"
echo "  mipool : https://$APP_HOST"
