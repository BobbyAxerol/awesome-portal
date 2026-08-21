#!/usr/bin/env bash
# 00_runtime_identity.sh — READ-ONLY runtime identity re-verification (handoff 7.1).
# Uses only: git rev-parse/status, docker compose ps, docker image ls --digests,
# docker stats --no-stream, curl GET on public health endpoints.
# Explicitly NOT used: docker inspect, docker compose config, env/printenv, any mutation.
set -uo pipefail

TS_ROOT="${TS_ROOT:-/home/bobby/trading_system}"
DL_ROOT="${DL_ROOT:-/home/bobby/data_layer}"
PACK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$PACK/evidence/phaseF"
mkdir -p "$OUT"

{
  echo "# Runtime identity snapshot (read-only)"
  echo "captured_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host: $(hostname)"
  echo
  echo "## trading_system git"
  echo "HEAD: $(git -C "$TS_ROOT" rev-parse HEAD 2>/dev/null)"
  echo "branch: $(git -C "$TS_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "describe: $(git -C "$TS_ROOT" describe --tags --always 2>/dev/null)"
  echo "status:"
  git -C "$TS_ROOT" status --short --branch 2>/dev/null | sed 's/^/  /'
  echo
  echo "## data_layer git"
  echo "HEAD: $(git -C "$DL_ROOT" rev-parse HEAD 2>/dev/null)"
  echo "branch: $(git -C "$DL_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "status:"
  git -C "$DL_ROOT" status --short --branch 2>/dev/null | sed 's/^/  /'
  echo
  echo "## running containers (name / image / status / created)"
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}' 2>/dev/null | sort | sed 's/^/  /'
  echo
  echo "## image digests"
  docker image ls --digests --format '{{.Repository}}:{{.Tag}}\t{{.Digest}}\t{{.ID}}\t{{.CreatedAt}}' 2>/dev/null \
    | grep -Ei 'tradingsystem|timescale|redis|data-layer|data_layer' | sort | sed 's/^/  /'
  echo
  echo "## resource usage snapshot"
  docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' 2>/dev/null | sort | sed 's/^/  /'
  echo
  echo "## host resources"
  echo "  cpus: $(nproc 2>/dev/null)"
  free -h 2>/dev/null | sed 's/^/  /'
  df -h / 2>/dev/null | sed 's/^/  /'
} > "$OUT/runtime_identity.txt" 2>&1

# Public read-only endpoint probes (GET only)
probe() {  # probe <name> <url>
  local name="$1" url="$2"
  local code
  code=$(curl -s -o "$OUT/$name.json" -w '%{http_code}' --max-time 10 "$url" 2>/dev/null)
  echo "$name  $url  HTTP $code  bytes=$(wc -c < "$OUT/$name.json" 2>/dev/null || echo 0)"
}

{
  echo "# Public GET probes $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  probe gw_openapi        "http://127.0.0.1:8000/openapi.json"
  probe gw_health         "http://127.0.0.1:8000/v1/health"
  probe gw_capabilities   "http://127.0.0.1:8000/v1/health/capabilities"
  probe gw_contracts      "http://127.0.0.1:8000/v1/contracts"
  probe dl_openapi        "http://127.0.0.1:8100/openapi.json"
  probe dl_health         "http://127.0.0.1:8100/v1/health"
} > "$OUT/probe_log.txt" 2>&1

cat "$OUT/probe_log.txt"
echo "--- wrote $OUT/runtime_identity.txt ---"
