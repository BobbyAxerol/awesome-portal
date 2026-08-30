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
assert catalogue.count('status: "AVAILABLE"') == 10
assert catalogue.count('status: "TYPED_UNAVAILABLE"') == 13
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
