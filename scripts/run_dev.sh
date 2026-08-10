#!/usr/bin/env bash
set -euo pipefail

# Start backend + frontend in the background and show their health.
# Usage: ./scripts/run_dev.sh
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/scripts/run_backend.sh" > /tmp/portal_backend.log 2>&1 &
BACKEND_PID=$!
"${ROOT_DIR}/scripts/run_frontend.sh" > /tmp/portal_frontend.log 2>&1 &
FRONTEND_PID=$!

echo "backend  pid=${BACKEND_PID}  log=/tmp/portal_backend.log"
echo "frontend pid=${FRONTEND_PID}  log=/tmp/portal_frontend.log"
echo "waiting for servers..."

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/api/health > /dev/null; then
    echo "backend  OK   http://127.0.0.1:8000/api/docs"
    break
  fi
  sleep 1
done

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:5173/ > /dev/null; then
    echo "frontend OK   http://127.0.0.1:5173"
    break
  fi
  sleep 1
done

echo
echo "Open the portal in your local browser: http://127.0.0.1:5173"
echo "Stop: kill ${BACKEND_PID} ${FRONTEND_PID}"
