#!/usr/bin/env bash
# N19 Rust Manager-v2 compatibility authority gate; source-dark only.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/manager-compat-authority-v1"
ACTIVATION_DIR="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/manager-profile-activation-v1"
RUST_DIR="${ROOT_DIR}/services/portal-execution-edge-rs"

python3 -m json.tool "${CONTRACT_DIR}/adapter-matrix.v1.json" >/dev/null
python3 -m json.tool "${CONTRACT_DIR}/negative-matrix.v1.json" >/dev/null
python3 -m json.tool "${ACTIVATION_DIR}/runtime-activation.v1.json" >/dev/null
python3 -m json.tool "${ACTIVATION_DIR}/qualification-evidence.v1.json" >/dev/null
(
  cd "${CONTRACT_DIR}"
  sha256sum --quiet -c MANIFEST.sha256
)
(
  cd "${ACTIVATION_DIR}"
  sha256sum --quiet -c MANIFEST.sha256
)

python3 - "${ROOT_DIR}" <<'PY'
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
census_path = root / "services/portal-execution-edge-rs/contracts/manager-surface-census-v1/manager-surface-census.v1.json"
matrix_path = root / "services/portal-execution-edge-rs/contracts/manager-compat-authority-v1/adapter-matrix.v1.json"
negative_path = root / "services/portal-execution-edge-rs/contracts/manager-compat-authority-v1/negative-matrix.v1.json"
activation_path = root / "services/portal-execution-edge-rs/contracts/manager-profile-activation-v1/runtime-activation.v1.json"
evidence_path = root / "services/portal-execution-edge-rs/contracts/manager-profile-activation-v1/qualification-evidence.v1.json"
authority_source = (root / "services/portal-execution-edge-rs/crates/manager-compat-authority/src/lib.rs").read_text()
authority_manifest = (root / "services/portal-execution-edge-rs/crates/manager-compat-authority/Cargo.toml").read_text()
client_source = (root / "services/portal-execution-edge-rs/crates/manager-v2-client/src/lib.rs").read_text()
edge_source = (root / "services/portal-execution-edge-rs/crates/edge-service/src/main.rs").read_text()

census_bytes = census_path.read_bytes()
census = json.loads(census_bytes)
matrix = json.loads(matrix_path.read_text())
negative = json.loads(negative_path.read_text())
activation = json.loads(activation_path.read_text())
evidence_bytes = evidence_path.read_bytes()
evidence = json.loads(evidence_bytes)

expected_census_digest = "sha256:" + hashlib.sha256(census_bytes).hexdigest()
assert matrix["n18_census_sha256"] == expected_census_digest
assert census["counts"]["relations"] == len(census["relations"]) == 96
assert len({row["relation_id"] for row in census["relations"]}) == 96
assert all(row["relation_id"].startswith("public.") for row in census["relations"])

expected_operations = {
    "managerCapabilities",
    "managerCatalog",
    "managerProjection",
    "managerRelationRecord",
    "managerRelationRecords",
}
assert {row["operation_id"] for row in census["manager_primitives"]} == expected_operations
assert all(row["method"] == "GET" for row in census["manager_primitives"])
assert len(matrix["adapters"]) == 2
assert sum(1 for adapter in matrix["adapters"] if adapter["deployable"]) == 1
assert all(set(adapter["operation_ids"]) == expected_operations for adapter in matrix["adapters"])
active = next(adapter for adapter in matrix["adapters"] if adapter["deployable"])
future = next(adapter for adapter in matrix["adapters"] if adapter["test_only"])
assert active["adapter_revision"] == matrix["active_adapter_revision"]
assert future["deployable"] is False
assert future["rollback_adapter_revision"] == active["adapter_revision"]

expected_bindings = {
    ("paper", "PAPER_BINANCE_USDM"),
    ("sandbox", "SANDBOX_BINANCE_USDM"),
    ("live", "LIVE_BINANCE_USDM"),
}
assert {(row["environment"], row["profile_id"]) for row in matrix["profile_bindings"]} == expected_bindings
assert all(row["delegated_resource"] == "execution:manager-v2:read" for row in matrix["profile_bindings"])
assert all(row["product_enabled"] is False for row in matrix["profile_bindings"])

assert activation["adapter_matrix_sha256"] == "sha256:" + hashlib.sha256(matrix_path.read_bytes()).hexdigest()
assert activation["qualification_evidence_sha256"] == "sha256:" + hashlib.sha256(evidence_bytes).hexdigest()
assert activation["owner_contract_revision"] == active["owner_contract_revision"]
assert activation["active_adapter_revision"] == active["adapter_revision"]
assert {
    (row["environment"], row["profile_id"], row["delegation_audience"])
    for row in activation["profiles"]
} == {
    ("paper", "PAPER_BINANCE_USDM", "portal-execution-edge-paper"),
    ("sandbox", "SANDBOX_BINANCE_USDM", "portal-execution-edge-sandbox"),
    ("live", "LIVE_BINANCE_USDM", "portal-execution-edge-live"),
}
assert all(row["delegated_resource"] == "execution:manager-v2:read" for row in activation["profiles"])
assert all(row["transport_qualified"] is True for row in activation["profiles"])
assert all(row["current_source_read_enabled"] is True for row in activation["profiles"])
assert all(row["empty_result_semantics"] == "AUTHORITATIVE_EMPTY" for row in activation["profiles"])
assert len(evidence["profiles"]) == 3
assert next(row for row in evidence["profiles"] if row["environment"] == "live")["result_semantics"] == "AUTHORITATIVE_EMPTY"
assert not any(activation["authority"].values())
assert not any(evidence["negative_authority"].values())

policy = matrix["transport_policy"]
assert policy == {
    "origin_scheme": "https",
    "method": "GET",
    "minimum_tls": "TLS1.3",
    "mutual_tls_required": True,
    "delegated_jwt_required": True,
    "redirects_allowed": False,
    "automatic_retries": False,
    "maximum_page_rows": 200,
    "maximum_response_bytes": 1048576,
    "maximum_cursor_bytes": 4096,
    "maximum_concurrency_per_replica": 2,
    "request_header_allowlist": ["accept", "x-request-id"],
}
assert not any(matrix["authority"].values())
assert len(negative["cases"]) == len({case["id"] for case in negative["cases"]}) == 12

for token in [
    "ManagerCompatibilityAuthority::canonical()",
    "bind_manager_authority",
    "relation_page_request",
    "projection_request",
    "validate_catalogue",
    "validate_capabilities",
]:
    assert token in authority_source or token in edge_source, token

for token in [
    ".redirect(Policy::none())",
    ".no_proxy()",
    ".https_only(true)",
    "Version::TLS_1_3",
    "Semaphore::new(config.limits.maximum_concurrency)",
    ".get(url)",
]:
    assert token in client_source, token

for forbidden in ["reqwest", "sqlx", "redis"]:
    assert forbidden not in authority_manifest, forbidden
for forbidden in ["std::process", "std::env"]:
    assert forbidden not in authority_source, forbidden
PY

if grep -Eiq '(-----BEGIN|postgres(ql)?://|redis://|authorization:[[:space:]]*bearer|x-admin-token:)' \
  "${CONTRACT_DIR}"/*.json "${ACTIVATION_DIR}"/*.json; then
  echo "N19 authority contract contains secret-shaped material" >&2
  exit 1
fi

test -f "${RUST_DIR}/crates/manager-compat-authority/Cargo.toml"
grep -Fq 'manager-compat-authority = { path = "../manager-compat-authority" }' \
  "${RUST_DIR}/crates/edge-service/Cargo.toml"

printf 'N19 compatibility plus Paper/Sandbox/Live runtime activation static gate passed; Rust unit/load gates run in execution-edge-test.sh.\n'
