#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACK_DIR="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/profile-local-projection-v1"

(cd "${PACK_DIR}" && sha256sum --quiet -c MANIFEST.sha256)

python3 - "${PACK_DIR}" <<'PY'
import json
import pathlib
import sys

pack = pathlib.Path(sys.argv[1])
activation = json.loads((pack / "adapter-activation.v1.json").read_text())
schema = json.loads((pack / "realtime-envelope.v1.schema.json").read_text())
assert activation["authority"] == "PORTAL_SGP_PROJECTION"
assert activation["browser_cross_cell_access"] is False
assert activation["trading_system_mutation"] is False
assert [item["capability_id"] for item in activation["active"]] == [
    "admin.inspect", "admin.performance", "admin.broker-read", "event.order-lifecycle"
]
assert schema["properties"]["event_type"]["enum"] == [
    "snapshot", "delta", "heartbeat", "auth.expired", "projection.gap"
]
PY

grep -Fq 'FEATURE_EXECUTION_COMMAND_RELAY: "false"' \
  "${ROOT_DIR}/deploy/compose.execution-local-projection.yaml"
grep -Fq 'FEATURE_EXECUTION_LOCAL_PROJECTION' \
  "${ROOT_DIR}/deploy/compose.execution-local-projection.yaml"

"${ROOT_DIR}/scripts/control-api-test.sh"
printf 'Phase 1 data truth, projection, adapters and realtime gates passed.\n'
