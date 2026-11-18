#!/bin/bash
# DRAFT, NOT EXECUTED. SANDBOX (SANDBOX_BINANCE_USDM) switch helper:
#   status | baseline | stage | worker-stop | manager | edge | memo-on | verify | rollback-edge | rollback-manager | worker-start
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
RENDER="python3 -B $SRC/sandbox_render.py"

# --- approved hashes -------------------------------------------------------------------------------------------------------------------------------------------
CAT_SHA=cb1d41cacc7beca0431a38be94a1130432cc5425e93e739792716d56b72bd154       # relation-catalogue.json (67, real tool)
POL_SHA=4f3cd95a9d8b783166413aa1c633a537dfb5280154a9d4dd1a9e2eac5adb6d59       # serving-policy.json
PRO_SHA=979191a8da756b33bb0deaf23ba5ac7562146fb4ae7b1bc46cbda1cb81c2a8b7       # profile-selection.json
REL_SHA=af20d83d1b07a35e514dc67d03563896135dea65d71f8b9bbb624ead24f1fa84       # manager-catalogue-release.json
MGR_RENDER_SHA=59e9ef3ccd9d215c3e174f0aed55fb0f0bd6926820dd75d259c2220a81309459
EDGE_RENDER_SHA=28f2e6dfbe9e78c7814c6b47d234c05c4e4debfd2886ea75a18e91cfca9b97a2
MEMO_ON_SHA=b2ee0c620ce2043f1aa7d32131cf5d2dd9f7f849d127786d463396d891d28342
MGR_ROLLBACK_SHA=3567eff15a65d2c0d6936f023c4880fa45565e94d9e912bda321a558e539be7d
EDGE_ROLLBACK_SHA=1dea1b15261b2016ea15ccdeab3cc14ea2558793d3a4ac435dd4e0659ae0b03b

h() { sha256sum "$1" | cut -c1-64; }
need() { [ "$(h "$1")" = "$2" ] || { echo "STOP: hash of $1 differs from approved $2"; exit 2; }; }
state() { for c in $MC $EC $WC; do echo "$c image=$(docker inspect $c --format '{{.Image}}') status=$(docker inspect $c --format '{{.State.Status}}') started=$(docker inspect $c --format '{{.State.StartedAt}}') restarts=$(docker inspect $c --format '{{.RestartCount}}') health=$(docker inspect $c --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')"; done; }
need_src() {
  need $SRC/artifacts/binance-t1t2five67/relation-catalogue.json $CAT_SHA; need $SRC/artifacts/binance-t1t2five67/serving-policy.json $POL_SHA
  need $SRC/artifacts/binance-t1t2five67/profile-selection.json $PRO_SHA; need $SRC/artifacts/binance-t1t2five67/manager-catalogue-release.json $REL_SHA
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
wait_healthy() { s=""; for i in 1 2 3 4 5 6; do sleep 10; s=$(docker inspect $EC --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'); echo "health=$s"; [ "$s" = healthy ] && break; done; }

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
    if [ -e "$D/$n" ]; then need "$D/$n" "$want"; else install -m 0644 "$SRC/artifacts/binance-t1t2five67/$n" "$D/$n"; fi
  done
  need $D/manager-catalogue-release.json $REL_SHA; need $D/profile-selection.json $PRO_SHA
  # 3. secret dir: package files only if absent (mode 0600), then the copies of the current Sandbox Manager files (python tool, same rule)
  for f in relation-catalogue.json serving-policy.json; do
    [ -e $SEC/$f ] || install -m 0600 $SRC/artifacts/binance-t1t2five67/$f $SEC/$f
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
memo-on)   # separate step after a clean verify: memo 30 s via the one-value override
  need_renders; [ "$(docker inspect $EC --format '{{.Image}}')" = $NEW_E ] || { echo "STOP: Edge not on the new image"; exit 3; }
  edc $RD/edge-sandbox.rendered.json -f $RD/override-edge-memo-on.yaml up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5; wait_healthy; state ;;
verify) # read-only
  state
  echo "Manager mounts (destinations):"; docker inspect $MC --format '{{range .Mounts}}{{.Destination}}{{println}}{{end}}' | sort | tr '\n' ' '; echo
  docker inspect $MC --format 'Manager cmd={{json .Config.Cmd}} ip={{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}} ports={{json .NetworkSettings.Ports}} limits mem={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}}'
  echo "Manager env names set by compose: $(docker inspect $MC --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | grep -E '^(TS_PORTAL_MANAGER_S1_SOURCE_ID|TS_PORTAL_MANAGER_READ_RUNTIME_ENV_FILE)$' | tr '\n' ' ')"
  echo "Manager log lines with 'error' (120 s): $(docker logs --since 120s $MC 2>&1 | grep -ci error || true) (expected 0)"
  docker inspect $EC --format 'Edge image={{.Image}} release-mount={{range .Mounts}}{{if eq .Destination "/run/manager-release/catalogue.json"}}yes{{end}}{{end}}'
  docker inspect $EC --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^EDGE_MANAGER_(CATALOGUE_RELEASE_SHA256|CATALOGUE_CACHE_TTL_MS|SOURCE_DB_PIN)' | sed -E 's/(sha256:[0-9a-f]{12})[0-9a-f]+/\1.../'
  echo "Edge log CATALOGUE_DRIFT lines (120 s): $(docker logs --since 120s $EC 2>&1 | grep -c CATALOGUE_DRIFT || true) (expected 0)"
  echo "Edge log SOURCE_DB_IDENTITY_MISMATCH lines (120 s): $(docker logs --since 120s $EC 2>&1 | grep -c SOURCE_DB_IDENTITY_MISMATCH || true) (expected 0: guard off)"
  echo "Edge restarts: $(docker inspect $EC --format '{{.RestartCount}}') (expected 0)" ;;
rollback-edge)    # the CURRENT (pre-switch) Edge state, rendered from the running container before the switch: image d6aa7a51, no release variables
  need $RD/edge-sandbox.rollback.rendered.json $EDGE_ROLLBACK_SHA
  echo "edge rollback start $(date -u +%FT%TZ)"; edc $RD/edge-sandbox.rollback.rendered.json up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5; wait_healthy; state ;;
rollback-manager) # the CURRENT (pre-switch) Manager state: image 0bd48db3, old command, the OLD mount sources (live_data_executor DSN, old catalogue/policy); old files stay on disk
  need $RD/manager-sandbox.rollback.rendered.json $MGR_ROLLBACK_SHA
  echo "manager rollback start $(date -u +%FT%TZ)"; mdc $RD/manager-sandbox.rollback.rendered.json up -d --no-deps --pull never --force-recreate portal_manager_read 2>&1 | tail -n 5; sleep 8; state ;;
worker-start) docker start $WC >/dev/null; state ;;
*) echo "usage: sandbox_switch_step.sh status|baseline|stage|worker-stop|manager|edge|memo-on|verify|rollback-edge|rollback-manager|worker-start"; exit 64 ;;
esac
