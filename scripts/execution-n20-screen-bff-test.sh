#!/usr/bin/env bash
# N20 canonical screen BFF static contract gate; source-dark only.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -m json.tool \
  "${ROOT_DIR}/packages/contracts/schemas/execution-screen-bff.v1.schema.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/packages/contracts/openapi/execution-screen-bff.openapi.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-screen-bff.ui-states.valid.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-screen-bff.unavailable.valid.json" >/dev/null

python3 - "${ROOT_DIR}" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
catalogue = (root / "apps/control-api/src/screen-bff/catalogue.ts").read_text()
controller = (root / "apps/control-api/src/execution/current-source.controller.ts").read_text()
consumer = (root / "apps/portal/frontend/src/execution/screenBff.ts").read_text()
openapi = (root / "packages/contracts/openapi/execution-screen-bff.openapi.json").read_text()
generated = (root / "packages/contracts/generated/execution-screen-bff.d.ts").read_text()

assert catalogue.count("screen({") == 23
# N20 established the immutable 23-screen catalogue. Later read-profile phases
# may promote only their named rows without changing its shape or request set:
# N22 owns four Paper products and N23 owns six Sandbox/Live compositions.
assert catalogue.count('status: "AVAILABLE"') == 17
assert catalogue.count('status: "TYPED_UNAVAILABLE"') == 6
assert catalogue.count('deliveryPhase: "N22"') == 4
for screen_id in [
    "PAPER_TRADING_SCREEN",
    "EXECUTION_PAPER_WORKBENCH_SCREEN",
    "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
    "EXECUTION_FULL_BLOTTER_SCREEN",
]:
    row = next(line for line in catalogue.splitlines() if f'screenId: "{screen_id}"' in line)
    assert 'status: "AVAILABLE"' in row and 'deliveryPhase: "N22"' in row
assert catalogue.count('deliveryPhase: "N23"') == 6
for screen_id in [
    "SANDBOX_TRADING_SCREEN",
    "LIVE_OPERATIONS_SCREEN",
    "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
    "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
    "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
    "EXECUTION_GATE_LIVE_REVIEW_SCREEN",
]:
    row = next(line for line in catalogue.splitlines() if f'screenId: "{screen_id}"' in line)
    assert 'status: "AVAILABLE"' in row and 'deliveryPhase: "N23"' in row
request_ids = set(re.findall(r'BR-EX-\d{2}', catalogue))
assert request_ids == {f"BR-EX-{number}" for number in range(41, 72)}
for token in ["BR-EX-55", "BR-EX-58", "portal.entity-names", "portal.blocker-catalog"]:
    assert token in catalogue
for forbidden in ["information_schema", "pg_catalog", "postgres://", "redis://"]:
    assert forbidden not in catalogue.lower()

assert "N20_RAW_SOURCE_BROWSER_FORBIDDEN" in controller
assert "USE_CANONICAL_SCREEN_BFF" in controller
assert ".proxy.screen(" not in controller
assert ".proxy.relation(" not in controller
assert "executionScreenBffCatalogue" in openapi and "executionScreenBffContract" in openapi
assert "executionScreenBffCatalogue" in generated and "executionScreenBffContract" in generated
assert "TYPED_UNAVAILABLE" in consumer and "RAW_MANAGER" not in consumer
PY

if grep -Eiq '(-----BEGIN|postgres(ql)?://|redis://|authorization:[[:space:]]*bearer|x-api-key:)' \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-screen-bff."*.json; then
  printf 'N20 fixture contains secret-shaped material.\n' >&2
  exit 1
fi

printf 'N20 canonical screen BFF static gate passed.\n'
