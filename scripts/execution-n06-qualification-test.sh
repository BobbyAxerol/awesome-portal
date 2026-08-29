#!/usr/bin/env bash
# Credential-free parser/admission test. Rust semantic coverage lives in the
# source-qualification crate and runs under execution-edge-test.sh.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
wrapper="${root_dir}/scripts/execution-n06-qualification-verify.sh"
evidence="${root_dir}/services/portal-execution-edge-rs/crates/source-qualification/fixtures/n06-real-source-qualification.template.json"
tmp_dir="$(mktemp -d)"
cleanup() { rm -rf -- "${tmp_dir}"; }
trap cleanup EXIT

verifier="${tmp_dir}/n06-verifier"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -euo pipefail' \
  '[[ "$#" == 4 && "$1" == --mode && "$2" == template && "$3" == --evidence && -f "$4" ]]' \
  'printf "{\"decision\":\"TEMPLATE_VALID\",\"activation_authorized\":false}\n"' \
  > "${verifier}"
chmod 0755 "${verifier}"

result="$("${wrapper}" --mode template --evidence "${evidence}" --verifier-bin "${verifier}")"
[[ "${result}" == '{"decision":"TEMPLATE_VALID","activation_authorized":false}' ]] || {
  printf 'N06 template wrapper returned an unexpected sanitized result.\n' >&2
  exit 1
}
if "${wrapper}" --mode acceptance --evidence "${evidence}" \
  --verifier-bin "${verifier}" >/dev/null 2>&1; then
  printf 'N06 acceptance unexpectedly passed without N02/N03 owner packs.\n' >&2
  exit 1
fi
bash -n "${wrapper}"

printf 'N06 qualification wrapper/template gates passed. No source or service started.\n'
