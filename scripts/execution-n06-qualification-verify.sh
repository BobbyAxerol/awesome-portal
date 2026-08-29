#!/usr/bin/env bash
# Fail-closed N06 admission wrapper. It verifies accepted N02/N03 owner bytes
# before the Rust evidence authority. It never opens a socket or changes state.
set -euo pipefail

usage() {
  printf 'Usage: %s --mode template|candidate|acceptance --evidence PATH --verifier-bin PATH [--n02-pack-dir PATH --n03-pack-dir PATH --owner-window-evidence PATH]\n' "$0" >&2
  exit 2
}

mode=""
evidence=""
verifier_bin=""
n02_pack_dir=""
n03_pack_dir=""
owner_window_evidence=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) [[ $# -ge 2 ]] || usage; mode="$2"; shift 2 ;;
    --evidence) [[ $# -ge 2 ]] || usage; evidence="$2"; shift 2 ;;
    --verifier-bin) [[ $# -ge 2 ]] || usage; verifier_bin="$2"; shift 2 ;;
    --n02-pack-dir) [[ $# -ge 2 ]] || usage; n02_pack_dir="$2"; shift 2 ;;
    --n03-pack-dir) [[ $# -ge 2 ]] || usage; n03_pack_dir="$2"; shift 2 ;;
    --owner-window-evidence) [[ $# -ge 2 ]] || usage; owner_window_evidence="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[[ "${mode}" =~ ^(template|candidate|acceptance)$ &&
   -f "${evidence}" && ! -L "${evidence}" &&
   "${verifier_bin}" == /* && -x "${verifier_bin}" && ! -L "${verifier_bin}" ]] || usage

if [[ "${mode}" == template ]]; then
  [[ -z "${n02_pack_dir}" && -z "${n03_pack_dir}" && -z "${owner_window_evidence}" ]] || usage
  exec "${verifier_bin}" --mode template --evidence "${evidence}"
fi

[[ "${evidence}" == /* && "${n02_pack_dir}" == /* && "${n03_pack_dir}" == /* &&
   "${owner_window_evidence}" == /* && -f "${owner_window_evidence}" &&
   ! -L "${owner_window_evidence}" &&
   -d "${n02_pack_dir}" && ! -L "${n02_pack_dir}" &&
   -d "${n03_pack_dir}" && ! -L "${n03_pack_dir}" ]] || usage

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
n02_digest_before="sha256:$(sha256sum "${n02_pack_dir}/owner-pack.manifest.json" | cut -d' ' -f1)"
n03_digest_before="sha256:$(sha256sum "${n03_pack_dir}/owner-implementation.manifest.json" | cut -d' ' -f1)"
owner_window_digest_before="sha256:$(sha256sum "${owner_window_evidence}" | cut -d' ' -f1)"
python3 "${root_dir}/scripts/execution-n03-implementation-verify.py" \
  --mode acceptance --pack-dir "${n03_pack_dir}" \
  --n02-pack-dir "${n02_pack_dir}" >/dev/null

n02_digest="sha256:$(sha256sum "${n02_pack_dir}/owner-pack.manifest.json" | cut -d' ' -f1)"
n03_digest="sha256:$(sha256sum "${n03_pack_dir}/owner-implementation.manifest.json" | cut -d' ' -f1)"
owner_window_digest="sha256:$(sha256sum "${owner_window_evidence}" | cut -d' ' -f1)"
[[ "${n02_digest}" == "${n02_digest_before}" &&
   "${n03_digest}" == "${n03_digest_before}" &&
   "${owner_window_digest}" == "${owner_window_digest_before}" ]] || {
  printf 'N06 qualification rejected owner-pack drift during admission.\n' >&2
  exit 1
}

exec "${verifier_bin}" --mode "${mode}" --evidence "${evidence}" \
  --expected-n02-manifest-sha256 "${n02_digest}" \
  --expected-n03-manifest-sha256 "${n03_digest}" \
  --expected-owner-window-evidence-sha256 "${owner_window_digest}"
