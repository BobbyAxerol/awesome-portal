#!/usr/bin/env bash
# Static/offline gate for R3-2. It validates the candidate packet and existing
# source-gap boundary; it never contacts Edge or starts a runtime service.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${ROOT_DIR}/deploy/manifests/execution-r3-2-dev-candidate.v1.json"
DOCUMENT="${ROOT_DIR}/upgrade/backend/R3_2_PROFILE_QUALIFICATION_REALTIME_DR_AND_GOVERNED_COMMAND_CLOSURE.md"
RUNBOOK="${ROOT_DIR}/deploy/runbooks/execution-r3-2-dev-candidate-and-rollback.md"

for required in \
  "${MANIFEST}" \
  "${DOCUMENT}" \
  "${RUNBOOK}" \
  "${ROOT_DIR}/apps/control-api/src/execution/r3-profile-qualification-ledger.ts" \
  "${ROOT_DIR}/apps/control-api/src/execution/r3-realtime-dr-contract.ts" \
  "${ROOT_DIR}/apps/control-api/src/execution/r3-governed-command-ledger.ts" \
  "${ROOT_DIR}/apps/control-api/test/r3-profile-qualification-ledger.spec.ts" \
  "${ROOT_DIR}/apps/control-api/test/r3-realtime-dr-contract.spec.ts" \
  "${ROOT_DIR}/apps/control-api/test/r3-governed-command-ledger.spec.ts"; do
  test -f "${required}"
done

python3 - "${ROOT_DIR}" "${MANIFEST}" "${DOCUMENT}" "${RUNBOOK}" <<'PY'
import hashlib
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
manifest = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
document = pathlib.Path(sys.argv[3]).read_text(encoding="utf-8")
runbook = pathlib.Path(sys.argv[4]).read_text(encoding="utf-8")

assert manifest["schema_version"] == "portal.execution.r3-2.dev-candidate.v1"
assert manifest["phase"] == "R3-2"
assert manifest["status"] == "DEV_CANDIDATE_READY_FOR_R3_4"
assert manifest["scope"] == {
    "runtime_mutation": False,
    "stable_or_main_rollout": False,
    "browser_direct_edge_or_source_access": False,
    "direct_trading_system_database_or_redis_access": False,
    "source_command_dispatched": False,
    "business_rows_read_by_d3_audit": False,
}
assert manifest["source_contract"] == {
    "manager_revision": "trading-system.portal-execution.manager-v2.runtime.v1",
    "catalogue_sha256": "sha256:0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44",
    "catalogue_relation_count": 96,
    "screen_bound_named_operation_count": 54,
    "source_page_bounds": {"maximum_rows": 200, "maximum_response_bytes": 1048576},
}
qualification = manifest["profile_qualification"]
assert qualification["audit_window_id"] == "D3-AUDIT-20260913-R3-2"
assert qualification["transport"] == "TLS_1_3_HTTP_2_MTLS_DELEGATED_JWT"
assert qualification["delegated_resource"] == "execution:manager-v2:read"
assert set(qualification["private_evidence_sha256"]) == {"paper", "sandbox", "live"}
assert all(re.fullmatch(r"sha256:[a-f0-9]{64}", value) for value in qualification["private_evidence_sha256"].values())
assert qualification["profiles"] == [
    {"environment": "paper", "current_page_read": "QUALIFIED_CURRENT_PAGE_READ", "catalogue_relation_count": 96, "published_metadata_capability_count": 5, "jwt_negative_case_count": 13},
    {"environment": "sandbox", "current_page_read": "QUALIFIED_CURRENT_PAGE_READ", "catalogue_relation_count": 96, "published_metadata_capability_count": 5, "jwt_negative_case_count": 13},
    {"environment": "live", "current_page_read": "QUALIFIED_CURRENT_PAGE_READ_WITH_EMPTY_AUTHORITY", "catalogue_relation_count": 96, "published_metadata_capability_count": 5, "jwt_negative_case_count": 13},
]
assert manifest["market_context"] == {
    "paper_state": "PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION",
    "paper_reason": "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
    "sandbox_live_state": "PROFILE_NOT_QUALIFIED",
    "portal_fallback_forbidden": True,
    "runtime_activation": False,
}
assert manifest["realtime_dr"]["authority"] == "PORTAL_LOCAL_POSTGRES_PROJECTION_JOURNAL"
assert manifest["realtime_dr"]["scenario_count"] == 12
assert manifest["realtime_dr"]["source_replay_or_global_ordering_claimed"] is False
assert manifest["governed_commands"] == {
    "row_count": 100,
    "state_counts": {
        "LOCAL_R0_READ_CONNECTED": 4,
        "READ_ONLY_SUPPORTED": 2,
        "MUTATION_CONNECTED": 5,
        "POLICY_BLOCKED": 51,
        "SOURCE_NOT_COMMISSIONED": 35,
        "NOT_APPLICABLE": 3,
    },
    "generic_cli_relay": False,
    "source_command_dispatched": False,
}
assert sum(manifest["governed_commands"]["state_counts"].values()) == 100

def digest(path):
    return "sha256:" + hashlib.sha256((root / path).read_bytes()).hexdigest()

assert manifest["tracked_contract_inputs"] == {
    path: digest(path) for path in sorted(manifest["tracked_contract_inputs"])
}
expected_config = {path: digest(path) for path in sorted(manifest["tracked_config_inputs"])}
assert manifest["tracked_config_inputs"] == expected_config
config_blob = json.dumps(expected_config, sort_keys=True, separators=(",", ":")).encode()
assert manifest["tracked_configuration_sha256"] == "sha256:" + hashlib.sha256(config_blob).hexdigest()
assert manifest["immutable_release_inputs"] == {
    "state": "R3_4_GENERATION_REQUIRED",
    "required": ["protected_commit", "image_digest", "sbom", "provenance", "rendered_config_sha256", "rollback_image_pointer"],
    "present_in_r3_2": [],
}
assert manifest["rollback"] == {
    "mode": "IMAGE_AND_CONFIG_POINTER_ONLY",
    "database_rule": "FORWARD_ONLY_ADDITIVE_MIGRATIONS_NO_DATA_OR_VOLUME_DELETE",
    "source_runtime_mutation": False,
}
for text in (document, runbook):
    lowered = text.lower()
    for forbidden in ("postgres://", "redis://", "authorization: bearer", "private_key", "-----begin"):
        assert forbidden not in lowered, forbidden
assert "PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION" in document
assert "image/config pointer" in runbook.lower()
PY

"${ROOT_DIR}/scripts/execution-d3-manager-audit-test.sh"
printf '%s\n' 'R3-2 static candidate, private-evidence bindings and offline D3 audit gate passed.'
