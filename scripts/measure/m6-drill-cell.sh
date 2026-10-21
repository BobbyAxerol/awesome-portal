#!/usr/bin/env bash
# ELP2-10 M-6b restore drill cell (closes protocol gap G-4 as a runner): backup -> restore into a NEW database on the same disposable
# PostgreSQL -> ops reset (resetAfterRestore with the recorded epoch) -> old holder fenced -> new tenure commits.
#
# Same isolation and cleanup rules as scripts/measure/pg-cell.sh (internal-only network, pinned images, read-only rootfs, only
# elp210m-* containers created and removed, readback of leftovers). The setup is repeated here on purpose: pg-cell.sh may be
# queued behind the heavy lock while this file is edited. Callers hold /tmp/portal-heavy.lock.
#
#   scripts/measure/m6-drill-cell.sh --out DIR [--node-cpus 2] [--node-mem 2g] [--pg-cpus 1] [--pg-mem 1g] [--timeout-s 600]
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/control-api"
OUT=""; NODE_CPUS=2; NODE_MEM=2g; PG_CPUS=1; PG_MEM=1g; TIMEOUT_S=600
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;; --node-cpus) NODE_CPUS="$2"; shift 2 ;; --node-mem) NODE_MEM="$2"; shift 2 ;;
    --pg-cpus) PG_CPUS="$2"; shift 2 ;; --pg-mem) PG_MEM="$2"; shift 2 ;; --timeout-s) TIMEOUT_S="$2"; shift 2 ;;
    *) printf 'unknown option %s\n' "$1" >&2; exit 2 ;;
  esac
done
[[ -n "${OUT}" ]] || { printf '--out is required\n' >&2; exit 2; }
mkdir -p "${OUT}"; chmod 777 "${OUT}"

SUFFIX="d$$"; NETWORK="elp210m-net-${SUFFIX}"; PG_CONTAINER="elp210m-pg-${SUFFIX}"; NODE_CONTAINER="elp210m-node-${SUFFIX}"
NODE_IMAGE="node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32"
POSTGRES_IMAGE="postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"
DEPS_DIR="$(mktemp -d)"; WORK_DIR="${DEPS_DIR}/work"; chmod 755 "${DEPS_DIR}"
CONTAINER_USER="$(id -u):$(id -g)"
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); else printf 'No Docker access.\n' >&2; exit 1; fi
fi
if "${DOCKER[@]}" info --format '{{json .SecurityOptions}}' | grep -Fq 'name=rootless'; then CONTAINER_USER='0:0'; fi

cleanup() {
  "${DOCKER[@]}" rm -f "${NODE_CONTAINER}" "${PG_CONTAINER}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "${NETWORK}" >/dev/null 2>&1 || true
  rm -rf -- "${DEPS_DIR}"
  local c n
  c="$("${DOCKER[@]}" ps -a --filter "name=elp210m-.*-${SUFFIX}$" --format '{{.Names}}' | wc -l)"
  n="$("${DOCKER[@]}" network ls --filter "name=elp210m-net-${SUFFIX}$" --format '{{.Name}}' | wc -l)"
  printf '{"suffix":"%s","containers_left":%s,"networks_left":%s}\n' "${SUFFIX}" "${c}" "${n}" > "${OUT}/cleanup.json"
}
trap cleanup EXIT

cp "${APP_DIR}/package.json" "${APP_DIR}/package-lock.json" "${DEPS_DIR}/"
"${DOCKER[@]}" run --rm --network bridge --read-only --cpus "${NODE_CPUS}" --memory "${NODE_MEM}" --pids-limit 512 -u "${CONTAINER_USER}" \
  -v "${DEPS_DIR}:/deps" --tmpfs /tmp:rw,exec,mode=1777,size=256m -w /deps -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  "${NODE_IMAGE}" npm ci --no-audit --no-fund >"${OUT}/npm-ci.log" 2>&1
mkdir -p "${WORK_DIR}"
cp -a "${APP_DIR}/migrations" "${APP_DIR}/src" "${APP_DIR}/test" "${APP_DIR}/tooling" "${APP_DIR}/package.json" "${APP_DIR}/package-lock.json" \
  "${APP_DIR}/tsconfig.build.json" "${APP_DIR}/tsconfig.json" "${APP_DIR}/vitest.config.mts" "${WORK_DIR}/"
ln -s ../node_modules "${WORK_DIR}/node_modules"
"${DOCKER[@]}" network create --internal "${NETWORK}" >/dev/null
"${DOCKER[@]}" run -d --name "${PG_CONTAINER}" --network "${NETWORK}" --read-only --cpus "${PG_CPUS}" --memory "${PG_MEM}" --pids-limit 256 \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=2048m --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test "${POSTGRES_IMAGE}" >/dev/null
for _ in $(seq 1 40); do "${DOCKER[@]}" exec "${PG_CONTAINER}" pg_isready -U portal -d portal_control_test >/dev/null 2>&1 && break; sleep 1; done

node_phase() { # $1 = seed | verify, extra env as remaining args
  local phase="$1"; shift
  timeout "${TIMEOUT_S}" "${DOCKER[@]}" run --rm --name "${NODE_CONTAINER}" --network "${NETWORK}" --read-only --cpus "${NODE_CPUS}" --memory "${NODE_MEM}" --pids-limit 512 \
    -u "${CONTAINER_USER}" -v "${DEPS_DIR}:/cell" -v "${OUT}:/out" -v "${ROOT_DIR}/packages/contracts:/contracts:ro" -e PORTAL_CONTRACTS_DIR=/contracts \
    --tmpfs /tmp:rw,exec,mode=1777,size=512m -w /cell/work -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
    -e TEST_DATABASE_URL="postgres://portal:portal@${PG_CONTAINER}:5432/portal_control_test" -e M6_PHASE="${phase}" -e M6_OUT_DIR=/out \
    -e M6_SRC_DB=m6_drill_src -e M6_RESTORED_DB=m6_drill_restored "$@" \
    "${NODE_IMAGE}" sh -c 'npx vitest run --maxWorkers=1 --no-file-parallelism --reporter=verbose test/elp210-measure-m6-restore-drill.spec.ts > "/out/${0}.log" 2>&1' "${phase}"
}
SIG_SQL="SELECT (SELECT count(*) FROM execution_manager_model_revisions)::text || ':' || md5(COALESCE((SELECT string_agg(row_to_json(t)::text, chr(10) ORDER BY revision) FROM execution_manager_model_revisions t),'')) || ':' || (SELECT count(*) FROM execution_manager_consumer_fences)::text || ':' || md5(COALESCE((SELECT string_agg(row_to_json(f)::text, chr(10) ORDER BY workspace_id) FROM execution_manager_consumer_fences f),''))"

set +e
node_phase seed; seed_rc=$?
set -e
if [[ "${seed_rc}" -ne 0 ]]; then printf '{"phase":"seed","exit_code":%s}\n' "${seed_rc}" > "${OUT}/phases.json"; exit 1; fi
src_sig="$("${DOCKER[@]}" exec "${PG_CONTAINER}" psql -U portal -d m6_drill_src -Atc "${SIG_SQL}")"
dump_start="$(date +%s%3N)"
"${DOCKER[@]}" exec "${PG_CONTAINER}" pg_dump -U portal -d m6_drill_src --format=custom --file=/tmp/m6.dump
dump_end="$(date +%s%3N)"
dump_bytes="$("${DOCKER[@]}" exec "${PG_CONTAINER}" sh -c 'wc -c < /tmp/m6.dump' | tr -d ' ')"
restore_start="$(date +%s%3N)"
"${DOCKER[@]}" exec "${PG_CONTAINER}" createdb -U portal m6_drill_restored
"${DOCKER[@]}" exec "${PG_CONTAINER}" pg_restore -U portal -d m6_drill_restored --exit-on-error /tmp/m6.dump
restore_end="$(date +%s%3N)"
restored_sig="$("${DOCKER[@]}" exec "${PG_CONTAINER}" psql -U portal -d m6_drill_restored -Atc "${SIG_SQL}")"
set +e
node_phase verify -e M6_RESTORE_START_MS="${restore_start}" -e M6_RESTORE_END_MS="${restore_end}"; verify_rc=$?
set -e
printf '{"seed_exit":%s,"verify_exit":%s,"dump_start_ms":%s,"dump_end_ms":%s,"dump_bytes":%s,"restore_start_ms":%s,"restore_end_ms":%s,"source_signature":"%s","restored_signature":"%s","signatures_equal":%s,"pg_image":"%s","node_image":"%s","node_cpus":"%s","node_mem":"%s","pg_cpus":"%s","pg_mem":"%s"}\n' \
  "${seed_rc}" "${verify_rc}" "${dump_start}" "${dump_end}" "${dump_bytes}" "${restore_start}" "${restore_end}" "${src_sig}" "${restored_sig}" \
  "$([[ "${src_sig}" == "${restored_sig}" ]] && echo true || echo false)" "${POSTGRES_IMAGE}" "${NODE_IMAGE}" "${NODE_CPUS}" "${NODE_MEM}" "${PG_CPUS}" "${PG_MEM}" > "${OUT}/phases.json"
exit "${verify_rc}"
