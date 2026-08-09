#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${POOL_ALPHA_PYTHON:-${ROOT_DIR}/../.venv/bin/python}"
LOCAL_QUANTBT_SRC="${QUANTBT_SOURCE_PATH:-${ROOT_DIR}/../quantbt/src}"

export PYTHONPATH="${ROOT_DIR}/backend/src:${ROOT_DIR}:${LOCAL_QUANTBT_SRC}${PYTHONPATH:+:${PYTHONPATH}}"
exec "${PYTHON_BIN}" -m pytest -c "${ROOT_DIR}/backend/pyproject.toml" "${ROOT_DIR}/backend/tests" "$@"
