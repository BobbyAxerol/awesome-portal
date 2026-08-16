#!/usr/bin/env bash
# M0 golden gate (BAR-05): protected hash, golden fixture digests and the
# deterministic golden parity + run reopen suites.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTAL_DIR="${ROOT_DIR}/apps/portal"
PYTHON_BIN="${POOL_ALPHA_PYTHON:-${PORTAL_DIR}/.venv/bin/python}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  printf 'Python environment not found: %s\n' "${PYTHON_BIN}" >&2
  exit 1
fi

printf '== protected strategy kernel ==\n'
(cd "${PORTAL_DIR}" && sha256sum -c strategy/PROTECTED_SHA256)

printf '== golden fixture digests (M0 freeze) ==\n'
FREEZE_MANIFEST="${ROOT_DIR}/upgrade/backend/bar05/m0-freeze-manifest.json"
"${PYTHON_BIN}" - "${FREEZE_MANIFEST}" "${ROOT_DIR}" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text())
repo = Path(sys.argv[2])
for name in ("golden_market", "golden_signals", "golden_metadata"):
    relative = {
        "golden_market": "apps/portal/backend/tests/fixtures/golden_market.parquet",
        "golden_signals": "apps/portal/backend/tests/fixtures/golden_signals.parquet",
        "golden_metadata": "apps/portal/backend/tests/fixtures/golden_metadata.json",
    }[name]
    digest = f"sha256:{hashlib.sha256((repo / relative).read_bytes()).hexdigest()}"
    if digest != manifest["file_digests"][name]:
        raise SystemExit(f"{relative} digest drift: {digest}")
print("golden fixture digests OK")
PY

printf '== golden parity and reopen suites ==\n'
export PYTHONPATH="${PORTAL_DIR}/backend/src:${PORTAL_DIR}${PYTHONPATH:+:${PYTHONPATH}}"
"${PYTHON_BIN}" -m pytest -c "${PORTAL_DIR}/backend/pyproject.toml" \
  "${PORTAL_DIR}/backend/tests/test_golden_parity.py" \
  "${PORTAL_DIR}/backend/tests/test_protected_sources.py" \
  "${PORTAL_DIR}/backend/tests/test_three_window_runner.py" \
  "${PORTAL_DIR}/backend/tests/test_artifact_repository.py" \
  "$@"

printf 'M0 golden gate passed.\n'
