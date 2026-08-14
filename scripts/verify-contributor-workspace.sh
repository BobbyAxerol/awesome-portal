#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
source "$ROOT_DIR/.githooks/lib/access-policy.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-contributor-workspace.sh

Checks that a non-maintainer is working only on an approved local feature
branch and that the checkout has no configured Git remotes.
EOF
}

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 2
fi

if portal_is_maintainer; then
  printf 'Maintainer checkout detected; contributor-only local restrictions do not apply.\n'
  exit 0
fi

portal_require_contributor_branch

if [[ -n "$(git remote)" ]]; then
  printf 'Contributor workspaces must not have Git remotes. Ask Bobby to provision a local-only workspace.\n' >&2
  exit 1
fi

printf 'Contributor workspace verification passed for branch %s.\n' "$(portal_current_branch)"
