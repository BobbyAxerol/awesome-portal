#!/usr/bin/env bash
# Static/offline guard for BE-R2-2. It never contacts an execution endpoint.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${ROOT_DIR}/deploy/manifests/execution-d3-current-source-reconciliation.v1.json"
LEDGER="${ROOT_DIR}/apps/control-api/src/execution/current-source-truth-ledger.ts"
RUNNER="${ROOT_DIR}/scripts/execution-d3-manager-live-audit.sh"
DOCUMENT="${ROOT_DIR}/upgrade/backend/BE_R2_2_D3_GET_ONLY_EVIDENCE_AND_CURRENT_SOURCE_TRUTH_LEDGER.md"

for required in "${MANIFEST}" "${LEDGER}" "${RUNNER}" "${DOCUMENT}" \
  "${ROOT_DIR}/apps/control-api/src/cli/execution-current-source-truth-ledger.ts" \
  "${ROOT_DIR}/apps/control-api/test/current-source-truth-ledger.spec.ts" \
  "${ROOT_DIR}/scripts/execution-d3-manager-audit-test.sh"; do
  test -f "${required}"
done
python3 - "${MANIFEST}" <<'PY'
import json
import pathlib
import sys

payload=json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["schema_version"] == "portal.execution.d3.current-source-reconciliation.v1"
assert payload["status"] == "RECONCILED_WITH_PROVENANCE_DISCREPANCY_RECORDED"
assert payload["scope"] == {
    "manager_metadata_only": True,
    "business_rows_read": False,
    "command_called": False,
    "runtime_mutation": False,
    "running_image_changed": False,
}
assert payload["active_manager"]["catalogue_relation_count"] == 96
assert payload["active_manager"]["published_capability_count_per_profile"] == 5
assert payload["legacy_compatibility"]["http_status"] == 503
assert payload["live_data_executor"]["portal_direct_database_access"] is False
assert payload["live_data_executor"]["live_manager_substitute"] is False
assert payload["release_label_reconciliation"]["state"] == "PROVENANCE_DISCREPANCY_RECORDED_NO_RUNTIME_CHANGE"
for digest in payload["private_evidence_sha256"].values():
    assert isinstance(digest, str) and digest.startswith("sha256:") and len(digest) == 71
PY
grep -Fq 'D3_GET_ONLY_MANAGER_METADATA' "${LEDGER}"
grep -Fq 'D3_AUDIT_METADATA_ONLY_NO_BUSINESS_ROW_READ' "${LEDGER}"
grep -Fq 'execution:manager-v2:read' "${RUNNER}"
grep -Fq 'compatibility-typed-unavailable' "${RUNNER}"
grep -Fq 'D3 Manager audit PASSED' "${RUNNER}"
"${ROOT_DIR}/scripts/execution-d3-manager-audit-test.sh"
printf 'BE-R2-2 static reconciliation and offline audit guard passed.\n'
