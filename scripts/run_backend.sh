#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${POOL_ALPHA_PYTHON:-${ROOT_DIR}/../.venv/bin/python}"
LOCAL_QUANTBT_SRC="${QUANTBT_SOURCE_PATH:-${ROOT_DIR}/../quantbt/src}"
if [[ -d "${LOCAL_QUANTBT_SRC}/quantbt" ]]; then
  export PYTHONPATH="${ROOT_DIR}/backend/src:${ROOT_DIR}:${LOCAL_QUANTBT_SRC}${PYTHONPATH:+:${PYTHONPATH}}"
else
  export PYTHONPATH="${ROOT_DIR}/backend/src:${ROOT_DIR}${PYTHONPATH:+:${PYTHONPATH}}"
fi

cd "${ROOT_DIR}"
exec "${PYTHON_BIN}" -m uvicorn portal_api.main:app --host 127.0.0.1 --port "${PORTAL_PORT:-8000}" --reload
