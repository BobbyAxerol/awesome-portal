#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-release-channel.sh <preview|dev|stable> [env-file]

Verifies that the checked-out branch, upstream commit and selected non-secret
deployment settings belong to the intended release channel. A dirty worktree is
rejected because a runtime must always be attributable to one Git commit.
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

channel="$1"
env_file="${2:-${ROOT_DIR}/.env}"
branch="$(git -C "${ROOT_DIR}" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
head_commit="$(git -C "${ROOT_DIR}" rev-parse HEAD)"

case "${channel}" in
  preview)
    [[ "${branch}" =~ ^(feat|fix|chore|docs)/[A-Za-z0-9._/-]+$ ]] || {
      printf 'Preview runtime requires a reviewed work branch, found: %s\n' "${branch:-detached}" >&2
      exit 1
    }
    expected_ref="origin/${branch}"
    ;;
  dev)
    [[ "${branch}" == "dev" ]] || {
      printf 'Canonical dev runtime requires branch dev, found: %s\n' "${branch:-detached}" >&2
      exit 1
    }
    expected_ref="origin/dev"
    ;;
  stable)
    [[ "${branch}" == "main" ]] || {
      printf 'Stable runtime requires branch main, found: %s\n' "${branch:-detached}" >&2
      exit 1
    }
    expected_ref="origin/main"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

git -C "${ROOT_DIR}" cat-file -e "${expected_ref}^{commit}" 2>/dev/null || {
  printf 'Required remote-tracking ref is unavailable: %s\n' "${expected_ref}" >&2
  exit 1
}

expected_commit="$(git -C "${ROOT_DIR}" rev-parse "${expected_ref}")"
[[ "${head_commit}" == "${expected_commit}" ]] || {
  printf 'Checked-out commit %s does not equal %s (%s).\n' \
    "${head_commit}" "${expected_ref}" "${expected_commit}" >&2
  exit 1
}

if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain --untracked-files=all)" ]]; then
  printf 'Release-channel source tree is dirty; commit or isolate changes first.\n' >&2
  exit 1
fi

[[ -f "${env_file}" ]] || {
  printf 'Release-channel env file does not exist: %s\n' "${env_file}" >&2
  exit 1
}

read_setting() {
  local key="$1"
  sed -n "s/^${key}=//p" "${env_file}" | tail -n 1
}

stack_name="$(read_setting PORTAL_STACK_NAME)"
http_port="$(read_setting PORTAL_HTTP_PORT)"
image_tag="$(read_setting PORTAL_IMAGE_TAG)"
public_origin="$(read_setting PORTAL_PUBLIC_ORIGIN)"
notification_channels="$(read_setting PORTAL_NOTIFY_CHANNELS)"
notification_channels_compact="${notification_channels//[[:space:]]/}"

if [[ ",${notification_channels_compact}," == *,lark,* ]]; then
  lark_webhook_url="$(read_setting LARK_WEBHOOK_URL)"
  lark_webhook_sign_secret="$(read_setting LARK_WEBHOOK_SIGN_SECRET)"
  lark_org_user_id_map="$(read_setting LARK_ORG_USER_ID_MAP)"
  [[ "${lark_webhook_url}" == https://open.larksuite.com/open-apis/bot/* ]] || {
    printf 'Lark notifications require an open.larksuite.com HTTPS bot URL.\n' >&2
    exit 1
  }
  [[ -n "${lark_webhook_sign_secret}" ]] || {
    printf 'Lark notifications require LARK_WEBHOOK_SIGN_SECRET.\n' >&2
    exit 1
  }
  if [[ -n "${lark_org_user_id_map}" ]]; then
    [[ -n "$(read_setting LARK_APP_ID)" && -n "$(read_setting LARK_APP_SECRET)" ]] || {
      printf 'Lark organization user_id mentions require app directory credentials.\n' >&2
      exit 1
    }
  fi
fi

if [[ "${channel}" == "stable" ]]; then
  [[ "${stack_name}" == portal-stable* ]] || {
    printf 'Stable stack name must start with portal-stable, found: %s\n' "${stack_name}" >&2
    exit 1
  }
  [[ "${http_port}" == "18081" ]] || {
    printf 'Stable loopback port must be 18081, found: %s\n' "${http_port}" >&2
    exit 1
  }
  [[ "${public_origin}" == "https://portal.primusspark.com" ]] || {
    printf 'Stable origin is invalid: %s\n' "${public_origin}" >&2
    exit 1
  }
  [[ -n "${image_tag}" && "${image_tag}" != "dev" ]] || {
    printf 'Stable image tag must be immutable/released, not dev.\n' >&2
    exit 1
  }
else
  [[ "${stack_name}" == "portal" ]] || {
    printf 'Dev/preview stack name must be portal, found: %s\n' "${stack_name}" >&2
    exit 1
  }
  [[ "${http_port}" == "8080" ]] || {
    printf 'Dev/preview loopback port must be 8080, found: %s\n' "${http_port}" >&2
    exit 1
  }
  [[ "${public_origin}" == "https://dev-portal.primusspark.com" ]] || {
    printf 'Dev/preview origin is invalid: %s\n' "${public_origin}" >&2
    exit 1
  }
  [[ "${image_tag}" == "dev" ]] || {
    printf 'Dev/preview image tag must be dev, found: %s\n' "${image_tag}" >&2
    exit 1
  }
fi

printf 'Release channel verified: channel=%s branch=%s commit=%s stack=%s origin=%s\n' \
  "${channel}" "${branch}" "${head_commit}" "${stack_name}" "${public_origin}"
