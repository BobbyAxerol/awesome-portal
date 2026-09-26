#!/usr/bin/env bash
# OL-05 · isolated P22 publication preview.
#
#   p22-publication.sh init|build|up|status|down|teardown|compose
#
# This never uses the shared :8095 preview and never prints the private env.
# Credentials and data stay in a host-bound 0600 directory. Teardown filters
# only this Compose project so stable/dev/other research cells are untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="portal-research-p22-publication"
ENV_DIR="${RESEARCH_P22_HOME:-$HOME/.config/$PROJECT}"
ENV_FILE="$ENV_DIR/preview.env"
IDENTITY_FILE="$ENV_DIR/identity.json"
FORBIDDEN_PORTS=" 8080 8081 8090 8095 8096 18081 "
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); else
    echo "p22: Docker is unavailable" >&2; exit 1
  fi
fi
compose() {
  [[ -f "$ENV_FILE" ]] || { echo "p22: run init first" >&2; exit 1; }
  local port
  port="$(sed -n 's/^PORTAL_HTTP_PORT=//p' "$ENV_FILE")"
  case "$FORBIDDEN_PORTS" in *" $port "*) echo "p22: forbidden port $port" >&2; exit 1;; esac
  [[ "$port" =~ ^[0-9]{4,5}$ ]] || { echo "p22: invalid loopback port" >&2; exit 1; }
  "${DOCKER[@]}" compose -p "$PROJECT" --project-directory "$ROOT" --env-file "$ENV_FILE"     -f "$ROOT/compose.yaml"     -f "$ROOT/deploy/compose.research-progress.yaml"     -f "$ROOT/deploy/research-preview/compose.research-preview.yaml"     -f "$ROOT/deploy/research-preview/compose.research-p22-publication.yaml" "$@"
}
cmd_init() {
  if [[ -f "$ENV_FILE" ]]; then echo "p22: $ENV_FILE exists; leaving it"; return; fi
  local port="${RESEARCH_P22_PORT:-8097}" gid
  case "$FORBIDDEN_PORTS" in *" $port "*) echo "p22: port $port is reserved" >&2; exit 1;; esac
  gid="$(getent group primus-market-data-readers | cut -d: -f3)"
  [[ -n "$gid" ]] || { echo "p22: historical-data reader group is missing" >&2; exit 1; }
  umask 077; mkdir -p "$ENV_DIR/control-api-secrets"
  cat >"$ENV_FILE" <<ENV
# OL-05 P22 isolated stack; host-bound, never commit or print.
PORTAL_STACK_NAME=$PROJECT
PORTAL_HTTP_PORT=$port
PORTAL_IMAGE_PREFIX=local/portal-research-p22
PORTAL_IMAGE_TAG=ol05
PORTAL_ENV=local
PORTAL_PUBLIC_ORIGIN=http://127.0.0.1:$port
CONTROL_API_AUTH_MODE=dev
CONTROL_API_SECRETS_DIR=$ENV_DIR/control-api-secrets
CONTROL_API_INTERNAL_PRINCIPAL_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48)
PORTAL_HISTORICAL_DATA_MODE=required
PORTAL_HISTORICAL_DATA_DIR=/srv/primus/historical-market-data/storage
PORTAL_HMD_READER_GID=$gid
CONTROL_API_FEATURE_RESEARCH_RUN_PRODUCER=true
CONTROL_API_FEATURE_RESEARCH_PROGRESS=true
CONTROL_API_FEATURE_RESEARCH_RUN_LIBRARY=true
CONTROL_API_FEATURE_RESEARCH_EVIDENCE=true
CONTROL_API_FEATURE_RESEARCH_SPLIT=true
CONTROL_API_FEATURE_RESEARCH_SEARCH=true
CONTROL_API_FEATURE_RESEARCH_FREEZE=true
CONTROL_API_FEATURE_RESEARCH_CURRENT_SOURCE=true
CONTROL_API_FEATURE_RESEARCH_RETAINED_ARTIFACTS=true
CONTROL_API_FEATURE_RESEARCH_WFO_PROFILE=true
CONTROL_API_FEATURE_RESEARCH_REPLAY=true
CONTROL_API_FEATURE_RESEARCH_REPORTS=true
CONTROL_API_FEATURE_RESEARCH_LINEAGE=true
CONTROL_API_FEATURE_RESEARCH_COMPARE=true
CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=true
CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION=true
PORTAL_FEATURE_RESEARCH_RUN_PRODUCER=true
PORTAL_FEATURE_RESEARCH_PROGRESS=true
PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS=true
PORTAL_FEATURE_RESEARCH_WFO_PROFILE=true
CONTROL_API_QUERY_CURSOR_KEYS_JSON={"query-k1":"$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48)"}
CONTROL_API_GOVERNANCE_APPLY_KEYS_JSON={"governance-k1":"$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48)"}
ENV
  chmod 600 "$ENV_FILE"; echo "p22: initialized isolated env at $ENV_DIR (port $port)"
}
cmd_build() {
  local wheel="$ROOT/vendor/hmd-reader/primus_historical_market_data-0.1.0rc3-py3-none-any.whl"
  [[ -f "$wheel" ]] || { echo "p22: stage the approved HMD wheel at $wheel" >&2; exit 1; }
  local sha dirty=false; sha="$(git -C "$ROOT" rev-parse HEAD)"; [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || dirty=true
  PORTAL_BUILD_COMMIT="$sha" PORTAL_BUILD_DIRTY="$dirty" compose build --build-arg PORTAL_HMD_READER_REQUIRED=true portal-api control-api portal-web roadmap-task-board-api
}
record_identity() {
  local sha; sha="$(git -C "$ROOT" rev-parse HEAD)"
  { printf '{
  "project": "%s",
  "git_commit": "%s",
  "recorded_at_utc": "%s",
  "images": {
' "$PROJECT" "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)";
    local first=1 service id image; for service in portal-api control-api portal-web roadmap-task-board-api quant-worker-py; do
      id="$(compose ps -q "$service" | head -n1)"; [[ -n "$id" ]] || continue; image="$("${DOCKER[@]}" inspect -f '{{.Image}}' "$id")";
      [[ $first -eq 1 ]] || printf ',
'; printf '    "%s": "%s"' "$service" "$image"; first=0; done
    printf '
  },
  "migrations": "%s"
}
' "$(ls "$ROOT/apps/control-api/migrations" | tail -n1)"; } >"$IDENTITY_FILE"
  chmod 600 "$IDENTITY_FILE"; echo "p22: identity recorded at $IDENTITY_FILE"
}
cmd_up() { local sha; sha="$(git -C "$ROOT" rev-parse HEAD)"; PORTAL_BUILD_COMMIT="$sha" compose up -d --no-build portal-web quant-worker-py; record_identity; }
cmd_status() { compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'; [[ -f "$IDENTITY_FILE" ]] && cat "$IDENTITY_FILE"; }
cmd_down() { compose down; }
cmd_teardown() { compose down; local volumes; volumes="$("${DOCKER[@]}" volume ls -q --filter "label=com.docker.compose.project=$PROJECT")"; [[ -z "$volumes" ]] || "${DOCKER[@]}" volume rm $volumes; echo "p22: removed only $PROJECT"; }
case "${1:-}" in init) cmd_init;; build) cmd_build;; up) cmd_up;; status) cmd_status;; down) cmd_down;; teardown) cmd_teardown;; compose) shift; compose "$@";; *) sed -n '2,12p' "$0"; exit 2;; esac
