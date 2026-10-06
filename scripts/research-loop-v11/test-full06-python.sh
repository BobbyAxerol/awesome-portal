#!/usr/bin/env bash
# Package-pinned, read-only source/test mounts; clean exactly this test scratch.
set -euo pipefail
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
task_scratch="$(mktemp -d /tmp/research-full06-python.XXXXXX)"
task_image="sha256:c6ccd4146f990c0ef28653df0f58a5006a28087f93376d68845fd76daf167a9f"
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
cleanup() { test -d "$task_scratch" && [[ "$task_scratch" == /tmp/research-full06-python.* ]] && rm -rf -- "$task_scratch"; }
trap cleanup EXIT
chmod 755 "$task_scratch"
"${DOCKER[@]}" run --rm --read-only --network bridge --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m -v "$task_scratch:/test-deps" \
  "$task_image" python -m pip install --quiet --no-cache-dir --target /test-deps pytest==8.4.2
"${DOCKER[@]}" run --rm --read-only --network none --user "$(id -u):$(id -g)" \
  --memory 2g --pids-limit 128 --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  -v "$task_scratch:/test-deps:ro" -v "$task_root/apps/portal/backend:/test-backend:ro" \
  -v "$task_root/apps/portal/strategy:/test-strategy/strategy:ro" \
  -e PYTHONPATH=/test-backend/src:/test-backend/tests:/test-strategy:/test-deps \
  -e PYTHONDONTWRITEBYTECODE=1 -e NUMBA_CACHE_DIR=/tmp/numba \
  "$task_image" python -m pytest -q -p no:cacheprovider \
  /test-backend/tests/test_research_full06_percent_equity.py "$@"
