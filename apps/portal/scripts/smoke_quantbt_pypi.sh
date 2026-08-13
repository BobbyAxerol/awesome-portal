#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${POOL_ALPHA_PYTHON:-${ROOT_DIR}/.venv/bin/python}"
export PYTHONPATH="${ROOT_DIR}/backend/src:${ROOT_DIR}${PYTHONPATH:+:${PYTHONPATH}}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  printf 'Python environment not found: %s\nCreate %s/.venv and install backend dependencies first.\n' \
    "${PYTHON_BIN}" "${ROOT_DIR}" >&2
  exit 1
fi

# This suite uses only the committed synthetic golden fixture. It verifies the
# exact PyPI distribution and exercises public QuantBT endpoints through the
# portal's three-window, Advanced WFO, API, and artifact contracts.
exec "${PYTHON_BIN}" -m pytest -p no:cacheprovider -c "${ROOT_DIR}/backend/pyproject.toml" \
  "${ROOT_DIR}/backend/tests/test_quantbt_dependency.py" \
  "${ROOT_DIR}/backend/tests/test_golden_parity.py" \
  "${ROOT_DIR}/backend/tests/test_three_window_runner.py" \
  "${ROOT_DIR}/backend/tests/test_advanced_walkforward.py" \
  "${ROOT_DIR}/backend/tests/test_api.py" \
  "${ROOT_DIR}/backend/tests/test_run_api.py" \
  "$@"
