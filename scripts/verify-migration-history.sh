#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-migration-history.sh <base-commit-or-ref>

Fails when a migration that already exists in the base revision is changed or
deleted. New migration files are allowed. Both the Portal control-plane and the
Execution Edge projection-store histories are protected.
EOF
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 2
fi

base_ref="$1"
git -C "${ROOT_DIR}" cat-file -e "${base_ref}^{commit}" 2>/dev/null || {
  printf 'Migration-history base is not a commit: %s\n' "${base_ref}" >&2
  exit 1
}

scopes=(
  apps/control-api/migrations
  services/portal-execution-edge-rs/crates/projection-store-pg/migrations
)

mapfile -t base_migrations < <(
  git -C "${ROOT_DIR}" ls-tree -r --name-only "${base_ref}" -- "${scopes[@]}"
)

for migration in "${base_migrations[@]}"; do
  git -C "${ROOT_DIR}" cat-file -e "HEAD:${migration}" 2>/dev/null || {
    printf 'Previously published migration was deleted: %s\n' "${migration}" >&2
    exit 1
  }

  base_blob="$(git -C "${ROOT_DIR}" rev-parse "${base_ref}:${migration}")"
  head_blob="$(git -C "${ROOT_DIR}" rev-parse "HEAD:${migration}")"
  if [[ "${base_blob}" != "${head_blob}" ]]; then
    printf 'Previously published migration was modified: %s\n' "${migration}" >&2
    printf 'Add a new forward-only migration instead.\n' >&2
    exit 1
  fi
done

printf 'Migration history is append-only relative to %s (%s protected files).\n' \
  "${base_ref}" "${#base_migrations[@]}"
