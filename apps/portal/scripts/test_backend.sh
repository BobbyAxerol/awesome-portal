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
exec "${PYTHON_BIN}" -m pytest -c "${ROOT_DIR}/backend/pyproject.toml" "${ROOT_DIR}/backend/tests" "$@"
