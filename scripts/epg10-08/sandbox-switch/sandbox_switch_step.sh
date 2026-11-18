#!/bin/bash
# DRAFT, NOT EXECUTED. SANDBOX (SANDBOX_BINANCE_USDM) switch helper:
#   status | baseline | stage | worker-stop | manager | edge | memo-on | memo-off | pin-stage | pin-on | pin-off | verify | rollback-edge | rollback-manager | worker-start
# 2026-11-18 (after the switch): the Sandbox now runs Manager 8d4765a4 + Edge 167e031a (release pin 14778175, memo off, guard off). memo-on/memo-off/pin-on/pin-off recreate ONLY the
# Sandbox Edge from render-final/edge-sandbox.rendered.json plus the overlay files wanted (memo-on override, guard-pin override); each step keeps the OTHER overlay as it is live.
# Owner approved the switch (D1-D12 recommended); the DB step (login, grants, indexes, pg_hba, facade-db.dsn in the new secret dir) is done by the coordinator BEFORE `stage`.
# Boundary: only the Sandbox Manager read service, the Sandbox Edge service and the Sandbox projection worker. Never Paper, Live or the issuers.
# Compose files are RENDERED from `docker inspect` by sandbox_render.py (the original compose sources are gone or unreadable); their sha256 are pinned below. A drift check
# re-renders and compares before every recreate. Nothing is ever deleted or overwritten. One step per call, stops at the first error. The identity pin is NOT here (separate, last).
set -euo pipefail

# --- facts read from the host (docker inspect) ---------------------------------------------------------------------------------------------------------------
MC=trading-system-manager-read-sandbox-portal_manager_read-1       # project trading-system-manager-read-sandbox, 127.0.0.1:8123, executor_network
EC=portal-execution-edge-sandbox-execution-edge-1                  # project portal-execution-edge-sandbox, 10.70.0.2:8444
WC=portal-execution-edge-sandbox-manager-projection-worker-1
OLD_M=sha256:0bd48db3ca54ce2b236caaf55f01a1c02bb6050d4cbb2a48c2d54f291aa873b7
OLD_E=sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e
NEW_M=sha256:8d4765a4451431ec6a5e146a24745d3bc791b411e1b0093bbf8cee8edc1044dd
NEW_E=sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054
R=/home/bobby/.local/state/portal-execution-edge/releases
D=$R/sandbox-switch-20261116                                        # staging dir (non-secret files; it already holds the baseline file)
RD=$D/render-final                                                  # rendered compose files (0600; they contain host paths). $D/render holds the first, faulty render of 2026-11-18 (see the doc) and stays untouched
SEC=/home/bobby/secure/portal-manager-sandbox-20261116              # private dir: the DB step creates it (0700) with ONLY facade-db.dsn
SRC=${SBX_SRC:-/home/bobby/.worktrees/edge-from-running-source-20261116/scripts/epg10-08/sandbox-switch}
RENDER=${SBX_RENDER:-"python3 -B $SRC/sandbox_render.py"}   # SBX_RENDER only for the shim tests (tests/test_step_shim.sh)

PD=${SBX_PD:-$R/guard-pin-sandbox-20261118}                                    # staged guard pin (pin file + override, non-secret), created by pin-stage

# --- approved hashes -------------------------------------------------------------------------------------------------------------------------------------------
CAT_SHA=372e99b2d0476a7240a53069c77def71f5cdaf50e7f83522f822be5d726db19a       # relation-catalogue.json (106: 67 real-tool-qualified + 39 carried from the current Sandbox catalogue)
POL_SHA=30da2153d8e4743c5d37d6119232a9b976f57ef0605efc46867dd16a1c8b6032       # serving-policy.json
PRO_SHA=7ed7d49b12c5153b003256a2fd17fe3bba83c4d5fea40c3f39cdb9f9d06054ca       # profile-selection.json
REL_SHA=14778175eb6720c8b56ae0dd245023e2aff2e1afb161edb0ef6f32872699a1a5       # manager-catalogue-release.json
MGR_RENDER_SHA=9aac08fb07d2b253c01756d9039d5db9a206dde67bafaa0b0384f43cdb2575ab
EDGE_RENDER_SHA=3ae54225f4c403b59ef9b437c18e18d1209c56289bc467bb2ea85ca6b9cc9a81
MEMO_ON_SHA=b2ee0c620ce2043f1aa7d32131cf5d2dd9f7f849d127786d463396d891d28342
MGR_ROLLBACK_SHA=3567eff15a65d2c0d6936f023c4880fa45565e94d9e912bda321a558e539be7d
EDGE_ROLLBACK_SHA=1dea1b15261b2016ea15ccdeab3cc14ea2558793d3a4ac435dd4e0659ae0b03b
PIN_SHA=1fd93331ed27902d049366451e1c787eb024992c6aac9388145ef8259cfa51f6       # pin.sandbox.json (SANDBOX_BINANCE_USDM, trading_system_sandbox, ledger minimum 124)
OVR_SHA=db75fcced83586d8bf177aea11b869985e8ed2165ed844271fba4b696f6b8bb0       # override-sandbox-guard-pin-on.yaml

h() { sha256sum "$1" | cut -c1-64; }
need() { [ "$(h "$1")" = "$2" ] || { echo "STOP: hash of $1 differs from approved $2"; exit 2; }; }
state() { for c in $MC $EC $WC; do echo "$c image=$(docker inspect $c --format '{{.Image}}') status=$(docker inspect $c --format '{{.State.Status}}') started=$(docker inspect $c --format '{{.State.StartedAt}}') restarts=$(docker inspect $c --format '{{.RestartCount}}') health=$(docker inspect $c --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')"; done; }
need_src() {
  need $SRC/artifacts/binance-union106/relation-catalogue.json $CAT_SHA; need $SRC/artifacts/binance-union106/serving-policy.json $POL_SHA
  need $SRC/artifacts/binance-union106/profile-selection.json $PRO_SHA; need $SRC/artifacts/binance-union106/manager-catalogue-release.json $REL_SHA
}
need_renders() {
  need $RD/manager-sandbox.rendered.json $MGR_RENDER_SHA; need $RD/edge-sandbox.rendered.json $EDGE_RENDER_SHA; need $RD/override-edge-memo-on.yaml $MEMO_ON_SHA
  need $RD/manager-sandbox.rollback.rendered.json $MGR_ROLLBACK_SHA; need $RD/edge-sandbox.rollback.rendered.json $EDGE_ROLLBACK_SHA
}
need_sec() {   # every file the Manager mounts, mode 0600, the two package files byte-exact, the DSN shape
  for f in facade-db.dsn facade-runtime.env relation-catalogue.json serving-policy.json cursor.key jwt-jwks.json revocations.json server-cert.pem server-key.pem mtls-ca-cert.pem ts-postgres-ca.crt; do
    [ -f $SEC/$f ] && [ "$(stat -c %a $SEC/$f)" = 600 ] || { echo "STOP: $SEC/$f missing or not mode 0600"; exit 3; }
  done
  need $SEC/relation-catalogue.json $CAT_SHA; need $SEC/serving-policy.json $POL_SHA
  $RENDER dsn --sec $SEC
}
mdc() { docker compose -p trading-system-manager-read-sandbox -f "$1" "${@:2}"; }
edc() { docker compose -p portal-execution-edge-sandbox -f "$1" "${@:2}"; }
# live Edge overlay state, read from the running container (never assumed)
evar() { docker inspect $EC --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n "s/^$1=//p"; }
memo_state() { t=$(evar EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS); if [ -n "$t" ] && [ "$t" != 0 ]; then echo on; else echo off; fi; }
guard_state() { if [ -n "$(evar EDGE_MANAGER_SOURCE_DB_PIN_FILE)" ]; then echo on; else echo off; fi; }
# recreate ONLY execution-edge from the rendered file + the wanted overlays: edge_recreate <memo on|off> <guard on|off>
edge_recreate() {
  a=(-p portal-execution-edge-sandbox -f $RD/edge-sandbox.rendered.json)
  [ "$1" = on ] && a+=(-f $RD/override-edge-memo-on.yaml)
  [ "$2" = on ] && a+=(-f $PD/override-sandbox-guard-pin-on.yaml)
  docker compose "${a[@]}" up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5
}
# gate of every post-switch Edge step: renders approved, Manager and Edge on the new images, release pin as approved, the live Edge still renders to the approved file
gate_edge_live() {
  need_renders; need $D/manager-catalogue-release.json $REL_SHA
  [ "$(docker inspect $MC --format '{{.Image}}')" = $NEW_M ] || { echo "STOP: the Manager is not on the new image"; exit 3; }
  [ "$(docker inspect $MC --format '{{.State.Status}}')" = running ] || { echo "STOP: the Manager is not running"; exit 3; }
  [ "$(docker inspect $EC --format '{{.Image}}')" = $NEW_E ] || { echo "STOP: Edge not on the new image"; exit 3; }
  [ "$(evar EDGE_MANAGER_CATALOGUE_RELEASE_SHA256)" = "sha256:$REL_SHA" ] || { echo "STOP: the Edge release pin is not the approved release"; exit 3; }
  $RENDER check --out $RD --only edge --live      # the live Edge (any overlay state) still renders to the approved base file
}
wait_healthy() { s=""; for i in 1 2 3 4 5 6; do sleep 10; s=$(docker inspect $EC --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'); echo "health=$s"; [ "$s" = healthy ] && break; done; return 0; }   # return 0: an unhealthy last probe must not abort the script under set -e before its own rollback branch runs

case "${1:-}" in
status) state; docker inspect $WC --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^EDGE_MANAGER_PROJECTION_(OWNER_DIGEST|REBUILD_AUTHORIZED|ENABLED)' | sed -E 's/(sha256:[0-9a-f]{12})[0-9a-f]+/\1.../'; ls -l $D $RD 2>&1 | head -20 ;;
baseline) # read-only: image ids, compose labels, env NAMES, mount destinations into a new file (never secret values)
  mkdir -p "$D"; out="$D/baseline-$(date -u +%Y%m%dT%H%M%SZ).txt"; [ ! -e "$out" ] || { echo STOP exists; exit 3; }
  { state; for c in $MC $EC $WC; do echo "== $c"; docker inspect $c --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'; docker inspect $c --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sort; docker inspect $c --format '{{range .Mounts}}{{.Destination}} rw={{.RW}}{{println}}{{end}}' | sort; done; } > "$out"; echo "baseline written: $out" ;;
stage)  # tolerant: $SEC may already exist with exactly facade-db.dsn (DB step); $D already holds the baseline file. Never overwrites; adds files only if absent.
  need_src
  [ -f $SEC/facade-db.dsn ] || { echo "STOP: $SEC/facade-db.dsn is missing: run the DB step first"; exit 3; }
  [ ! -e $RD ] || { echo "STOP: $RD exists (stage never overwrites)"; exit 3; }
  # 1. render from the running containers and compare with the approved hashes (drift = inputs changed since approval)
  $RENDER render --out $RD
  need_renders
  # 2. non-secret files into the staging dir
  install -d -m 0755 "$D"
  for f in manager-catalogue-release.json:$REL_SHA profile-selection.json:$PRO_SHA; do   # tolerant: keep a file that already exists with the approved bytes
    n=${f%%:*}; want=${f##*:}
    if [ -e "$D/$n" ]; then need "$D/$n" "$want"; else install -m 0644 "$SRC/artifacts/binance-union106/$n" "$D/$n"; fi
  done
  need $D/manager-catalogue-release.json $REL_SHA; need $D/profile-selection.json $PRO_SHA
  # 3. secret dir: package files only if absent (mode 0600), then the copies of the current Sandbox Manager files (python tool, same rule)
  for f in relation-catalogue.json serving-policy.json; do
    [ -e $SEC/$f ] || install -m 0600 $SRC/artifacts/binance-union106/$f $SEC/$f
  done
  $RENDER secrets --sec $SEC
  need_sec; echo "stage done $(date -u +%FT%TZ)"; ls -l $D $SEC ;;
worker-stop)   # decision D9: the N24 worker pins the OLD catalogue digest; data in its store is kept
  [ "$(docker inspect $WC --format '{{.Image}}')" = $OLD_E ] || { echo "STOP: worker image changed"; exit 3; }
  echo "worker stop $(date -u +%FT%TZ)"; docker stop $WC >/dev/null; state ;;
manager)
  need_src; need_renders; need_sec
  [ "$(docker inspect $MC --format '{{.Image}}')" = $OLD_M ] || { echo "STOP: Manager is not on the recorded old image"; exit 3; }
  $RENDER check --out $RD --only manager      # the Sandbox Manager container still renders to what was approved
  [ "$(docker inspect $WC --format '{{.State.Status}}')" != running ] || { echo "STOP: the projection worker is still running (run worker-stop, decision D9)"; exit 3; }
  echo "manager recreate start $(date -u +%FT%TZ)"; mdc $RD/manager-sandbox.rendered.json up -d --no-deps --pull never --force-recreate portal_manager_read 2>&1 | tail -n 5
  sleep 8; state
  [ "$(docker inspect $MC --format '{{.Image}}')" = $NEW_M ] && [ "$(docker inspect $MC --format '{{.State.Status}}')" = running ] || { echo "STOP: Manager not running on the new image: run rollback-manager"; exit 4; }
  docker inspect $MC --format 'ip={{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}} ports={{json .NetworkSettings.Ports}}'
  echo "manager recreate done $(date -u +%FT%TZ)  -> now: $0 edge  (the Edge refuses the new catalogue until its release pin changes)" ;;
edge)
  need_src; need_renders; need $D/manager-catalogue-release.json $REL_SHA
  [ "$(docker inspect $EC --format '{{.Image}}')" = $OLD_E ] || { echo "STOP: Edge is not on the recorded old image"; exit 3; }
  [ "$(docker inspect $MC --format '{{.Image}}')" = $NEW_M ] || { echo "STOP: the Manager is not on the new image yet (run manager first)"; exit 3; }
  $RENDER check --out $RD --only edge          # the Sandbox Edge container still renders to what was approved
  echo "edge recreate start $(date -u +%FT%TZ)"; edc $RD/edge-sandbox.rendered.json up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5
  wait_healthy; state
  [ "$(docker inspect $EC --format '{{.Image}}')" = $NEW_E ] && [ "$s" = healthy ] || { echo "STOP: Edge not healthy on the new image: run rollback-edge then rollback-manager"; exit 4; }
  echo "edge recreate done $(date -u +%FT%TZ)" ;;
memo-on|memo-off)   # separate step after a clean verify; the guard overlay stays exactly as it is live
  gate_edge_live; want=${1#memo-}; g=$(guard_state)
  [ "$g" != on ] || need $PD/override-sandbox-guard-pin-on.yaml $OVR_SHA
  [ "$(memo_state)" != $want ] || { echo "STOP: the memo is already $want"; exit 3; }
  echo "edge $1 start $(date -u +%FT%TZ) (guard $g kept)"; edge_recreate $want $g; wait_healthy; state
  [ "$s" = healthy ] || { echo "STOP: Edge not healthy after $1: run memo-$([ $want = on ] && echo off || echo on) or rollback-edge"; exit 4; }
  echo "edge $1 done $(date -u +%FT%TZ)" ;;
pin-stage)   # no service touched; creates ONE new directory with the pin file and the override, never overwrites
  need $SRC/pin.sandbox.json $PIN_SHA; need $SRC/override-sandbox-guard-pin-on.yaml $OVR_SHA
  [ ! -e $PD ] || { echo "STOP: $PD already exists (pin-stage never overwrites)"; exit 3; }
  install -d -m 0755 $PD; install -m 0644 $SRC/pin.sandbox.json $PD/pin.sandbox.json; install -m 0644 $SRC/override-sandbox-guard-pin-on.yaml $PD/override-sandbox-guard-pin-on.yaml
  need $PD/pin.sandbox.json $PIN_SHA; need $PD/override-sandbox-guard-pin-on.yaml $OVR_SHA; ls -l $PD; echo "pin-stage done $(date -u +%FT%TZ)" ;;
pin-on)   # guard ON: adds EDGE_MANAGER_SOURCE_DB_PIN_FILE/_SHA256 + a read-only bind of the pin file; the memo overlay stays as it is live
  gate_edge_live; need $PD/pin.sandbox.json $PIN_SHA; need $PD/override-sandbox-guard-pin-on.yaml $OVR_SHA
  [ "$(guard_state)" = off ] || { echo "STOP: the guard is already on"; exit 3; }
  m=$(memo_state); echo "edge pin-on start $(date -u +%FT%TZ) (memo $m kept)"
  edge_recreate $m on; wait_healthy; state
  if [ "$(docker inspect $EC --format '{{.Image}}')" != $NEW_E ] || [ "$s" != healthy ]; then
    echo "Edge not healthy with the pin (a pin refused at start exits the process): rolling back to guard off"; edge_recreate $m off; wait_healthy; state
    echo "STOP: pin-on failed, rolled back $(date -u +%FT%TZ)"; exit 4
  fi
  echo "edge pin-on done $(date -u +%FT%TZ)  -> run: $0 verify" ;;
pin-off)   # rollback of pin-on: the same stack WITHOUT the pin variables and mount (the state that runs today); the memo overlay stays as it is live
  gate_edge_live; [ "$(guard_state)" = on ] || { echo "STOP: the guard is already off"; exit 3; }
  m=$(memo_state); echo "edge pin-off start $(date -u +%FT%TZ) (memo $m kept)"; edge_recreate $m off; wait_healthy; state
  [ "$s" = healthy ] || { echo "STOP: Edge not healthy after pin-off: run rollback-edge"; exit 4; }
  echo "edge pin-off done $(date -u +%FT%TZ)" ;;
verify) # read-only
  state
  echo "Manager mounts (destinations):"; docker inspect $MC --format '{{range .Mounts}}{{.Destination}}{{println}}{{end}}' | sort | tr '\n' ' '; echo
  docker inspect $MC --format 'Manager cmd={{json .Config.Cmd}} ip={{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}} ports={{json .NetworkSettings.Ports}} limits mem={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}}'
  echo "Manager env names set by compose: $(docker inspect $MC --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | grep -E '^(TS_PORTAL_MANAGER_S1_SOURCE_ID|TS_PORTAL_MANAGER_READ_RUNTIME_ENV_FILE)$' | tr '\n' ' ')"
  echo "Manager log lines with 'error' (120 s): $(docker logs --since 120s $MC 2>&1 | grep -ci error || true) (expected 0)"
  docker inspect $EC --format 'Edge image={{.Image}} release-mount={{range .Mounts}}{{if eq .Destination "/run/manager-release/catalogue.json"}}yes{{end}}{{end}}'
  docker inspect $EC --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^EDGE_MANAGER_(CATALOGUE_RELEASE_SHA256|CATALOGUE_CACHE_TTL_MS|SOURCE_DB_PIN)' | sed -E 's/(sha256:[0-9a-f]{12})[0-9a-f]+/\1.../'
  echo "Edge log CATALOGUE_DRIFT lines (120 s): $(docker logs --since 120s $EC 2>&1 | grep -c CATALOGUE_DRIFT || true) (expected 0)"
  echo "Edge overlay state: memo=$(memo_state) guard=$(guard_state)"
  echo "Edge log SOURCE_DB_IDENTITY_MISMATCH lines (120 s): $(docker logs --since 120s $EC 2>&1 | grep -c SOURCE_DB_IDENTITY_MISMATCH || true) (expected 0; the guard has nothing to refuse while it is off)"
  echo "Edge restarts: $(docker inspect $EC --format '{{.RestartCount}}') (expected 0)" ;;
rollback-edge)    # the CURRENT (pre-switch) Edge state, rendered from the running container before the switch: image d6aa7a51, no release variables
  need $RD/edge-sandbox.rollback.rendered.json $EDGE_ROLLBACK_SHA
  echo "edge rollback start $(date -u +%FT%TZ)"; edc $RD/edge-sandbox.rollback.rendered.json up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5; wait_healthy; state ;;
rollback-manager) # the CURRENT (pre-switch) Manager state: image 0bd48db3, old command, the OLD mount sources (live_data_executor DSN, old catalogue/policy); old files stay on disk
  need $RD/manager-sandbox.rollback.rendered.json $MGR_ROLLBACK_SHA
  echo "manager rollback start $(date -u +%FT%TZ)"; mdc $RD/manager-sandbox.rollback.rendered.json up -d --no-deps --pull never --force-recreate portal_manager_read 2>&1 | tail -n 5; sleep 8; state ;;
worker-start) docker start $WC >/dev/null; state ;;
*) echo "usage: sandbox_switch_step.sh status|baseline|stage|worker-stop|manager|edge|memo-on|memo-off|pin-stage|pin-on|pin-off|verify|rollback-edge|rollback-manager|worker-start"; exit 64 ;;
esac
