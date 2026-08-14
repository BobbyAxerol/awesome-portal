#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"
MAINTAINER_USER="bobby"
CONTRIBUTOR_USER="thanhvuong"
MAINTAINER_GROUP="$(id -gn "$MAINTAINER_USER")"
WORKSPACE_ROOT="/srv/portal-contributors"
BRANCH=""
BUNDLE_STAGE=""

usage() {
  cat <<'EOF'
Usage: ./scripts/import-contributor-branch.sh --branch <branch>

Reads Thanh Vuong's local-only branch into refs/remotes/contributor/thanhvuong.
The command never merges, rebases, commits, pushes, or rewrites a Portal
branch; Bobby must inspect and integrate the imported ref explicitly.
EOF
}

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

cleanup() {
  [[ -n "$BUNDLE_STAGE" ]] && sudo -n rm -rf "$BUNDLE_STAGE"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      [[ $# -ge 2 ]] || die 'Missing value for --branch.'
      BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

[[ -n "$BRANCH" ]] || {
  usage >&2
  exit 2
}

[[ "$(id -un)" == "$MAINTAINER_USER" ]] || die 'Only the bobby maintainer account can import a contributor branch.'
git -C "$ROOT_DIR" check-ref-format --branch "$BRANCH" >/dev/null
source "$ROOT_DIR/.githooks/lib/access-policy.sh"
portal_is_contributor_branch "$BRANCH" || die 'Contributor branch must begin with feat/, fix/, chore/, or docs/.'
git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$BRANCH" || die "Local branch $BRANCH does not exist."

WORKSPACE="$WORKSPACE_ROOT/$BRANCH"
MARKER="$WORKSPACE/.portal-contributor-workspace"
[[ -d "$WORKSPACE/.git" && ! -L "$WORKSPACE/.git" ]] || die "Expected a standalone Git checkout at $WORKSPACE."
[[ -f "$MARKER" ]] || die "Contributor workspace marker is missing: $MARKER."
grep -Fx "BRANCH=$BRANCH" "$MARKER" >/dev/null || die 'Contributor workspace marker does not match the requested branch.'

if git config --file "$WORKSPACE/.git/config" --get-regexp '^remote\.' >/dev/null; then
  die 'Contributor workspace has a Git remote configured. Refusing to import until Bobby investigates.'
fi

SOURCE_REF="refs/heads/$BRANCH"
DESTINATION_REF="refs/remotes/contributor/$CONTRIBUTOR_USER/$BRANCH"
git check-ref-format "$DESTINATION_REF" >/dev/null

BUNDLE_STAGE="$(mktemp -d -t portal-contributor-import.XXXXXX)"
trap cleanup EXIT
BUNDLE_FILE="$BUNDLE_STAGE/$CONTRIBUTOR_USER.bundle"
sudo -n chown "$CONTRIBUTOR_USER:$MAINTAINER_GROUP" "$BUNDLE_STAGE"
sudo -n chmod 0700 "$BUNDLE_STAGE"
sudo -n -u "$CONTRIBUTOR_USER" git -C "$WORKSPACE" bundle create "$BUNDLE_FILE" "$SOURCE_REF"
sudo -n chown "$MAINTAINER_USER:$MAINTAINER_GROUP" "$BUNDLE_STAGE" "$BUNDLE_FILE"
sudo -n chmod 0700 "$BUNDLE_STAGE"
sudo -n chmod 0600 "$BUNDLE_FILE"
git -C "$ROOT_DIR" fetch --no-tags "$BUNDLE_FILE" "$SOURCE_REF:$DESTINATION_REF"

printf 'Imported %s as %s. No Portal branch was merged or changed.\n' "$SOURCE_REF" "$DESTINATION_REF"
printf 'Review with: git log --oneline %s..%s and git diff %s...%s\n' "$BRANCH" "$DESTINATION_REF" "$BRANCH" "$DESTINATION_REF"
