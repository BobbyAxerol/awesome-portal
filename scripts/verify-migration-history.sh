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

# This is a one-time, source-only correction. The N09 file reached Git with a
# numeric prefix already used by an earlier *applied* session migration, which
# makes node-pg-migrate refuse every database upgrade before N09 can run. The
# replacement has identical SQL and a fresh forward-only prefix. Do not add
# generic rename exemptions here.
declare -A collision_renames=(
  ["apps/control-api/migrations/1723680000012_execution-n09-governance-workflow.sql"]="apps/control-api/migrations/1723680000028_execution-n09-governance-workflow.sql"
)

# node-pg-migrate orders and identifies migrations by the numeric prefix. A
# duplicate prefix can pass an append-only Git check yet make an already
# deployed database impossible to upgrade. Reject it before CI or a release
# workflow reaches a runtime migration step.
for scope in "${scopes[@]}"; do
  declare -A seen_prefixes=()
  while IFS= read -r migration; do
    filename="$(basename "${migration}")"
    prefix="${filename%%_*}"
    [[ "${prefix}" =~ ^[0-9]+$ ]] || {
      printf 'Migration filename lacks a numeric prefix: %s\n' "${migration}" >&2
      exit 1
    }
    if [[ -n "${seen_prefixes[${prefix}]:-}" ]]; then
      printf 'Duplicate migration numeric prefix %s: %s and %s\n' \
        "${prefix}" "${seen_prefixes[${prefix}]}" "${migration}" >&2
      exit 1
    fi
    seen_prefixes["${prefix}"]="${migration}"
  done < <(find "${ROOT_DIR}/${scope}" -maxdepth 1 -type f -name '*.sql' -printf "${scope}/%f\n" | sort)
done

mapfile -t base_migrations < <(
  git -C "${ROOT_DIR}" ls-tree -r --name-only "${base_ref}" -- "${scopes[@]}"
)

for migration in "${base_migrations[@]}"; do
  base_blob="$(git -C "${ROOT_DIR}" rev-parse "${base_ref}:${migration}")"
  if ! git -C "${ROOT_DIR}" cat-file -e "HEAD:${migration}" 2>/dev/null; then
    replacement="${collision_renames[${migration}]:-}"
    if [[ -n "${replacement}" ]] && git -C "${ROOT_DIR}" cat-file -e "HEAD:${replacement}" 2>/dev/null; then
      replacement_blob="$(git -C "${ROOT_DIR}" rev-parse "HEAD:${replacement}")"
      if [[ "${base_blob}" == "${replacement_blob}" ]]; then
        continue
      fi
    fi
    printf 'Previously published migration was deleted: %s\n' "${migration}" >&2
    exit 1
  fi

  head_blob="$(git -C "${ROOT_DIR}" rev-parse "HEAD:${migration}")"
  if [[ "${base_blob}" != "${head_blob}" ]]; then
    printf 'Previously published migration was modified: %s\n' "${migration}" >&2
    printf 'Add a new forward-only migration instead.\n' >&2
    exit 1
  fi
done

printf 'Migration history is append-only relative to %s (%s protected files).\n' \
  "${base_ref}" "${#base_migrations[@]}"
