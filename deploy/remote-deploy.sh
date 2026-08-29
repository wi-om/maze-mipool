#!/usr/bin/env bash
# Runs ON server2 (k8s-dev), from ~/build/maze-mipool.
set -euo pipefail

APP_HOST="${APP_HOST:-democc.mipool.io}"
APP_ORIGIN="//$APP_HOST"
NS=delta-mipool-dev
SECRET=delta-mipool-env
BACKEND_IMAGE=delta-mipool-backend:dev
FRONTEND_IMAGE=delta-mipool-frontend:dev

cd "$(dirname "$0")/.."
BUILD_ROOT="$(pwd)"
K="sudo k3s kubectl"

sudo chmod 666 /var/run/docker.sock || true

for f in env/backend.env env/frontend.env; do
  sed -i '1s/^\xEF\xBB\xBF//; s/\r$//' "$f"
  if ! grep -qE '^[A-Za-z_][A-Za-z0-9_]*=' "$f"; then
    echo "$f has no KEY=VALUE lines — refusing to build a broken secret." >&2
    exit 1
  fi
done

echo "==> [1/4] Building images"
docker build -t "$BACKEND_IMAGE" ./backend

# In-cluster backend is the real API (not APIM), so no subscription key.
docker build \
  --build-arg VITE_BACKEND_URL="$APP_ORIGIN" \
  --build-arg VITE_MS_API_SUBSCRIPTION_KEY="" \
  --build-arg VITE_GRAFANA_FARO_URL="" \
  -t "$FRONTEND_IMAGE" ./frontend

echo "==> [2/4] Importing into k3s"
for image in "$BACKEND_IMAGE" "$FRONTEND_IMAGE"; do
  docker save "$image" | sudo k3s ctr images import -
done

echo "==> [3/4] Namespace + secret + manifests"
$K create namespace "$NS" --dry-run=client -o yaml | $K apply -f -
$K -n "$NS" create secret generic "$SECRET" \
  --from-env-file=env/backend.env \
  --dry-run=client -o yaml | $K apply -f -
$K apply -f deploy/k8s-dev.yaml

PG=$($K -n platform get pods -l app=postgres -o jsonpath='{.items[0].metadata.name}')
$K -n platform exec "$PG" -- psql -U itcart -d itcart_marketplace \
  -c "CREATE SCHEMA IF NOT EXISTS mipool"

echo "==> [4/4] Rollout + smoke"
$K -n "$NS" rollout restart deploy/backend deploy/frontend
failed=0
for deploy in backend frontend; do
  if ! $K -n "$NS" rollout status "deploy/$deploy" --timeout=300s; then
    $K -n "$NS" logs "deploy/$deploy" --tail=120 || true
    failed=1
  fi
done
$K -n "$NS" get pods,svc,ingress
[[ "$failed" == 0 ]] || exit 1

smoke() {
  local path="$1" code=000
  for attempt in $(seq 1 20); do
    code=$(curl -sS -o /dev/null -w '%{http_code}' -m 30 \
      -H "Host: $APP_HOST" "http://127.0.0.1:31812$path" || true)
    [[ "$code" == 200 ]] && break
    echo "    $APP_HOST$path -> HTTP $code (attempt $attempt)"
    sleep 3
  done
  echo "    $APP_HOST$path -> HTTP $code"
  test "$code" = 200
}
smoke /healthz
smoke /api/health
echo REMOTE_DEPLOY_OK
