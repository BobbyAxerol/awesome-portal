#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
source "$ROOT_DIR/.githooks/lib/access-policy.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-contributor-workspace.sh

Checks that a non-maintainer is working only on an approved feature branch with
the single approved Primus remote.
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

portal_require_contributor_remote

printf 'Contributor workspace verification passed for branch %s and remote %s.\n' "$(portal_current_branch)" "$PORTAL_CONTRIBUTOR_REMOTE_NAME"
