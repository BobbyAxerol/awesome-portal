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

# N09 reached Git after an already-deployed equally-prefixed session migration.
# The historic N09 file itself must remain byte-for-byte immutable because dev
# and probe ledgers have already applied it.  A controlled migrator preflight
# repairs only legacy stable ledgers, and this tail sentinel records that
# recovery before later migrations consume the schema.  This exact triple is
# the only allowed duplicate prefix; every other duplicate is a release error.
readonly N09_PREFIX="1723680000012"
readonly N09_ORIGINAL="apps/control-api/migrations/1723680000012_execution-n09-governance-workflow.sql"
readonly N09_SESSION="apps/control-api/migrations/1723680000012_session-activation-proof.sql"
readonly N09_SENTINEL="apps/control-api/migrations/1723680000012_z_n09-governance-workflow-legacy-compatibility.sql"

for scope in "${scopes[@]}"; do
  declare -A seen_prefixes=()
  declare -A duplicate_paths=()
  while IFS= read -r migration; do
    filename="$(basename "${migration}")"
    prefix="${filename%%_*}"
    [[ "${prefix}" =~ ^[0-9]+$ ]] || {
      printf 'Migration filename lacks a numeric prefix: %s\n' "${migration}" >&2
      exit 1
    }
    if [[ -n "${seen_prefixes[${prefix}]:-}" ]]; then
      duplicate_paths["${prefix}"]+=" ${migration}"
    else
      duplicate_paths["${prefix}"]="${migration}"
    fi
    seen_prefixes["${prefix}"]="${migration}"
  done < <(find "${ROOT_DIR}/${scope}" -maxdepth 1 -type f -name '*.sql' -printf "${scope}/%f\n" | sort)

  for prefix in "${!duplicate_paths[@]}"; do
    read -r -a paths <<< "${duplicate_paths[${prefix}]}"
    if [[ "${#paths[@]}" -le 1 ]]; then
      continue
    fi
    if [[ "${scope}" == "apps/control-api/migrations" && "${prefix}" == "${N09_PREFIX}" \
      && "${#paths[@]}" -eq 3 \
      && "${paths[0]}" == "${N09_ORIGINAL}" \
      && "${paths[1]}" == "${N09_SESSION}" \
      && "${paths[2]}" == "${N09_SENTINEL}" ]]; then
      continue
    fi
    printf 'Unexpected duplicate migration numeric prefix %s: %s\n' \
      "${prefix}" "${duplicate_paths[${prefix}]}" >&2
    exit 1
  done
done

mapfile -t base_migrations < <(
  git -C "${ROOT_DIR}" ls-tree -r --name-only "${base_ref}" -- "${scopes[@]}"
)

for migration in "${base_migrations[@]}"; do
  base_blob="$(git -C "${ROOT_DIR}" rev-parse "${base_ref}:${migration}")"
  if ! git -C "${ROOT_DIR}" cat-file -e "HEAD:${migration}" 2>/dev/null; then
    # The short-lived 0028 rename was never deployed.  Its only permitted
    # removal restores the original immutable 0012 blob and adds the tail
    # compatibility sentinel.  This is intentionally narrower than a generic
    # migration rename exemption.
    if [[ "${migration}" == "apps/control-api/migrations/1723680000028_execution-n09-governance-workflow.sql" ]] \
      && git -C "${ROOT_DIR}" cat-file -e "HEAD:${N09_ORIGINAL}" 2>/dev/null \
      && git -C "${ROOT_DIR}" cat-file -e "HEAD:${N09_SENTINEL}" 2>/dev/null; then
      replacement_blob="$(git -C "${ROOT_DIR}" rev-parse "HEAD:${N09_ORIGINAL}")"
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
