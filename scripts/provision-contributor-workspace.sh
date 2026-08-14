#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"
MAINTAINER_USER="bobby"
CONTRIBUTOR_USER="thanhvuong"
CONTRIBUTOR_GIT_NAME="Thanh Vuong"
CONTRIBUTOR_GIT_EMAIL="thanhvuong@local.invalid"
MAINTAINER_GROUP="$(id -gn "$MAINTAINER_USER")"
WORKSPACE_ROOT="/srv/portal-contributors"
BRANCH=""
STAGE_DIR=""

usage() {
  cat <<'EOF'
Usage: ./scripts/provision-contributor-workspace.sh --branch <branch>

Creates a separate contributor checkout for Thanh Vuong under
/srv/portal-contributors/<branch>. The branch must already exist locally and
match feat/*, fix/*, chore/*, or docs/*. The checkout has only primus-origin
for feature-branch push and is owned by the contributor while Bobby retains
read access for recovery.
EOF
}

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

cleanup() {
  [[ -n "$STAGE_DIR" ]] && rm -rf "$STAGE_DIR"
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

[[ "$(id -un)" == "$MAINTAINER_USER" ]] || die 'Only the bobby maintainer account can provision a contributor workspace.'
git -C "$ROOT_DIR" check-ref-format --branch "$BRANCH" >/dev/null
source "$ROOT_DIR/.githooks/lib/access-policy.sh"
portal_is_contributor_branch "$BRANCH" || die 'Contributor branch must begin with feat/, fix/, chore/, or docs/.'
git -C "$ROOT_DIR" show-ref --verify --quiet "refs/heads/$BRANCH" || die "Local branch $BRANCH does not exist."
git -C "$ROOT_DIR" diff --quiet || die 'Canonical Portal checkout has unstaged changes. Commit or stash them before provisioning.'
git -C "$ROOT_DIR" diff --cached --quiet || die 'Canonical Portal checkout has staged changes. Commit or stash them before provisioning.'

WORKSPACE="$WORKSPACE_ROOT/$BRANCH"
case "$WORKSPACE" in
  "$WORKSPACE_ROOT"/*)
    ;;
  *)
    die 'Resolved contributor workspace is outside the approved workspace root.'
    ;;
esac

sudo -n true || die 'Passwordless sudo is required to provision /srv/portal-contributors.'
if sudo -n test -e "$WORKSPACE"; then
  die "Contributor workspace already exists: $WORKSPACE. It is never overwritten automatically."
fi

STAGE_DIR="$(mktemp -d -t portal-contributor-workspace.XXXXXX)"
trap cleanup EXIT

git clone --no-local --branch "$BRANCH" --single-branch "$ROOT_DIR" "$STAGE_DIR/portal"
git -C "$STAGE_DIR/portal" remote remove origin
git -C "$STAGE_DIR/portal" config --unset-all "branch.$BRANCH.remote" || true
git -C "$STAGE_DIR/portal" config --unset-all "branch.$BRANCH.merge" || true
git -C "$STAGE_DIR/portal" remote add "$PORTAL_CONTRIBUTOR_REMOTE_NAME" "$PORTAL_CONTRIBUTOR_REMOTE_URL"
git -C "$STAGE_DIR/portal" config remote.pushDefault "$PORTAL_CONTRIBUTOR_REMOTE_NAME"
git -C "$STAGE_DIR/portal" config "branch.$BRANCH.pushRemote" "$PORTAL_CONTRIBUTOR_REMOTE_NAME"
git -C "$STAGE_DIR/portal" config core.hooksPath .githooks
git -C "$STAGE_DIR/portal" config user.name "$CONTRIBUTOR_GIT_NAME"
git -C "$STAGE_DIR/portal" config user.email "$CONTRIBUTOR_GIT_EMAIL"
git -C "$STAGE_DIR/portal" remote get-url --push "$PORTAL_CONTRIBUTOR_REMOTE_NAME" | grep -Fx "$PORTAL_CONTRIBUTOR_REMOTE_URL" >/dev/null || die 'Provisioning refused because the Primus push URL is incorrect.'

SOURCE_COMMIT="$(git -C "$STAGE_DIR/portal" rev-parse HEAD)"
printf 'PORTAL_CONTRIBUTOR_WORKSPACE=1\nBRANCH=%s\nSOURCE_COMMIT=%s\nPROVISIONED_BY=%s\n' "$BRANCH" "$SOURCE_COMMIT" "$MAINTAINER_USER" > "$STAGE_DIR/portal/.portal-contributor-workspace"

sudo -n install -d -o "$MAINTAINER_USER" -g "$MAINTAINER_GROUP" -m 0751 "$WORKSPACE_ROOT"
sudo -n install -d -o "$MAINTAINER_USER" -g "$MAINTAINER_GROUP" -m 0751 "$(dirname "$WORKSPACE")"
sudo -n mv "$STAGE_DIR/portal" "$WORKSPACE"
sudo -n chown -R --no-dereference "$CONTRIBUTOR_USER:$MAINTAINER_GROUP" "$WORKSPACE"
sudo -n find "$WORKSPACE" -type d -exec chmod g+rx {} +
sudo -n find "$WORKSPACE" -type f -exec chmod g+r {} +
sudo -n chmod 0750 "$WORKSPACE"

printf 'Created contributor workspace: %s\n' "$WORKSPACE"
printf 'It contains branch %s at %s and may push that feature branch only to %s.\n' "$BRANCH" "$SOURCE_COMMIT" "$PORTAL_CONTRIBUTOR_REMOTE_NAME"
