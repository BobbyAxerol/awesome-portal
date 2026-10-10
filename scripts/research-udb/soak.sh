#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project=portal-udb01-soak
state="${UDB_LANE_STATE:-/home/bobby/.local/state/portal-udb01/qualification}"
[[ "$state" == /home/bobby/.local/state/portal-udb01/soak || "$state" == /home/bobby/.local/state/portal-udb01/qualification ]] || { echo 'Invalid owned UDB lane directory' >&2; exit 1; }
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
compose() {
  "${DOCKER[@]}" compose -p "$project" --project-directory "$root" --env-file "$state/lane.env" \
    -f "$root/deploy/postgres/compose.udb-soak.yaml" "$@"
}
case "${1:-}" in
  start)
    [[ ! -f "$state/lane.env" ]] || { echo 'UDB soak already recorded; use status/collect, do not overwrite' >&2; exit 1; }
    image="${2:?exact Control API image ID required}"
    [[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
    umask 077
    mkdir -p "$state/scripts" "$state/report"
    # Runtime evidence copies, immutable for the lane even if source advances.
    cp "$root/scripts/research-udb/soak.cjs" "$state/scripts/soak.cjs"
    chmod 755 "$state/scripts"
    chmod 644 "$state/scripts/soak.cjs"
    # Resolve the actual non-root runtime UID; only its own empty report dir.
    uid="$("${DOCKER[@]}" run --rm --network none "$image" node -e 'console.log(process.getuid())')"
    [[ "$uid" =~ ^[0-9]+$ ]] || exit 1
    sudo -n chown "$uid" "$state/report"
    printf 'UDB_WRITER_IMAGE=%s\nUDB_SCRIPT_DIR=%s\nUDB_REPORT_DIR=%s\nUDB_DURATION_SECONDS=%s\n' \
      "$image" "$state/scripts" "$state/report" "${UDB_DURATION_SECONDS:-1200}" > "$state/lane.env"
    sha256sum "$state/scripts/soak.cjs" "$root/deploy/postgres/portal.conf" "$root/deploy/postgres/p23.conf" > "$state/source.sha256"
    compose up -d --no-build
    echo "UDB bounded qualification started: $state (no source, no runtime/business volumes)";;
  status) compose ps -a; sudo -n tail -c 2500 "$state/report/summary.json";
    "${DOCKER[@]}" stats --no-stream --format '{{.Name}} {{.MemUsage}}' portal-udb01-soak-postgres-1 portal-udb01-soak-writer-1;;
  collect)
    writer="$(compose ps -a -q writer)"
    [[ -n "$writer" && "$("${DOCKER[@]}" inspect -f '{{.State.Running}}' "$writer")" == false ]] || { echo 'UDB writer still running; preserve evidence lane' >&2; exit 1; }
    "${DOCKER[@]}" inspect "$writer" --format '{{json .State}}' > "$state/writer-state.json"
    "${DOCKER[@]}" logs --tail 50 "$writer" > "$state/writer.log" 2>&1
    # Source/config integrity is retained even when the lane was superseded.
    sha256sum --check "$state/source.sha256" > "$state/source-check.txt" 2>&1 || true
    "${DOCKER[@]}" exec portal-udb01-soak-postgres-1 sh -c \
      'for name in memory.current memory.peak memory.max memory.events; do echo "$name"; if test -f "/sys/fs/cgroup/$name"; then cat "/sys/fs/cgroup/$name"; else echo NOT_SUPPORTED_BY_HOST_KERNEL; fi; done' > "$state/pg-cgroup.txt"
    sudo -n chown -R "$(id -u):$(id -g)" "$state/report"
    sha256sum "$state/report/summary.json" "$state/report/samples.jsonl" > "$state/evidence.sha256"
    # Exact project/volume created by this test, never shared Portal volumes.
    [[ "$("${DOCKER[@]}" volume inspect -f '{{index .Labels "com.docker.compose.project"}}' portal-udb01-soak_pg-data)" == "$project" ]] || exit 1
    compose down
    "${DOCKER[@]}" volume rm portal-udb01-soak_pg-data
    echo "UDB lane teardown complete; retained $state/report";;
  *) echo "Usage: $0 start <sha256:image> | status | collect" >&2; exit 2;;
esac
