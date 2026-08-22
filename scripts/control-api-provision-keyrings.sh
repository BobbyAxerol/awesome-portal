#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-${ROOT_DIR}/runtime/control-api-secrets}"
MODE="${2:-}"

usage() {
  printf 'Usage: %s [target-directory] [--force]\n' "$0" >&2
}

if [[ "${MODE}" != "" && "${MODE}" != "--force" ]]; then
  usage
  exit 2
fi
if [[ "${TARGET_DIR}" == "/" || "${TARGET_DIR}" == "${ROOT_DIR}" || "${TARGET_DIR}" == "/home/bobby" ]]; then
  printf 'Refusing unsafe keyring target: %s\n' "${TARGET_DIR}" >&2
  exit 2
fi
command -v openssl >/dev/null 2>&1 || {
  printf 'openssl is required to provision Control API keyrings.\n' >&2
  exit 1
}

umask 077
mkdir -p -- "${TARGET_DIR}"
chmod 700 -- "${TARGET_DIR}"

query_file="${TARGET_DIR}/query-cursor-keyring.json"
governance_file="${TARGET_DIR}/governance-apply-keyring.json"
if [[ "${MODE}" != "--force" && ( -e "${query_file}" || -e "${governance_file}" ) ]]; then
  printf 'Keyring files already exist; refusing to rotate them without --force.\n' >&2
  exit 1
fi

query_tmp="$(mktemp "${TARGET_DIR}/.query-keyring.XXXXXX")"
governance_tmp="$(mktemp "${TARGET_DIR}/.governance-keyring.XXXXXX")"
cleanup() {
  rm -f -- "${query_tmp}" "${governance_tmp}"
}
trap cleanup EXIT

query_secret="$(openssl rand -hex 32)"
governance_secret="$(openssl rand -hex 32)"
if [[ "${query_secret}" == "${governance_secret}" ]]; then
  printf 'Generated keyrings unexpectedly collided; no files were installed.\n' >&2
  exit 1
fi

printf '{"query-k1":"%s"}\n' "${query_secret}" >"${query_tmp}"
printf '{"governance-k1":"%s"}\n' "${governance_secret}" >"${governance_tmp}"
unset query_secret governance_secret
chmod 600 -- "${query_tmp}" "${governance_tmp}"
mv -f -- "${query_tmp}" "${query_file}"
mv -f -- "${governance_tmp}" "${governance_file}"
trap - EXIT

printf 'Provisioned independent Control API keyrings in %s (values not printed).\n' "${TARGET_DIR}"
