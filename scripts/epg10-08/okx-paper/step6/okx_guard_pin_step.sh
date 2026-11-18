#!/bin/bash
# DRAFT, NOT EXECUTED. OKX Paper source-database identity pin (guard) on the OKX Edge: status | stage | pin-on | verify | pin-off.
# Touches ONLY service execution-edge-okx of project portal-execution-edge-okx (--no-deps --pull never, same image). Paper/Sandbox/Live Edges and all Managers untouched.
# pin-on adds EDGE_MANAGER_SOURCE_DB_PIN_FILE/_SHA256 and a read-only bind; pin-off recreates the current stack WITHOUT them.
# An unhealthy Edge after pin-on rolls back by itself. Never edits or deletes an existing file. One step per call, stops at the first error.
set -euo pipefail
D=/home/bobby/.local/state/portal-execution-edge/releases/okx-paper-step4-20261118
G=$D/guard-pin
SRC=${OKX_PIN_SRC:-/home/bobby/.worktrees/edge-okx-paper-ts-20261118/scripts/epg10-08/okx-paper/step6}
EC=portal-execution-edge-okx-execution-edge-1
MC=trading-system-manager-read-paper-okx-portal_manager_read-1
MIMG=sha256:8d4765a4451431ec6a5e146a24745d3bc791b411e1b0093bbf8cee8edc1044dd
EIMG=sha256:8a968a68aa57fbe16ece0ac14b7a19c7fedb98419d0272b42ce04c744cc875a7
PIN_SHA=7463c6e0ab75396426d76ead3c62ed0deb494740376c280ee378500a86d67351
OVR_SHA=edb5d44856d1f8918847c07ecee604abf829bcc4c1c001e603814d9c7edaef8e
h() { sha256sum "$1" | cut -c1-64; }
need() { [ "$(h "$1")" = "$2" ] || { echo "STOP: hash of $1 differs from approved $2"; exit 2; }; }
gate_live() { need $D/render/edge-okx.compose.json 0b17b33e191f0e2a1baef80fb7b08d32d1a1549a0a5bb1516ccff53f4945be08; need $D/override-projection-url.yaml fc8aa748a637297a5ecab41a68c4cb0dbe3eed44a75790cb3f85c707a4c27483; }
state() { for c in $MC $EC; do echo "$c image=$(docker inspect $c --format '{{.Image}}') status=$(docker inspect $c --format '{{.State.Status}}') restarts=$(docker inspect $c --format '{{.RestartCount}}') health=$(docker inspect $c --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')"; done; }
pinvars() { docker inspect $EC --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^EDGE_MANAGER_SOURCE_DB_PIN' | sed -E 's/(sha256:[0-9a-f]{12})[0-9a-f]+/\1.../' || true; }
edc() { docker compose -p portal-execution-edge-okx -f $D/render/edge-okx.compose.json -f $D/render/proxy-okx.compose.json -f $D/override-projection-url.yaml "$@"; }
wait_healthy() { s=""; for i in 1 2 3 4 5 6; do sleep 10; s=$(docker inspect $EC --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'); echo "health=$s"; [ "$s" = healthy ] && break; done; }
recreate_current() { edc up -d --no-deps --pull never --force-recreate execution-edge-okx 2>&1 | tail -n 5; wait_healthy; state; pinvars; }
case "${1:-}" in
status) state; pinvars; ls -l $G 2>&1 | head ;;
stage) gate_live; need $SRC/pin.okx.json $PIN_SHA; need $SRC/override-okx-guard-pin-on.yaml $OVR_SHA
  [ ! -e $G ] || { echo "STOP: $G exists (stage never overwrites)"; exit 3; }
  install -d -m 0755 $G; install -m 0644 $SRC/pin.okx.json $G/pin.okx.json; install -m 0644 $SRC/override-okx-guard-pin-on.yaml $G/override-okx-guard-pin-on.yaml
  need $G/pin.okx.json $PIN_SHA; need $G/override-okx-guard-pin-on.yaml $OVR_SHA; echo "stage done $(date -u +%FT%TZ)" ;;
pin-on) gate_live; need $G/pin.okx.json $PIN_SHA; need $G/override-okx-guard-pin-on.yaml $OVR_SHA
  [ "$(docker inspect $MC --format '{{.Image}}')" = $MIMG ] || { echo "STOP: OKX Manager is not on the identity image"; exit 3; }
  echo "okx edge pin-on start $(date -u +%FT%TZ)"
  edc -f $G/override-okx-guard-pin-on.yaml up -d --no-deps --pull never --force-recreate execution-edge-okx 2>&1 | tail -n 5
  wait_healthy; state; pinvars
  if [ "$s" != healthy ]; then echo "not healthy with the pin: rolling back"; recreate_current; echo "STOP: pin-on failed, rolled back"; exit 4; fi
  echo "okx edge pin-on done $(date -u +%FT%TZ)" ;;
verify) state; pinvars
  echo "MISMATCH lines 120 s: $(docker logs --since 120s $EC 2>&1 | grep -c SOURCE_DB_IDENTITY_MISMATCH || true) (expected 0)"
  echo "CATALOGUE_DRIFT lines 120 s: $(docker logs --since 120s $EC 2>&1 | grep -c CATALOGUE_DRIFT || true) (expected 0)"
  echo "restarts: $(docker inspect $EC --format '{{.RestartCount}}') (expected 0)" ;;
pin-off|rollback) gate_live; echo "okx edge $1 start $(date -u +%FT%TZ)"; recreate_current; echo "okx edge $1 done $(date -u +%FT%TZ)" ;;
*) echo "usage: okx_guard_pin_step.sh status|stage|pin-on|verify|pin-off|rollback"; exit 64 ;;
esac
