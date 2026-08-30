#!/usr/bin/env bash
# N21 dual-cell shared admission/cache/freshness static gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "${ROOT_DIR}" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
control_migration = (root / "apps/control-api/migrations/1723680000014_execution-shared-admission.sql").read_text()
control_repo = (root / "apps/control-api/src/execution/shared-read.repository.ts").read_text()
control_proxy = (root / "apps/control-api/src/execution/current-source.proxy.ts").read_text()
edge_migration = (root / "services/portal-execution-edge-rs/crates/projection-store-pg/migrations/0011_shared_source_admission.sql").read_text()
edge_store = (root / "services/portal-execution-edge-rs/crates/projection-store-pg/src/source_admission.rs").read_text()
edge_service = (root / "services/portal-execution-edge-rs/crates/edge-service/src/main.rs").read_text()
compose = (root / "deploy/compose.execution-edge.yaml").read_text()
control_test = (root / "scripts/control-api-test.sh").read_text()
edge_test = (root / "scripts/execution-edge-test.sh").read_text()

for table in [
    "execution_shared_admission_state",
    "execution_shared_admission_leases",
    "execution_shared_read_flights",
    "execution_shared_read_cache",
]:
    assert table in control_migration and table in control_test, table
for table in ["source_admission_state", "source_admission_leases", "source_read_cache"]:
    assert table in edge_migration and table in edge_store and table in edge_test, table

for token in [
    'scope_kind IN (\'SOURCE\', \'PROFILE\')',
    "principal_digest",
    "adapter_revision",
    "request_digest",
    "expires_at > clock_timestamp()",
]:
    assert token in control_migration or token in control_repo, token
for token in [
    "CACHE_HIT", "FOLLOWER", "LEADER", "DENIED",
    "N21_SHARED_CONCURRENCY_EXHAUSTED", "N21_SHARED_RATE_BUDGET_EXHAUSTED",
    "sourceMetadata", "etag", "workspaceId", "principalId", "principalRole",
]:
    assert token in control_repo, token
for token in [
    "acquire_source_admission", "release_source_admission",
    "load_source_read_cache", "store_source_read_cache",
    "admitted_manager_execute", "manager_shared_cache_ttl",
    "N21_SHARED_ADMISSION_UNAVAILABLE", "decode_success_for_profile",
]:
    assert token in edge_store or token in edge_service, token

assert "retry_count: 0" in control_proxy
assert ".execute(request)" in edge_service
assert "tokio::time::sleep(lease.wait)" in edge_service
assert "EDGE_MANAGER_SHARED_ADMISSION_MAXIMUM_RPS:-15" in compose
assert "EDGE_MANAGER_SHARED_CACHE_TTL_MS:-750" in compose
assert "maximum_page_rows\": 200" in (root / "services/portal-execution-edge-rs/contracts/manager-compat-authority-v1/adapter-matrix.v1.json").read_text()
assert "maximum_response_bytes\": 1048576" in (root / "services/portal-execution-edge-rs/contracts/manager-compat-authority-v1/adapter-matrix.v1.json").read_text()

for forbidden in ["redis", "automatic retry", "setTimeout(() => this.request", "setInterval(() => this.request"]:
    assert forbidden.lower() not in control_repo.lower(), forbidden
PY

if grep -Eiq '(-----BEGIN|postgres(ql)?://[^p]|redis://|authorization:[[:space:]]*bearer|x-api-key:)' \
  "${ROOT_DIR}/apps/control-api/migrations/1723680000014_execution-shared-admission.sql" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/crates/projection-store-pg/migrations/0011_shared_source_admission.sql"; then
  printf 'N21 migration contains secret-shaped material.\n' >&2
  exit 1
fi

printf 'N21 dual-cell shared admission/cache/freshness static gate passed.\n'
