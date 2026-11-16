#!/bin/bash
# DRAFT, NOT EXECUTED. PAPER source-database identity pin step (guard) on the Paper Edge: status | stage | pin-on | verify | pin-off | rollback.
# Touches ONLY service execution-edge of project portal-execution-edge (--no-deps --pull never, same image 167e031a). The Manager is NOT touched.
# pin-on adds EDGE_MANAGER_SOURCE_DB_PIN_FILE / _SHA256 and a read-only bind of the pin file; pin-off and rollback recreate the CURRENT stack
# (rendered file + T2 release override + T1 release override + memo-on override) WITHOUT them. An unhealthy Edge after pin-on rolls back by itself.
# Never edits or deletes an existing file. One step per call, stops at the first error.
set -euo pipefail

R=/home/bobby/.local/state/portal-execution-edge/releases
EF=$R/m0-r2-20261112/preinstall-20261112T0810Z/edge-candidate.r3.rendered.json
D2=$R/t2-paper-20261116            # T2 release override (kept in the stack, as today)
D1=$R/t1-paper-20261116            # T1 release override + release file (live)
RS=$R/running-source-20261116      # memo-on override (live)
D3=$R/guard-pin-paper-20261116     # new: pin file + guard override (non-secret values)
SRC=${GUARD_PIN_SRC:-/home/bobby/.worktrees/edge-from-running-source-20261116/scripts/epg10-08/guard-pin}
MC=portal-manager-read-paper-v2-portal_manager_read-1; EC=portal-execution-edge-execution-edge-1
MIMG=sha256:8d4765a4451431ec6a5e146a24745d3bc791b411e1b0093bbf8cee8edc1044dd   # Manager with the identity member (live): required by this step
EIMG=sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054   # Edge image (live), unchanged
PIN_SHA=f62d2bf73e7a586fa6f87b05140cbfa669e26f8013135b0be116f0f3ee488f2c       # pin.paper.json
OVR_SHA=8ad15e3561ffd542364f70fd6bbbf61b89e953c67cc2f6d0dce8e7b1a63f3561       # override-guard-pin-on.yaml

h() { sha256sum "$1" | cut -c1-64; }
need() { [ "$(h "$1")" = "$2" ] || { echo "STOP: hash of $1 differs from approved $2"; exit 2; }; }
gate_live() {
  need $EF 8600b9f4670c92e5c009f8aabed3c429faee2bfc6a759822fb284e0cb28b3cda
  need $D2/override-t2-edge-release.yaml 100aa0b5e5a093455f239996c5566ee9c1ba9c3edae9fd432aa7e80e7d212843
  need $D1/override-t1-edge-release.yaml cc9733425c4a8c04ef989db64b330a76d6f0ce2ce30b1b7615dce7150f697e5a
  need $D1/manager-catalogue-release.json 57d52f66d06f098769da43114fcd036045524c1482559ccb4c86089bfba5e5cc
  need $RS/override-edge-running-source-memo-on.yaml 1baea74e03bd3e5133d8fb8c55505c3e2448433206ab76de4e01e9269371d874
}
state() { for c in $MC $EC; do echo "$c image=$(docker inspect $c --format '{{.Image}}') status=$(docker inspect $c --format '{{.State.Status}}') started=$(docker inspect $c --format '{{.State.StartedAt}}') restarts=$(docker inspect $c --format '{{.RestartCount}}') health=$(docker inspect $c --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')"; done; }
pinvars() { docker inspect $EC --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^EDGE_MANAGER_(SOURCE_DB_PIN_FILE|SOURCE_DB_PIN_SHA256|CATALOGUE_CACHE_TTL_MS)' | sed -E 's/(sha256:[0-9a-f]{12})[0-9a-f]+/\1.../' || true; }
# Current Edge stack; pin-on appends one more file.
edc() { docker compose -p portal-execution-edge -f $EF -f $D2/override-t2-edge-release.yaml -f $D1/override-t1-edge-release.yaml -f $RS/override-edge-running-source-memo-on.yaml "$@"; }
wait_healthy() { s=""; for i in 1 2 3 4 5 6; do sleep 10; s=$(docker inspect $EC --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'); echo "health=$s"; [ "$s" = healthy ] && break; done; }
recreate_current() {   # the CURRENT state: no pin variables, no pin mount
  edc up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5
  wait_healthy; state; pinvars
}

case "${1:-}" in
status) state; pinvars; ls -l $D3 2>&1 | head ;;
stage)  # no service touched; creates one new directory, never overwrites
  gate_live; need $SRC/pin.paper.json $PIN_SHA; need $SRC/override-guard-pin-on.yaml $OVR_SHA
  [ ! -e $D3 ] || { echo "STOP: $D3 already exists (stage never overwrites)"; exit 3; }
  install -d -m 0755 $D3
  install -m 0644 $SRC/pin.paper.json $D3/pin.paper.json
  install -m 0644 $SRC/override-guard-pin-on.yaml $D3/override-guard-pin-on.yaml
  need $D3/pin.paper.json $PIN_SHA; need $D3/override-guard-pin-on.yaml $OVR_SHA; ls -l $D3; echo "stage done $(date -u +%FT%TZ)" ;;
pin-on)
  gate_live; need $D3/pin.paper.json $PIN_SHA; need $D3/override-guard-pin-on.yaml $OVR_SHA
  [ "$(docker inspect $MC --format '{{.Image}}')" = $MIMG ] || { echo "STOP: Manager is not on the identity image (a pin that requires the identity member would answer 502 for every read)"; exit 3; }
  [ "$(docker inspect $EC --format '{{.Image}}')" = $EIMG ] || { echo "STOP: Edge image changed"; exit 3; }
  echo "edge pin-on start $(date -u +%FT%TZ)"
  edc -f $D3/override-guard-pin-on.yaml up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5
  wait_healthy; state; pinvars
  if [ "$(docker inspect $EC --format '{{.Image}}')" != $EIMG ] || [ "$s" != healthy ]; then
    echo "Edge not healthy with the pin (a pin refused at start exits the process): rolling back to the current state"; recreate_current
    echo "STOP: pin-on failed, rolled back $(date -u +%FT%TZ)"; exit 4
  fi
  echo "edge pin-on done $(date -u +%FT%TZ)  -> run: $0 verify" ;;
verify) # read-only; reads through the Edge need Core's token and are Core's check
  state; pinvars
  echo "Edge log SOURCE_DB_IDENTITY_MISMATCH lines (120 s): $(docker logs --since 120s $EC 2>&1 | grep -c SOURCE_DB_IDENTITY_MISMATCH || true)  (expected 0)"
  echo "Edge log CATALOGUE_DRIFT lines (120 s): $(docker logs --since 120s $EC 2>&1 | grep -c CATALOGUE_DRIFT || true)  (expected 0)"
  echo "Edge restarts: $(docker inspect $EC --format '{{.RestartCount}}')  (expected 0)" ;;
pin-off|rollback)   # back to the state that runs today: image 167e031a, memo on, T1 release, NO pin variables
  gate_live
  echo "edge $1 start $(date -u +%FT%TZ)"; recreate_current; echo "edge $1 done $(date -u +%FT%TZ)" ;;
*) echo "usage: guard_pin_step.sh status|stage|pin-on|verify|pin-off|rollback"; exit 64 ;;
esac
