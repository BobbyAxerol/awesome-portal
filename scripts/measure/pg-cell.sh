#!/usr/bin/env bash
# ELP2-10 measurement cell: disposable PostgreSQL + node, parametrised caps (closes protocol gap G-1).
#
# Same isolation as scripts/control-api-test.sh (internal-only network, read-only rootfs, tmpfs state, pinned image
# digests, source copied into a disposable mount) but: (1) the CPU / memory caps are arguments, (2) vitest writes a JSON
# report into an output directory this script owns, (3) container resource use is sampled while the tests run, (4) no
# restore drill, (5) the cell can repeat the run N times against a FRESH PostgreSQL each time, and (6) cleanup is read
# back (containers / networks carrying this run's suffix must be zero).
#
# It starts only containers named elp210m-*-<suffix> and a network elp210m-net-<suffix>, and removes only those. It never
# touches any other container, image or volume, and never prunes. Callers hold /tmp/portal-heavy.lock around it.
#
#   scripts/measure/pg-cell.sh --out DIR [--reps 2] [--node-cpus 2] [--node-mem 2g] [--pg-cpus 1] [--pg-mem 1g] \
#       [--timeout-s 900] -- test/a.spec.ts test/b.spec.ts
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/control-api"
OUT=""; REPS=2; NODE_CPUS=2; NODE_MEM=2g; PG_CPUS=1; PG_MEM=1g; TIMEOUT_S=900
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --reps) REPS="$2"; shift 2 ;;
    --node-cpus) NODE_CPUS="$2"; shift 2 ;;
    --node-mem) NODE_MEM="$2"; shift 2 ;;
    --pg-cpus) PG_CPUS="$2"; shift 2 ;;
    --pg-mem) PG_MEM="$2"; shift 2 ;;
    --timeout-s) TIMEOUT_S="$2"; shift 2 ;;
    --) shift; break ;;
    *) printf 'unknown option %s\n' "$1" >&2; exit 2 ;;
  esac
done
[[ -n "${OUT}" ]] || { printf '--out is required\n' >&2; exit 2; }
[[ "${REPS}" =~ ^[1-9][0-9]?$ ]] || { printf '--reps must be 1..99\n' >&2; exit 2; }
for test_file in "$@"; do
  if [[ ! "${test_file}" =~ ^test/[A-Za-z0-9._-]+\.spec\.ts$ ]] || [[ ! -f "${APP_DIR}/${test_file}" ]]; then
    printf 'Invalid Control API test path: %s\n' "${test_file}" >&2; exit 2
  fi
done
[[ $# -gt 0 ]] || { printf 'at least one test file is required\n' >&2; exit 2; }
mkdir -p "${OUT}"; chmod 700 "${OUT}"

MAXIMUM_DATA_PACK="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/maximum-data-return-v1"
EDS08_SOURCE_CONTINUITY_PACK="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1"
EDS11R_MANAGER_CENSUS_PACK="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/manager-surface-census-v1"
SUFFIX="m$$"
NETWORK="elp210m-net-${SUFFIX}"
PG_CONTAINER="elp210m-pg-${SUFFIX}"
NODE_CONTAINER="elp210m-node-${SUFFIX}"
NODE_IMAGE="node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32"
POSTGRES_IMAGE="postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"
DEPS_DIR="$(mktemp -d)"
WORK_DIR="${DEPS_DIR}/work"
RUN_UID="$(id -u)"; RUN_GID="$(id -g)"
CONTAINER_USER="${RUN_UID}:${RUN_GID}"
chmod 755 "${DEPS_DIR}"

DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker)
  else printf 'Cannot access the Docker daemon.\n' >&2; exit 1; fi
fi
if "${DOCKER[@]}" info --format '{{json .SecurityOptions}}' | grep -Fq 'name=rootless'; then CONTAINER_USER='0:0'; fi

SAMPLER_PID=""
cleanup() {
  [[ -n "${SAMPLER_PID}" ]] && kill "${SAMPLER_PID}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" rm -f "${NODE_CONTAINER}" "${PG_CONTAINER}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "${NETWORK}" >/dev/null 2>&1 || true
  rm -rf -- "${DEPS_DIR}"
  local left_c left_n
  left_c="$("${DOCKER[@]}" ps -a --filter "name=elp210m-.*-${SUFFIX}$" --format '{{.Names}}' | wc -l)"
  left_n="$("${DOCKER[@]}" network ls --filter "name=elp210m-net-${SUFFIX}$" --format '{{.Name}}' | wc -l)"
  printf '{"suffix":"%s","containers_left":%s,"networks_left":%s,"deps_dir_removed":%s}\n' "${SUFFIX}" "${left_c}" "${left_n}" \
    "$([[ -e "${DEPS_DIR}" ]] && echo false || echo true)" > "${OUT}/cleanup.json"
}
trap cleanup EXIT

cp "${APP_DIR}/package.json" "${APP_DIR}/package-lock.json" "${DEPS_DIR}/"
"${DOCKER[@]}" run --rm --network bridge --read-only --cpus "${NODE_CPUS}" --memory "${NODE_MEM}" --pids-limit 512 \
  -u "${CONTAINER_USER}" -v "${DEPS_DIR}:/deps" --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  -w /deps -e HOME=/tmp -e npm_config_cache=/tmp/.npm "${NODE_IMAGE}" npm ci --no-audit --no-fund >"${OUT}/npm-ci.log" 2>&1
test -x "${DEPS_DIR}/node_modules/.bin/tsc"
mkdir -p "${WORK_DIR}"
cp -a "${APP_DIR}/migrations" "${APP_DIR}/src" "${APP_DIR}/test" "${APP_DIR}/tooling" "${APP_DIR}/package.json" \
  "${APP_DIR}/package-lock.json" "${APP_DIR}/tsconfig.build.json" "${APP_DIR}/tsconfig.json" "${APP_DIR}/tsconfig.cross-loop.json" "${APP_DIR}/vitest.config.mts" "${WORK_DIR}/"
mkdir -p "${WORK_DIR}/deploy/control-api"; cp -a "${ROOT_DIR}/deploy/control-api/bootstrap-users.yaml" "${WORK_DIR}/deploy/control-api/"
ln -s ../node_modules "${WORK_DIR}/node_modules"
"${DOCKER[@]}" network create --internal "${NETWORK}" >/dev/null

# Resource sampler: one CSV row per container per sample (docker stats is a sample, not a profiler).
( while :; do
    ts="$(date +%s%3N)"
    "${DOCKER[@]}" stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.PIDs}}' \
      "${NODE_CONTAINER}" "${PG_CONTAINER}" 2>/dev/null | sed "s/^/${ts},/" >> "${OUT}/stats.csv" || true
    sleep 1
  done ) &
SAMPLER_PID=$!

for rep in $(seq 1 "${REPS}"); do
  REP_DIR="${OUT}/rep-${rep}"; mkdir -p "${REP_DIR}"; chmod 777 "${REP_DIR}"
  rep_start="$(date +%s%3N)"
  "${DOCKER[@]}" rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" run -d --name "${PG_CONTAINER}" --network "${NETWORK}" --read-only --cpus "${PG_CPUS}" --memory "${PG_MEM}" --pids-limit 256 \
    --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=2048m --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m \
    --tmpfs /tmp:rw,exec,mode=1777,size=64m -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test \
    "${POSTGRES_IMAGE}" >/dev/null
  ready=false
  for _ in $(seq 1 40); do
    if "${DOCKER[@]}" exec "${PG_CONTAINER}" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
  done
  [[ "${ready}" == true ]] || { printf 'PostgreSQL did not become ready.\n' >&2; exit 1; }
  pg_ready="$(date +%s%3N)"
  set +e
  timeout "${TIMEOUT_S}" "${DOCKER[@]}" run --rm --name "${NODE_CONTAINER}" --network "${NETWORK}" --read-only \
    --cpus "${NODE_CPUS}" --memory "${NODE_MEM}" --pids-limit 512 -u "${CONTAINER_USER}" \
    -v "${DEPS_DIR}:/cell" -v "${REP_DIR}:/out" -v "${ROOT_DIR}/packages/contracts:/contracts:ro" -e PORTAL_CONTRACTS_DIR=/contracts \
    -v "${ROOT_DIR}/deploy/research-preview/native-core-templates:/core009-templates:ro" -e PORTAL_CORE009_TEMPLATES_DIR=/core009-templates \
    -v "${MAXIMUM_DATA_PACK}:/services/portal-execution-edge-rs/contracts/maximum-data-return-v1:ro" \
    -v "${EDS08_SOURCE_CONTINUITY_PACK}:/services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1:ro" \
    -v "${EDS11R_MANAGER_CENSUS_PACK}:/services/portal-execution-edge-rs/contracts/manager-surface-census-v1:ro" \
    --tmpfs /tmp:rw,exec,mode=1777,size=512m -w /cell/work -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
    -e TEST_DATABASE_URL="postgres://portal:portal@${PG_CONTAINER}:5432/portal_control_test" \
    -e EDS02_SOURCE_PACK="/services/portal-execution-edge-rs/contracts/maximum-data-return-v1" \
    -e EDS08_SOURCE_CONTINUITY_PACK="/services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1" \
    -e EDS11R_SOURCE_PACK="/services/portal-execution-edge-rs/contracts/maximum-data-return-v1" \
    -e EDS11R_CENSUS_PACK="/services/portal-execution-edge-rs/contracts/manager-surface-census-v1" \
    "${NODE_IMAGE}" sh -c '
      # No tsc build: vitest transpiles the sources itself, and tsc runs out of heap inside a 2 GiB cell (first attempt, exit 97).
      npx vitest run --maxWorkers=1 --no-file-parallelism --reporter=verbose --reporter=json --outputFile.json=/out/vitest.json "$@" > /out/stdout.log 2>&1
    ' sh "$@"
  rc=$?
  set -e
  rep_end="$(date +%s%3N)"
  printf '{"rep":%s,"exit_code":%s,"rep_started_ms":%s,"pg_ready_ms":%s,"rep_ended_ms":%s,"pg_image":"%s","node_image":"%s","node_cpus":"%s","node_mem":"%s","pg_cpus":"%s","pg_mem":"%s","tests":"%s"}\n' \
    "${rep}" "${rc}" "${rep_start}" "${pg_ready}" "${rep_end}" "${POSTGRES_IMAGE}" "${NODE_IMAGE}" "${NODE_CPUS}" "${NODE_MEM}" "${PG_CPUS}" "${PG_MEM}" "$*" \
    > "${REP_DIR}/rep.json"
  "${DOCKER[@]}" rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
done
printf 'pg-cell: %s repetition(s) written to %s\n' "${REPS}" "${OUT}"
