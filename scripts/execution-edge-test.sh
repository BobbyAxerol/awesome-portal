#!/usr/bin/env bash
# Reproducible EX-BE-01/02/03/04b/06/07a/07b/08a-offline gate: immutable evidence + Rust + PostgreSQL.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDGE_DIR="${ROOT_DIR}/services/portal-execution-edge-rs"
PACK_DIR="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack"
IMAGE="portal-execution-edge-ci:rust-1.85.1"
NETWORK="execution-edge-test-net"
PG_CONTAINER="execution-edge-test-postgres"

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required.\n' >&2
  exit 1
}

DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    printf 'Cannot access the Docker daemon directly or through passwordless sudo.\n' >&2
    exit 1
  fi
fi

[[ -f "${EDGE_DIR}/Cargo.lock" ]] || {
  printf 'Cargo.lock is required; EX-BE-01 never resolves dependencies implicitly.\n' >&2
  exit 1
}

[[ "$(sha256sum "${PACK_DIR}/MANIFEST.sha256" | cut -d ' ' -f 1)" == \
  "9e4430fcb27cce87158376a53888dc80515673d32dbfe3b53d08e164de67e85d" ]] || {
  printf 'Trading System contract-pack manifest identity drifted.\n' >&2
  exit 1
}

(cd "${PACK_DIR}" && sha256sum --quiet -c MANIFEST.sha256)

cleanup() {
  "${DOCKER[@]}" rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "${NETWORK}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
"${DOCKER[@]}" network create "${NETWORK}" >/dev/null
"${DOCKER[@]}" run -d --name "${PG_CONTAINER}" --network "${NETWORK}" \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal \
  -e POSTGRES_DB=portal_projection_test \
  postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6 >/dev/null

ready=false
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "${PG_CONTAINER}" \
    pg_isready -U portal -d portal_projection_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "${ready}" != true ]]; then
  printf 'Projection PostgreSQL did not become ready.\n' >&2
  "${DOCKER[@]}" logs "${PG_CONTAINER}" >&2
  exit 1
fi

"${DOCKER[@]}" build \
  --tag "${IMAGE}" \
  --file "${ROOT_DIR}/deploy/images/execution-edge-ci.Dockerfile" \
  "${ROOT_DIR}"

"${DOCKER[@]}" run --rm \
  --network "${NETWORK}" \
  --user "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m \
  --tmpfs /cargo:rw,exec,mode=1777,size=512m \
  --tmpfs /target:rw,exec,mode=1777,size=4096m \
  -e HOME=/tmp \
  -e CARGO_HOME=/cargo \
  -e CARGO_TARGET_DIR=/target \
  -e TEST_PROJECTION_DATABASE_URL="postgres://portal:portal@${PG_CONTAINER}:5432/portal_projection_test" \
  -v "${ROOT_DIR}:/repo:ro" \
  -w /repo/services/portal-execution-edge-rs \
  "${IMAGE}" sh -eu -c '
    cargo fmt --all -- --check
    cargo test --locked --all-targets
    cargo clippy --locked --all-targets -- -D warnings
    n06_template_report="$(cargo run --locked -q -p source-qualification --bin n06_verify -- \
      --mode template \
      --evidence crates/source-qualification/fixtures/n06-real-source-qualification.template.json)"
    printf "%s\n" "${n06_template_report}" >/tmp/n06-template-report.json
    grep -Fq "\"decision\":\"TEMPLATE_VALID\"" /tmp/n06-template-report.json || {
      printf "N06 template CLI did not return TEMPLATE_VALID.\n" >&2
      printf "%s\n" "${n06_template_report}" >&2
      exit 1
    }
    grep -Fq "\"activation_authorized\":false" /tmp/n06-template-report.json || {
      printf "N06 template CLI widened activation authority.\n" >&2
      exit 1
    }
  '

printf 'Rust workspace and N06 template CLI gates passed; starting PostgreSQL restore drill.\n'

# Credential-free restore drill: prove the migrated projection schema and all
# rows left by the replay/query suite survive a custom-format backup/restore.
PROJECTION_SIGNATURE_SQL="SELECT concat((SELECT count(*) FROM _sqlx_migrations), ':', (SELECT count(*) FROM portal_projection.epochs), ':', (SELECT count(*) FROM portal_projection.event_journal), ':', (SELECT count(*) FROM portal_projection.analytics_source_snapshots), ':', (SELECT count(*) FROM portal_projection.analytics_source_facts), ':', (SELECT count(*) FROM portal_projection.d4_source_checkpoints), ':', (SELECT count(*) FROM portal_projection.d4_source_failures), ':', (SELECT count(*) FROM portal_projection.shared_consumer_leases), ':', (SELECT count(*) FROM portal_projection.retention_lifecycle_policy_snapshots), ':', (SELECT count(*) FROM portal_projection.retention_recovery_checkpoints), ':', (SELECT count(*) FROM portal_projection.retention_cleanup_runs), ':', (SELECT count(*) FROM portal_projection.shadow_screen_activations));"
source_signature="$(${DOCKER[@]} exec "${PG_CONTAINER}" psql -U portal -d portal_projection_test -Atc "${PROJECTION_SIGNATURE_SQL}")"
"${DOCKER[@]}" exec "${PG_CONTAINER}" pg_dump -U portal -d portal_projection_test \
  --format=custom --file=/tmp/portal_projection_test.dump
"${DOCKER[@]}" exec "${PG_CONTAINER}" createdb -U portal portal_projection_restore
"${DOCKER[@]}" exec "${PG_CONTAINER}" pg_restore -U portal -d portal_projection_restore \
  --exit-on-error /tmp/portal_projection_test.dump
restore_signature="$(${DOCKER[@]} exec "${PG_CONTAINER}" psql -U portal -d portal_projection_restore -Atc "${PROJECTION_SIGNATURE_SQL}")"
[[ "${source_signature}" == "${restore_signature}" ]] || {
  printf 'Projection restore signature mismatch: source=%s restore=%s\n' \
    "${source_signature}" "${restore_signature}" >&2
  exit 1
}

printf 'PostgreSQL projection restore signature matched.\n'

printf 'Execution edge contracts, auth, transport, bounded load, projection replay/query, retention/recovery/cleanup, N06 qualification, N07 manifest-bound shadow screen, source-backed analytics, adapter rollback and PostgreSQL restore gates passed.\n'
