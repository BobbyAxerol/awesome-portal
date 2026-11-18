#!/bin/bash
# DRAFT, NOT EXECUTED, NOT APPROVED. SANDBOX (SANDBOX_BINANCE_USDM) switch helper: status | baseline | stage | worker-stop | manager | edge | verify | rollback-edge | rollback-manager | worker-start.
# It REFUSES to run any recreate until the owner decisions of docs/SANDBOX_SWITCH_PLAN_20261116.md section 6 are filled in the block below (rendered compose files + their hashes
# + the Edge override hashes). Nothing here edits or deletes an existing file. One step per call, stops at the first error. The pin step is NOT in this script (it comes last, separate).
# Touches, in order of the plan: the Sandbox Manager read service, the Sandbox Edge service, the Sandbox projection worker. Never the Paper, Live or issuer containers.
set -euo pipefail

# --- facts read from the host (docker inspect, 2026-11-16) ---------------------------------------------------------------------------------------------------
MC=trading-system-manager-read-sandbox-portal_manager_read-1      # project trading-system-manager-read-sandbox, 127.0.0.1:8123, image 0bd48db3 (Aug 28)
EC=portal-execution-edge-sandbox-execution-edge-1                 # project portal-execution-edge-sandbox, 10.70.0.2:8444, image d6aa7a51 (Sep 9)
WC=portal-execution-edge-sandbox-manager-projection-worker-1      # same project, image d6aa7a51, N24 cycles every 60 s
OLD_M=sha256:0bd48db3ca54ce2b236caaf55f01a1c02bb6050d4cbb2a48c2d54f291aa873b7
OLD_E=sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e
NEW_M=sha256:8d4765a4451431ec6a5e146a24745d3bc791b411e1b0093bbf8cee8edc1044dd      # identity image (decision D7)
NEW_E=sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054      # Edge image of the running-source lineage (decision D8)
R=/home/bobby/.local/state/portal-execution-edge/releases
D=$R/sandbox-switch-20261116                                       # new staging dir (non-secret files)
SRC=${SBX_SRC:-/home/bobby/.worktrees/edge-from-running-source-20261116/scripts/epg10-08/sandbox-switch}
SEC=/home/bobby/secure/portal-manager-sandbox-20261116             # new private dir: DSN, runtime env, cursor key, catalogue, policy (owner operator creates it)

# --- BLOCK TO FILL AFTER THE OWNER DECISIONS (empty = the script refuses) --------------------------------------------------------------------------------------
SBX_MANAGER_RENDERED=${SBX_MANAGER_RENDERED:-}      # rendered compose of the Sandbox Manager pair with the NEW host paths (like manager-candidate.rendered.json for Paper)
SBX_MANAGER_RENDERED_SHA=${SBX_MANAGER_RENDERED_SHA:-}
SBX_EDGE_FILES=${SBX_EDGE_FILES:-}                  # the 7 compose files of project portal-execution-edge-sandbox, comma separated (labels of the container), plus the override below
SBX_EDGE_OVERRIDE=${SBX_EDGE_OVERRIDE:-}            # override: image NEW_E + EDGE_MANAGER_CATALOGUE_RELEASE_FILE/_SHA256 + bind of the release file
SBX_EDGE_OVERRIDE_SHA=${SBX_EDGE_OVERRIDE_SHA:-}
# Approved artifact hashes of this package (sha256 of file bytes; real catalogue tool e035cfee):
CAT_SHA=cb1d41cacc7beca0431a38be94a1130432cc5425e93e739792716d56b72bd154
POL_SHA=4f3cd95a9d8b783166413aa1c633a537dfb5280154a9d4dd1a9e2eac5adb6d59
PRO_SHA=979191a8da756b33bb0deaf23ba5ac7562146fb4ae7b1bc46cbda1cb81c2a8b7
REL_SHA=af20d83d1b07a35e514dc67d03563896135dea65d71f8b9bbb624ead24f1fa84

h() { sha256sum "$1" | cut -c1-64; }
need() { [ "$(h "$1")" = "$2" ] || { echo "STOP: hash of $1 differs from approved $2"; exit 2; }; }
filled() { [ -n "$SBX_MANAGER_RENDERED" ] && [ -n "$SBX_MANAGER_RENDERED_SHA" ] && [ -n "$SBX_EDGE_FILES" ] && [ -n "$SBX_EDGE_OVERRIDE" ] && [ -n "$SBX_EDGE_OVERRIDE_SHA" ] || { echo "STOP: DRAFT. The rendered compose files, the Edge override and their hashes are owner decisions not yet taken (plan section 6)."; exit 64; }; }
state() { for c in $MC $EC $WC; do echo "$c image=$(docker inspect $c --format '{{.Image}}') status=$(docker inspect $c --format '{{.State.Status}}') started=$(docker inspect $c --format '{{.State.StartedAt}}') restarts=$(docker inspect $c --format '{{.RestartCount}}') health=$(docker inspect $c --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')"; done; }
mdc() { docker compose -p trading-system-manager-read-sandbox -f "$SBX_MANAGER_RENDERED" "$@"; }
edc() { local f; local args=(); IFS=',' read -ra f <<<"$SBX_EDGE_FILES"; for x in "${f[@]}"; do args+=(-f "$x"); done; docker compose -p portal-execution-edge-sandbox "${args[@]}" "$@"; }
wait_healthy() { s=""; for i in 1 2 3 4 5 6; do sleep 10; s=$(docker inspect $EC --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'); echo "health=$s"; [ "$s" = healthy ] && break; done; }

case "${1:-}" in
status) state; docker inspect $WC --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^EDGE_MANAGER_PROJECTION_(OWNER_DIGEST|REBUILD_AUTHORIZED|ENABLED)' | sed -E 's/(sha256:[0-9a-f]{12})[0-9a-f]+/\1.../' ;;
baseline) # read-only: record what runs today (image ids, compose file labels, env NAMES, mount destinations) into a new file; never prints values of secret names
  mkdir -p "$D" 2>/dev/null || true; out="$D/baseline-$(date -u +%Y%m%dT%H%M%SZ).txt"; [ ! -e "$out" ] || { echo STOP exists; exit 3; }
  { state; for c in $MC $EC $WC; do echo "== $c"; docker inspect $c --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'; docker inspect $c --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sort; docker inspect $c --format '{{range .Mounts}}{{.Destination}} rw={{.RW}}{{println}}{{end}}' | sort; done; } > "$out"; echo "baseline written: $out" ;;
stage)  # new directories only; the DB steps (SQL file) and the pg_hba line are separate owner steps that must be done and verified BEFORE this
  need $SRC/artifacts/binance-t1t2five67/relation-catalogue.json $CAT_SHA; need $SRC/artifacts/binance-t1t2five67/serving-policy.json $POL_SHA
  need $SRC/artifacts/binance-t1t2five67/profile-selection.json $PRO_SHA; need $SRC/artifacts/binance-t1t2five67/manager-catalogue-release.json $REL_SHA
  [ ! -e "$D/manager-catalogue-release.json" ] && [ ! -e "$SEC" ] || { echo "STOP: staging target exists (stage never overwrites)"; exit 3; }
  install -d -m 0755 "$D"; install -d -m 0700 "$SEC"
  install -m 0644 $SRC/artifacts/binance-t1t2five67/manager-catalogue-release.json "$D/manager-catalogue-release.json"
  install -m 0644 $SRC/artifacts/binance-t1t2five67/profile-selection.json "$D/profile-selection.json"
  install -m 0600 $SRC/artifacts/binance-t1t2five67/relation-catalogue.json "$SEC/relation-catalogue.json"
  install -m 0600 $SRC/artifacts/binance-t1t2five67/serving-policy.json "$SEC/serving-policy.json"
  echo "staged. The owner operator still places, in $SEC (0600): the NEW DSN file (new login, database trading_system_sandbox), the runtime env file (profile names, DSN file name, S1 source id), a NEW cursor key."; ls -l "$D" "$SEC" ;;
worker-stop)   # the N24 projection worker pins EDGE_MANAGER_PROJECTION_OWNER_DIGEST of the OLD catalogue: stop it before the Manager switch (decision D9); data in its store is kept
  [ "$(docker inspect $WC --format '{{.Image}}')" = $OLD_E ] || { echo "STOP: worker image changed"; exit 3; }
  echo "worker stop $(date -u +%FT%TZ)"; docker stop $WC >/dev/null; state ;;
manager) filled; need "$SBX_MANAGER_RENDERED" "$SBX_MANAGER_RENDERED_SHA"
  [ "$(docker inspect $MC --format '{{.Image}}')" = $OLD_M ] || { echo "STOP: Manager is not on the recorded old image"; exit 3; }
  need $SEC/relation-catalogue.json $CAT_SHA; need $SEC/serving-policy.json $POL_SHA
  echo "manager recreate start $(date -u +%FT%TZ)"; mdc up -d --no-deps --pull never --force-recreate portal_manager_read 2>&1 | tail -n 5
  sleep 6; state; [ "$(docker inspect $MC --format '{{.State.Status}}')" = running ] || { echo "STOP: Manager not running"; exit 4; }
  echo "manager recreate done $(date -u +%FT%TZ)  -> now: $0 edge  (the Edge refuses the new catalogue until its release pin changes)" ;;
edge) filled; need "$SBX_EDGE_OVERRIDE" "$SBX_EDGE_OVERRIDE_SHA"; need "$D/manager-catalogue-release.json" $REL_SHA
  [ "$(docker inspect $EC --format '{{.Image}}')" = $OLD_E ] || { echo "STOP: Edge is not on the recorded old image"; exit 3; }
  echo "edge recreate start $(date -u +%FT%TZ)"; edc -f "$SBX_EDGE_OVERRIDE" up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5
  wait_healthy; state; [ "$(docker inspect $EC --format '{{.Image}}')" = $NEW_E ] && [ "$s" = healthy ] || { echo "STOP: Edge not healthy on the new image: run rollback-edge and rollback-manager"; exit 4; }
  echo "edge recreate done $(date -u +%FT%TZ)" ;;
verify) state; echo "Edge log CATALOGUE_DRIFT lines (120 s): $(docker logs --since 120s $EC 2>&1 | grep -c CATALOGUE_DRIFT || true) (expected 0)"; echo "Edge restarts: $(docker inspect $EC --format '{{.RestartCount}}')" ;;
rollback-edge) filled   # recreate WITHOUT the override: old compose files => old image d6aa7a51 and the old (canonical) catalogue handling
  edc up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5; wait_healthy; state ;;
rollback-manager) echo "STOP: the previous Manager compose (project file, host paths of the old DSN/catalogue/policy) is recorded by 'baseline'; recreate from it by hand with the owner. The previous rendered file is not in this script because the Sandbox Manager compose source worktree no longer exists."; exit 64 ;;
worker-start) docker start $WC >/dev/null; state ;;
*) echo "usage: sandbox_switch_step.sh status|baseline|stage|worker-stop|manager|edge|verify|rollback-edge|rollback-manager|worker-start"; exit 64 ;;
esac
