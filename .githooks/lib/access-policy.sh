#!/usr/bin/env bash
# Shared local access policy for Portal Git hooks.
#
# This is a guardrail, not a replacement for Linux file permissions or GitHub
# repository permissions. The owner account is intentionally the only local
# maintainer account; every other account is treated as a contributor.

PORTAL_MAINTAINER_USER="bobby"
PORTAL_CONTRIBUTOR_REMOTE_NAME="primus-origin"
PORTAL_CONTRIBUTOR_REMOTE_URL="git@github.com:PrimusSparkQuant/awesome-primus-portal.git"

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
      AGENTS.md|CONTRIBUTING.md|CONTRIBUTOR_AGENT_RULES.md|Makefile|.gitignore|.dockerignore|.githooks/*|.github/*|deploy/*|compose.yaml|scripts/install-git-hooks.sh|scripts/provision-contributor-workspace.sh|scripts/verify-contributor-workspace.sh|docs/contributor-workspace.md|docs/github-configuration.md)
        printf 'Contributor account %s cannot commit Portal control-plane changes: %s. Ask Bobby to make or stage this change.\n' "$(portal_current_user)" "$staged_path" >&2
        exit 1
        ;;
    esac
  done < <(git diff --cached --name-only --diff-filter=ACMR)
}

portal_is_contributor_ref() {
  case "$1" in
    refs/heads/feat/?*|refs/heads/fix/?*|refs/heads/chore/?*|refs/heads/docs/?*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

portal_require_contributor_remote() {
  local remote_names
  local remote_display
  local remote_url

  remote_names="$(git remote)"
  remote_display="$remote_names"
  [[ -n "$remote_display" ]] || remote_display="none"
  if [[ "$remote_names" != "$PORTAL_CONTRIBUTOR_REMOTE_NAME" ]]; then
    printf 'Contributor workspace must have exactly one remote named %s; found: %s.\n' "$PORTAL_CONTRIBUTOR_REMOTE_NAME" "$remote_display" >&2
    exit 1
  fi

  remote_url="$(git remote get-url --push "$PORTAL_CONTRIBUTOR_REMOTE_NAME")"
  if [[ "$remote_url" != "$PORTAL_CONTRIBUTOR_REMOTE_URL" ]]; then
    printf 'Contributor workspace remote %s must point to the approved Primus repository.\n' "$PORTAL_CONTRIBUTOR_REMOTE_NAME" >&2
    exit 1
  fi
}

portal_require_contributor_push() {
  local remote_name="$1"
  local remote_url="$2"
  local local_ref
  local local_sha
  local remote_ref
  local remote_sha

  portal_is_maintainer && return 0

  if [[ "$remote_name" != "$PORTAL_CONTRIBUTOR_REMOTE_NAME" || "$remote_url" != "$PORTAL_CONTRIBUTOR_REMOTE_URL" ]]; then
    printf 'Contributor account %s may push only approved feature branches to %s; %s is blocked.\n' "$(portal_current_user)" "$PORTAL_CONTRIBUTOR_REMOTE_NAME" "$remote_name" >&2
    exit 1
  fi

  portal_require_contributor_remote

  while read -r local_ref local_sha remote_ref remote_sha; do
    if [[ "$local_ref" == "(delete)" ]] || ! portal_is_contributor_ref "$local_ref" || ! portal_is_contributor_ref "$remote_ref"; then
      printf 'Contributor pushes may update only non-deleted feat/*, fix/*, chore/*, or docs/* branch refs on %s.\n' "$PORTAL_CONTRIBUTOR_REMOTE_NAME" >&2
      exit 1
    fi

    if [[ "$local_ref" != "$remote_ref" ]]; then
      printf 'Contributor push source and destination must be the same feature branch ref.\n' >&2
      exit 1
    fi
  done
}
