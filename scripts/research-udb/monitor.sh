#!/usr/bin/env bash
# Owned, finite background collector. Samples local cgroups without repeated
# Docker API polls; it cannot follow another project's container.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
writer=portal-udb01-soak-writer-1
[[ "$("${DOCKER[@]}" inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$writer")" == portal-udb01-soak ]] || exit 1
state="${UDB_LANE_STATE:-/home/bobby/.local/state/portal-udb01/qualification}"
[[ "$state" == /home/bobby/.local/state/portal-udb01/soak || "$state" == /home/bobby/.local/state/portal-udb01/qualification ]] || exit 1
umask 077
# This kernel has no memory.peak. Record actual cgroup charges, not Docker
# working-set readings; memory.max/events still enforce the hard envelope.
pg_id="$("${DOCKER[@]}" inspect -f '{{.Id}}' portal-udb01-soak-postgres-1)"
writer_id="$("${DOCKER[@]}" inspect -f '{{.Id}}' "$writer")"
[[ "$pg_id" =~ ^[0-9a-f]{64}$ && "$writer_id" =~ ^[0-9a-f]{64}$ ]] || exit 1
writer_memory="/sys/fs/cgroup/system.slice/docker-${writer_id}.scope/memory.current"
while [[ -r "$writer_memory" ]]; do
  for name in postgres writer; do
    cid="$pg_id"; [[ "$name" != writer ]] || cid="$writer_id"
    memory="/sys/fs/cgroup/system.slice/docker-${cid}.scope/memory.current"
    [[ -r "$memory" ]] || continue
    # A terminating container can lose its cgroup between readability and read.
    charge="$(<"$memory")" 2>/dev/null || continue
    [[ "$charge" =~ ^[0-9]+$ ]] || continue
    printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$name" "$charge" >> "$state/cgroup-samples.txt"
  done
  sleep 10
done
UDB_LANE_STATE="$state" bash "$root/scripts/research-udb/soak.sh" collect
