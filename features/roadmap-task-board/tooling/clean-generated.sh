#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOVE_DEPENDENCIES=false

usage() {
  cat <<'EOF'
Usage: tooling/clean-generated.sh [--dependencies]

Remove only generated cache/build artifacts from this repository. It never
touches data/, .env files, exported JSON, source code or Git metadata.

  --dependencies  Also remove frontend/node_modules and the screenshot tooling
                  dependency tree. `npm ci` recreates them from package-lock.
EOF
}

if [[ $# -gt 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  [[ $# -eq 1 ]] && exit 0
  exit 2
fi
if [[ "${1:-}" == "--dependencies" ]]; then
  REMOVE_DEPENDENCIES=true
elif [[ $# -eq 1 ]]; then
  usage >&2
  exit 2
fi

targets=(
  "frontend/dist"
  "frontend/.vite"
  "frontend/tsconfig.tsbuildinfo"
  "frontend/coverage"
  "frontend/playwright-report"
  "frontend/test-results"
  "frontend/blob-report"
  "backend/.pytest_cache"
  "backend/.mypy_cache"
  "backend/.ruff_cache"
  "backend/htmlcov"
  "backend/coverage.xml"
)
if [[ "${REMOVE_DEPENDENCIES}" == true ]]; then
  targets+=("frontend/node_modules" "tooling/screenshots/node_modules")
fi

for relative_path in "${targets[@]}"; do
  target="${ROOT_DIR}/${relative_path}"
  [[ "${target}" == "${ROOT_DIR}/"* ]] || {
    printf 'Refusing unsafe cleanup target: %s\n' "${target}" >&2
    exit 1
  }
  if [[ -e "${target}" || -L "${target}" ]]; then
    rm -rf -- "${target}"
    printf 'Removed generated artifact: %s\n' "${relative_path}"
  fi
done

# Python bytecode is always generated and only lives under the backend tree.
while IFS= read -r -d '' cache_dir; do
  rm -rf -- "${cache_dir}"
  printf 'Removed generated artifact: %s\n' "${cache_dir#"${ROOT_DIR}/"}"
done < <(find "${ROOT_DIR}/backend" -type d -name __pycache__ -print0)
