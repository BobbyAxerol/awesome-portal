#!/usr/bin/env bash
set -euo pipefail

# Verify the one host-dependent freeze assertion under the exact interpreter
# used by the committed CI and Portal API Dockerfile.  The cached runtime
# image is read-only, has networking disabled, mounts this checkout read-only,
# and is removed immediately.  It is not a build or deployment action.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${P02_PINNED_RUNTIME_IMAGE:-local/portal-research-e17-portal-api:qualification}"

DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    echo "P02 cannot access Docker directly or via passwordless sudo." >&2
    exit 1
  fi
fi

# Resolve the candidate to an immutable local image ID before execution; the
# historical BAR05 report and exact QuantBT version are checked inside it.
image_id="$("${DOCKER[@]}" image inspect --format '{{.Id}}' "$image")"
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "P02 image has no content-addressed ID." >&2; exit 1; }
echo "P02 image ID: $image_id"
"${DOCKER[@]}" run --rm --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -v "$root:/repo:ro" \
  -w /repo \
  "$image_id" \
  python -c "import importlib.util,json; from pathlib import Path; root=Path('/repo'); report=json.loads((root/'upgrade/backend/bar05/environment-report.json').read_text()); spec=importlib.util.spec_from_file_location('env_report',root/'apps/portal/scripts/export_environment_report.py'); module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module); module._git_commit=lambda:report['git_commit']; got=module.build_report(); assert got['packages']==report['packages'],(got['packages'],report['packages']); assert got['python_version']==report['python_version'],(got['python_version'],report['python_version']); assert got['platform']==report['platform'],(got['platform'],report['platform']); assert got['control_api_version']==report['control_api_version']; print('P02 exact-pinned environment receipt: PASS',got['python_version'])"
