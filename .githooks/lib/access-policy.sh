#!/usr/bin/env bash
# Shared local access policy for Portal Git hooks.
#
# This is a guardrail, not a replacement for Linux file permissions or GitHub
# repository permissions. The owner account is intentionally the only local
# maintainer account; every other account is treated as a contributor.

PORTAL_MAINTAINER_USER="bobby"

portal_current_user() {
  command -p id -un
}

portal_is_maintainer() {
  [[ "$(portal_current_user)" == "$PORTAL_MAINTAINER_USER" ]]
}

portal_current_branch() {
  git branch --show-current
}

portal_is_protected_branch() {
  case "$1" in
    main|dev)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

portal_is_contributor_branch() {
  local branch="$1"
  local branch_tail

  branch_tail="$(printf '%s' "$branch" | cut -d/ -f2-)"
  [[ -n "$branch_tail" ]] || return 1

  case "$branch" in
    feat/*|fix/*|chore/*|docs/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

portal_require_contributor_branch() {
  local branch
  local branch_display

  portal_is_maintainer && return 0
  branch="$(portal_current_branch)"
  branch_display="$branch"
  [[ -n "$branch_display" ]] || branch_display="detached HEAD"

  if portal_is_protected_branch "$branch"; then
    printf 'Contributor account %s cannot commit, merge, or rewrite protected branch %s. Work only on the branch Bobby requested.\n' "$(portal_current_user)" "$branch" >&2
    exit 1
  fi

  if ! portal_is_contributor_branch "$branch"; then
    printf 'Contributor account %s may work only on an approved feat/*, fix/*, chore/*, or docs/* branch; current branch is %s.\n' "$(portal_current_user)" "$branch_display" >&2
    exit 1
  fi
}

portal_require_no_contributor_control_plane_changes() {
  local staged_path

  portal_is_maintainer && return 0

  while IFS= read -r staged_path; do
    case "$staged_path" in
      AGENTS.md|CONTRIBUTING.md|CONTRIBUTOR_AGENT_RULES.md|Makefile|.gitignore|.dockerignore|.githooks/*|.github/*|deploy/*|compose.yaml|scripts/install-git-hooks.sh|scripts/import-contributor-branch.sh|scripts/provision-contributor-workspace.sh|scripts/verify-contributor-workspace.sh|docs/contributor-workspace.md|docs/github-configuration.md)
        printf 'Contributor account %s cannot commit Portal control-plane changes: %s. Ask Bobby to make or stage this change.\n' "$(portal_current_user)" "$staged_path" >&2
        exit 1
        ;;
    esac
  done < <(git diff --cached --name-only --diff-filter=ACMR)
}

portal_block_contributor_push() {
  local remote_name="$1"

  portal_is_maintainer && return 0

  printf 'Contributor account %s cannot push to %s. This workspace is local-only; hand the branch back to Bobby for review and any remote push.\n' "$(portal_current_user)" "$remote_name" >&2
  exit 1
}
