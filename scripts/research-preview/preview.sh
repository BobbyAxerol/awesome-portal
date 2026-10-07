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
  # sudo strips caller environment. Forward only these non-secret source
  # stamps, including cmd_build's temporary assignment, not the whole env.
  local compose_docker=("${DOCKER[@]}")
  if [[ "${DOCKER[0]}" == sudo ]]; then
    compose_docker=(sudo -n env "PORTAL_BUILD_COMMIT=${PORTAL_BUILD_COMMIT:-unknown}" \
      "PORTAL_BUILD_DIRTY=${PORTAL_BUILD_DIRTY:-false}" docker)
  fi
  "${compose_docker[@]}" compose -p "$PROJECT" --project-directory "$ROOT" --env-file "$ENV_FILE" \
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
# Bobby 2026-09-30: research-portal is a quick-look site — no login screen. The automation
# account holds the preview's runs; Control API refuses this outside AUTH_MODE=dev + PORTAL_ENV=local.
PREVIEW_AUTO_LOGIN_USERNAME=claude-preview
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
# FULL-02 is opened only after its exact ordinary product receipts qualify.
CONTROL_API_FEATURE_RESEARCH_FULL02_PROFILE=false
CONTROL_API_FEATURE_RESEARCH_FULL03_PROFILE=false
CONTROL_API_FEATURE_RESEARCH_FULL04_PROFILE=false
CONTROL_API_FEATURE_RESEARCH_FULL05_PROFILE=false
CONTROL_API_FEATURE_RESEARCH_FULL06_PROFILE=false
CONTROL_API_FEATURE_RESEARCH_REPLAY=true
CONTROL_API_FEATURE_RESEARCH_REPORTS=true
CONTROL_API_FEATURE_RESEARCH_LINEAGE=true
CONTROL_API_FEATURE_RESEARCH_COMPARE=true
CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=true
CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION=true
CONTROL_API_FEATURE_RESEARCH_IMPORTED_EXECUTION=true
CONTROL_API_FEATURE_RESEARCH_ARTIFACT_BYTE_VERIFY=true
CONTROL_API_FEATURE_RESEARCH_WHATIF=true
PORTAL_FEATURE_RESEARCH_RUN_PRODUCER=true
PORTAL_FEATURE_RESEARCH_PROGRESS=true
PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS=true
PORTAL_FEATURE_RESEARCH_WFO_PROFILE=true
PORTAL_FEATURE_RESEARCH_FULL02_PROFILE=false
PORTAL_FEATURE_RESEARCH_FULL03_PROFILE=false
PORTAL_FEATURE_RESEARCH_FULL04_PROFILE=false
PORTAL_FEATURE_RESEARCH_FULL05_PROFILE=false
PORTAL_FEATURE_RESEARCH_FULL06_PROFILE=false
PORTAL_FEATURE_RESEARCH_IMPORTED_EXECUTION=true
PORTAL_FEATURE_RESEARCH_WHATIF=true
# Bobby 2026-09-30: preview-only long Delta WFO (2..400 trials, 1800/3600 s child).
CONTROL_API_FEATURE_RESEARCH_PREVIEW_LONG_WFO=true
PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO=true
CONTROL_API_QUERY_CURSOR_KEYS_JSON={"query-k1":"$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48)"}
CONTROL_API_GOVERNANCE_APPLY_KEYS_JSON={"governance-k1":"$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48)"}
ENV
  chmod 600 "$ENV_FILE"
  echo "preview: wrote $ENV_FILE (port $port)"
}

cmd_build() {
  local services=("$@")
  [[ ${#services[@]} -gt 0 ]] || services=(portal-api control-api portal-web roadmap-task-board-api)
  local service
  for service in "${services[@]}"; do
    case "$service" in portal-api|control-api|portal-web|roadmap-task-board-api) ;;
      *) echo "preview: unsupported build service $service" >&2; return 1;;
    esac
  done
  # The approved Historical Market Data reader is a code-only wheel staged into
  # the ignored vendor/hmd-reader directory; the image refuses to build
  # without it rather than start a portal-api that cannot read data.
  local wheel="$ROOT/vendor/hmd-reader/primus_historical_market_data-0.1.0rc3-py3-none-any.whl"
  [[ -f "$wheel" ]] || { echo "preview: stage the approved HMD reader wheel at $wheel" >&2; exit 1; }
  local sha dirty=false
  sha="$(git -C "$ROOT" rev-parse HEAD)"
  [[ -z "$(git -C "$ROOT" status --porcelain)" ]] || dirty=true
  PORTAL_BUILD_COMMIT="$sha" PORTAL_BUILD_DIRTY="$dirty" compose build \
    --build-arg PORTAL_HMD_READER_REQUIRED=true "${services[@]}"
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
  if [[ $# -gt 0 ]]; then
    local service
    for service in "$@"; do
      case "$service" in control-api|portal-web|portal-api|quant-worker-py) ;;
        *) echo "preview: scoped application rollout excludes DB/NATS/migrations/bootstrap" >&2; return 1;;
      esac
    done
    if [[ " $* " == *" portal-api "* || " $* " == *" quant-worker-py "* ]]; then
      local active_children
      active_children="$(compose exec -T portal-postgres sh -c 'exec psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' sh "
        SELECT count(*) FROM research.jobs j LEFT JOIN research.worker_attempts w
          ON w.workspace_id=j.workspace_id AND w.worker_attempt_id=j.current_worker_attempt_id
        WHERE j.state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED') AND NOT COALESCE(
          j.state='CLAIMED' AND w.state='CLAIMED' AND w.worker_id='research-producer-v1'
          AND w.expires_at<=now() AND EXISTS (SELECT 1 FROM research.run_producers p
            WHERE p.workspace_id=j.workspace_id AND p.run_id=j.run_id AND p.dispatch_state='PENDING'), false)
      ")"
      [[ "$active_children" == "0" ]] || { echo "preview: preserve in-flight children; retry rollout when idle" >&2; return 1; }
    fi
    # Explicit application services only: no migration/bootstrap or DB/NATS
    # dependency restart. Before an API/worker change the operator must verify
    # there is no in-flight admitted child; never cancel work to deploy.
    PORTAL_BUILD_COMMIT="$sha" compose up -d --no-build --no-deps "$@"
  else
    PORTAL_BUILD_COMMIT="$sha" compose up -d --no-build portal-web quant-worker-py
  fi
  # A backend-only build leaves nginx running, with its startup-resolved old
  # Docker addresses. Re-resolve after Compose has made the new APIs healthy;
  # never report a healthy static index while all same-origin APIs return 502.
  compose exec -T portal-web nginx -t
  compose exec -T portal-web nginx -s reload
  local port
  port="$(sed -n 's/^PORTAL_HTTP_PORT=//p' "$ENV_FILE")"
  curl --fail --silent --show-error --retry 5 --retry-delay 1 --retry-all-errors \
    --connect-timeout 3 --max-time 5 --output /dev/null \
    "http://127.0.0.1:$port/api/control/readyz"
  curl --fail --silent --show-error --retry 10 --retry-delay 1 --retry-all-errors \
    --connect-timeout 3 --max-time 5 --output /dev/null \
    "http://127.0.0.1:$port/api/ready"
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
  build) shift; cmd_build "$@" ;;
  up) shift; cmd_up "$@" ;;
  activate) cmd_activate ;;
  status) cmd_status ;;
  down) cmd_down ;;
  teardown) cmd_teardown ;;
  compose) shift; compose "$@" ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
