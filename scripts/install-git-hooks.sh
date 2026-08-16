#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS=(pre-applypatch pre-commit pre-merge-commit pre-push pre-rebase)

git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null
[[ -f "${ROOT_DIR}/.githooks/lib/access-policy.sh" ]] || {
  printf 'Portal access-policy helper is missing.\n' >&2
  exit 1
}

for hook in "${HOOKS[@]}"; do
  [[ -f "${ROOT_DIR}/.githooks/${hook}" ]] || {
    printf 'Required Portal hook is missing: %s\n' "${hook}" >&2
    exit 1
  }
  chmod +x "${ROOT_DIR}/.githooks/${hook}"
done

git -C "${ROOT_DIR}" config core.hooksPath .githooks
printf 'Enabled Portal hooks from %s/.githooks: %s\n' "${ROOT_DIR}" "${HOOKS[*]}"
