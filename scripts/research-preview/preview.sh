#!/usr/bin/env bash
# RF02-B3 · isolated Research preview stack (Q6).
#
#   scripts/research-preview/preview.sh init       # write the host-bound env file (once)
#   scripts/research-preview/preview.sh build      # build the four images from this checkout
#   scripts/research-preview/preview.sh up         # migrate, bootstrap, start; records identity
#   scripts/research-preview/preview.sh activate   # print one-time activation credentials (stdout only)
#   scripts/research-preview/preview.sh status     # containers, images, git SHA, health
#   scripts/research-preview/preview.sh down       # stop, keep volumes
#   scripts/research-preview/preview.sh teardown   # stop and delete this project's volumes
#
# Safety rails, all enforced here rather than remembered:
#   - the compose project is always `portal-research-preview`;
#   - the port may not be dev (8080), showcase (8081), Execution probe (8090)
#     or stable (18081), and must be loopback-bound (compose.yaml does that);
#   - the env file lives outside the checkout, mode 0600, and is never printed;
#   - teardown removes only volumes labelled with this project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="portal-research-preview"
ENV_DIR="${RESEARCH_PREVIEW_HOME:-$HOME/.config/portal-research-preview}"
ENV_FILE="$ENV_DIR/preview.env"
IDENTITY_FILE="$ENV_DIR/identity.json"
FORBIDDEN_PORTS=" 8080 8081 8090 18081 "

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); else
    echo "preview: cannot reach Docker directly or via passwordless sudo" >&2; exit 1
  fi
fi

compose() {
  [[ -f "$ENV_FILE" ]] || { echo "preview: run '$0 init' first" >&2; exit 1; }
  local port
  port="$(sed -n 's/^PORTAL_HTTP_PORT=//p' "$ENV_FILE")"
  case "$FORBIDDEN_PORTS" in *" $port "*)
    echo "preview: port $port belongs to another stack; refusing" >&2; exit 1;;
  esac
  [[ "$port" =~ ^[0-9]{4,5}$ ]] || { echo "preview: PORTAL_HTTP_PORT is not a port" >&2; exit 1; }
  "${DOCKER[@]}" compose -p "$PROJECT" --project-directory "$ROOT" --env-file "$ENV_FILE" \
    -f "$ROOT/compose.yaml" \
    -f "$ROOT/deploy/compose.research-progress.yaml" \
    -f "$ROOT/deploy/research-preview/compose.research-preview.yaml" "$@"
}

cmd_init() {
  if [[ -f "$ENV_FILE" ]]; then echo "preview: $ENV_FILE exists; leaving it"; return; fi
  local port="${RESEARCH_PREVIEW_PORT:-8095}"
  case "$FORBIDDEN_PORTS" in *" $port "*) echo "preview: port $port is taken by another stack" >&2; exit 1;; esac
  local gid
  gid="$(getent group primus-market-data-readers | cut -d: -f3)"
  [[ -n "$gid" ]] || { echo "preview: group primus-market-data-readers not found" >&2; exit 1; }
  umask 077
  mkdir -p "$ENV_DIR/control-api-secrets"
  cat >"$ENV_FILE" <<ENV
# Research preview (RF02-B3). Host-bound; never commit or print.
PORTAL_STACK_NAME=$PROJECT
PORTAL_HTTP_PORT=$port
PORTAL_IMAGE_PREFIX=local/portal-research-preview
PORTAL_IMAGE_TAG=rf02
# AUTH_MODE=dev stands in for Cloudflare Access and is only allowed with local.
PORTAL_ENV=local
PORTAL_PUBLIC_ORIGIN=http://localhost:$port
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
PORTAL_FEATURE_RESEARCH_RUN_PRODUCER=true
PORTAL_FEATURE_RESEARCH_PROGRESS=true
CONTROL_API_QUERY_CURSOR_KEYS_JSON={"query-k1":"$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48)"}
CONTROL_API_GOVERNANCE_APPLY_KEYS_JSON={"governance-k1":"$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48)"}
ENV
  chmod 600 "$ENV_FILE"
  echo "preview: wrote $ENV_FILE (port $port)"
}

cmd_build() {
  # The approved Historical Market Data reader is a code-only wheel staged into
  # the ignored vendor/hmd-reader directory; the image refuses to build
  # without it rather than start a portal-api that cannot read data.
  local wheel="$ROOT/vendor/hmd-reader/primus_historical_market_data-0.1.0rc3-py3-none-any.whl"
  [[ -f "$wheel" ]] || { echo "preview: stage the approved HMD reader wheel at $wheel" >&2; exit 1; }
  local sha dirty=false
  sha="$(git -C "$ROOT" rev-parse HEAD)"
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || dirty=true
  PORTAL_BUILD_COMMIT="$sha" PORTAL_BUILD_DIRTY="$dirty" compose build \
    --build-arg PORTAL_HMD_READER_REQUIRED=true portal-api control-api portal-web roadmap-task-board-api
}

record_identity() {
  local sha
  sha="$(git -C "$ROOT" rev-parse HEAD)"
  {
    printf '{\n  "project": "%s",\n  "git_commit": "%s",\n  "recorded_at_utc": "%s",\n  "images": {\n' \
      "$PROJECT" "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    local first=1
    for service in portal-api control-api portal-web roadmap-task-board-api quant-worker-py; do
      local id
      id="$(compose ps -q "$service" | head -n1)"
      [[ -n "$id" ]] || continue
      local image
      image="$("${DOCKER[@]}" inspect -f '{{.Image}}' "$id")"
      [[ $first -eq 1 ]] || printf ',\n'
      printf '    "%s": "%s"' "$service" "$image"
      first=0
    done
    printf '\n  },\n  "migrations": "%s"\n}\n' \
      "$(ls "$ROOT/apps/control-api/migrations" | tail -n1)"
  } >"$IDENTITY_FILE"
  chmod 600 "$IDENTITY_FILE"
  echo "preview: identity recorded in $IDENTITY_FILE"
}

cmd_up() {
  local sha
  sha="$(git -C "$ROOT" rev-parse HEAD)"
  PORTAL_BUILD_COMMIT="$sha" compose up -d --no-build portal-web quant-worker-py
  record_identity
}

cmd_activate() {
  compose run --rm --no-deps control-api-bootstrap \
    node dist/cli/bootstrap.js --file bootstrap-users.yaml --print-one-time-credentials
}

cmd_status() {
  compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
  [[ -f "$IDENTITY_FILE" ]] && cat "$IDENTITY_FILE"
  local port
  port="$(sed -n 's/^PORTAL_HTTP_PORT=//p' "$ENV_FILE")"
  curl -fsS -o /dev/null -w "web :$port → %{http_code}\n" "http://127.0.0.1:$port/" || true
}

cmd_down() { compose down; }

cmd_teardown() {
  compose down
  local volumes
  volumes="$("${DOCKER[@]}" volume ls -q --filter "label=com.docker.compose.project=$PROJECT")"
  if [[ -n "$volumes" ]]; then
    # shellcheck disable=SC2086
    "${DOCKER[@]}" volume rm $volumes
  fi
  echo "preview: removed project $PROJECT and its volumes; dev/stable/probe untouched"
}

case "${1:-}" in
  init) cmd_init ;;
  build) cmd_build ;;
  up) cmd_up ;;
  activate) cmd_activate ;;
  status) cmd_status ;;
  down) cmd_down ;;
  teardown) cmd_teardown ;;
  compose) shift; compose "$@" ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
