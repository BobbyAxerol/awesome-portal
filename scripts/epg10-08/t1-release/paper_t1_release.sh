#!/bin/bash
# DRAFT, NOT EXECUTED. PAPER T1 + T2-five release helper (67 relations): status | stage | manager | edge | verify | rollback-edge | rollback-manager.
# One step per call, stops at the first error. Pinned hashes below are the ones the owner approves; edit nothing without re-approval.
# Boundary: touches ONLY service portal_manager_read of project portal-manager-read-paper-v2 and ONLY service execution-edge of project portal-execution-edge
# (--no-deps, --pull never, same image digests as today). Never edits or deletes an existing file; rollback = recreate WITHOUT the T1 override files,
# i.e. back to the T2-five state that runs today (NOT to the pre-T2 state).
# Order: stage -> manager -> edge (right after manager: Edge refuses a catalogue whose digest it does not pin, in both directions).
set -euo pipefail

# --- inputs that exist today (all hashes read on 2026-11-16) -------------------------------------------------------------------------------
R=/home/bobby/.local/state/portal-execution-edge/releases
MF=$R/m0-r2-20261112/preinstall-20261112T0810Z/manager-candidate.rendered.json
EF=$R/m0-r2-20261112/preinstall-20261112T0810Z/edge-candidate.r3.rendered.json
D2=$R/t2-paper-20261116            # live T2-five overrides + release file
RS=$R/running-source-20261116      # live Edge image override (167e031a, memo TTL 0, no guard pin)
MC=portal-manager-read-paper-v2-portal_manager_read-1; EC=portal-execution-edge-execution-edge-1
MIMG=sha256:b0d2e90bb1e53ffbc1cdd58f122be7cbd490cda5070afa456f245666f8b4428b     # Manager image (W2): unchanged by this release
EIMG=sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054     # Edge image (from-running-source 3055572e, census v2): unchanged by this release

# --- the T1 package -------------------------------------------------------------------------------------------------------------------------
# SRC = the committed package directory (branch feat/edge-from-running-source-20261116, scripts/epg10-08/t1-release); override with T1_SRC if the checkout moved.
SRC=${T1_SRC:-/home/bobby/.worktrees/edge-from-running-source-20261116/scripts/epg10-08/t1-release}
D1=$R/t1-paper-20261116                                   # durable staging dir (non-secret files: Edge release file, overrides)
SEC1=/home/bobby/secure/portal-manager-t1-20261116        # private dir for the two Manager files

h() { sha256sum "$1" | cut -c1-64; }
need() { [ "$(h "$1")" = "$2" ] || { echo "STOP: hash of $1 differs from approved $2"; exit 2; }; }

gate_live() {   # inputs that must be exactly what runs today
  need $MF cf826a6e50b1e4f08139d4cc9727acf2d03a614da2ed7daa7ba9e6638a187462
  need $EF 8600b9f4670c92e5c009f8aabed3c429faee2bfc6a759822fb284e0cb28b3cda
  need $D2/override-w2-image.yaml c24fcc1e5192a1d5c48a4cbce337a181d44126bf693007604c70c5ecb9a41c4e
  need $D2/override-t2-catalogue.yaml acaf38a49209ef39a7b2e31233c5be949566ccbd4695e88c347a6e893b870b9d
  need $D2/override-t2-edge-release.yaml 100aa0b5e5a093455f239996c5566ee9c1ba9c3edae9fd432aa7e80e7d212843
  need $D2/manager-catalogue-release.json 5508c5d03313696c4e07d057bc26bd082407715039b54d12d08b92a07f21da6e
  need $RS/override-edge-running-source-memo-off.yaml 4f0ab39c29ae443646479b0657c510908d64041aa9b8d2d905b56a3ca50f2574
}
gate_src() {    # the package as committed
  need $SRC/artifacts/relation-catalogue.json 0e34dc5214ecefaaa5416f4cd33710f1730eb1dbf8a420bdf5b0c6a4691d3c2e
  need $SRC/artifacts/serving-policy.json 272e32f1b352a7a1edfa4e6a3c64ec8ff184cdfb2907c495fd5e531292495509
  need $SRC/artifacts/profile-selection.json fd8d62529fcf1a75e9137e3499216c9c95b08935ac6f20bb2aa731253675a8cc
  need $SRC/artifacts/manager-catalogue-release.json 57d52f66d06f098769da43114fcd036045524c1482559ccb4c86089bfba5e5cc
  need $SRC/override-t1-catalogue.yaml 91db479f39392592765b8b269e28a1a46a7002f9d0bc3226d77929912dcf045a
  need $SRC/override-t1-edge-release.yaml cc9733425c4a8c04ef989db64b330a76d6f0ce2ce30b1b7615dce7150f697e5a
}
gate_staged() { # the files the compose stacks will actually read
  gate_live
  need $SEC1/relation-catalogue.json 0e34dc5214ecefaaa5416f4cd33710f1730eb1dbf8a420bdf5b0c6a4691d3c2e
  need $SEC1/serving-policy.json 272e32f1b352a7a1edfa4e6a3c64ec8ff184cdfb2907c495fd5e531292495509
  need $D1/manager-catalogue-release.json 57d52f66d06f098769da43114fcd036045524c1482559ccb4c86089bfba5e5cc
  need $D1/profile-selection.json fd8d62529fcf1a75e9137e3499216c9c95b08935ac6f20bb2aa731253675a8cc
  need $D1/override-t1-catalogue.yaml 91db479f39392592765b8b269e28a1a46a7002f9d0bc3226d77929912dcf045a
  need $D1/override-t1-edge-release.yaml cc9733425c4a8c04ef989db64b330a76d6f0ce2ce30b1b7615dce7150f697e5a
}
state() { for c in $MC $EC; do echo "$c image=$(docker inspect $c --format '{{.Image}}') status=$(docker inspect $c --format '{{.State.Status}}') started=$(docker inspect $c --format '{{.State.StartedAt}}') health=$(docker inspect $c --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}') restarts=$(docker inspect $c --format '{{.RestartCount}}')"; done; }
mounts() { docker inspect $1 --format '{{range .Mounts}}{{if or (eq .Destination "/run/secrets/relation-catalogue.json") (eq .Destination "/run/secrets/serving-policy.json") (eq .Destination "/run/manager-release/catalogue.json")}}{{.Destination}} <= {{.Source}}{{println}}{{end}}{{end}}'; }

# Manager stack today = rendered file + W2 image override + T2 catalogue override; T1 adds one more file after them.
mdc_t2() { docker compose -p portal-manager-read-paper-v2 --profile portal-manager-read-v2 -f $MF -f $D2/override-w2-image.yaml -f $D2/override-t2-catalogue.yaml "$@"; }
# Edge stack today = rendered file + T2 release override + running-source override; T1 inserts its release override between them.
edc_t2() { docker compose -p portal-execution-edge -f $EF -f $D2/override-t2-edge-release.yaml "$@"; }

case "${1:-}" in
status) state; mounts $MC; mounts $EC; ls -l $D1 $SEC1 2>&1 | head -20 ;;
stage)  # no service touched; creates two new directories, never overwrites
  gate_live; gate_src
  [ ! -e $D1 ] && [ ! -e $SEC1 ] || { echo "STOP: $D1 or $SEC1 already exists (stage never overwrites)"; exit 3; }
  install -d -m 0755 $D1; install -d -m 0700 $SEC1
  install -m 0600 $SRC/artifacts/relation-catalogue.json $SEC1/relation-catalogue.json
  install -m 0600 $SRC/artifacts/serving-policy.json     $SEC1/serving-policy.json
  install -m 0644 $SRC/artifacts/manager-catalogue-release.json $D1/manager-catalogue-release.json
  install -m 0644 $SRC/artifacts/profile-selection.json         $D1/profile-selection.json
  install -m 0644 $SRC/override-t1-catalogue.yaml     $D1/override-t1-catalogue.yaml
  install -m 0644 $SRC/override-t1-edge-release.yaml  $D1/override-t1-edge-release.yaml
  gate_staged; ls -l $D1 $SEC1; echo "stage done $(date -u +%FT%TZ)" ;;
manager)
  gate_staged
  [ "$(docker inspect $MC --format '{{.Image}}')" = $MIMG ] || { echo "STOP: Manager image changed"; exit 3; }
  [ "$(docker inspect $EC --format '{{.Image}}')" = $EIMG ] || { echo "STOP: Edge image changed"; exit 3; }
  echo "manager recreate start $(date -u +%FT%TZ)"
  mdc_t2 -f $D1/override-t1-catalogue.yaml up -d --no-deps --pull never --force-recreate portal_manager_read 2>&1 | tail -n 5
  sleep 6; state
  [ "$(docker inspect $MC --format '{{.Image}}')" = $MIMG ] && [ "$(docker inspect $MC --format '{{.State.Status}}')" = running ] || { echo "STOP: Manager not running on the same image"; exit 4; }
  mounts $MC
  echo "manager recreate done $(date -u +%FT%TZ)  -> run: $0 edge   (Edge refuses the new catalogue until its release pin changes)" ;;
edge)
  gate_staged
  [ "$(docker inspect $EC --format '{{.Image}}')" = $EIMG ] || { echo "STOP: Edge image changed"; exit 3; }
  mounts $MC | grep -q "portal-manager-t1-20261116" || { echo "STOP: Manager is not on the T1 files yet (run: $0 manager first)"; exit 5; }
  echo "edge recreate start $(date -u +%FT%TZ)"
  edc_t2 -f $D1/override-t1-edge-release.yaml -f $RS/override-edge-running-source-memo-off.yaml up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5
  s=""; for i in 1 2 3 4 5 6; do sleep 10; s=$(docker inspect $EC --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'); echo "health=$s"; [ "$s" = healthy ] && break; done
  state; mounts $EC
  [ "$(docker inspect $EC --format '{{.Image}}')" = $EIMG ] && [ "$s" = healthy ] || { echo "STOP: Edge not healthy on the same image"; exit 4; }
  echo "edge recreate done $(date -u +%FT%TZ)" ;;
verify) # read-only; the Core/JWT end-to-end reads are not here (the Edge needs Core's delegated token)
  state; mounts $MC; mounts $EC
  echo "Edge log CATALOGUE_DRIFT lines (60 s): $(docker logs --since 60s $EC 2>&1 | grep -c CATALOGUE_DRIFT || true)"
  echo "Edge log source-identity mismatch lines (60 s, expected 0, guard is off): $(docker logs --since 60s $EC 2>&1 | grep -c SOURCE_DB_IDENTITY_MISMATCH || true)"
  echo "Manager log error lines (60 s): $(docker logs --since 60s $MC 2>&1 | grep -ci error || true)"
  echo "Edge release file sha256 inside the container path (host source): $(sha256sum "$(docker inspect $EC --format '{{range .Mounts}}{{if eq .Destination "/run/manager-release/catalogue.json"}}{{.Source}}{{end}}{{end}}')" | cut -c1-64)" ;;
rollback-edge)  # back to today's T2-five Edge state: T2 release file and pin, image 167e031a, memo TTL 0
  gate_live
  echo "edge rollback start $(date -u +%FT%TZ)"
  edc_t2 -f $RS/override-edge-running-source-memo-off.yaml up -d --no-deps --pull never --force-recreate execution-edge 2>&1 | tail -n 5
  s=""; for i in 1 2 3 4 5 6; do sleep 10; s=$(docker inspect $EC --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}'); [ "$s" = healthy ] && break; done
  state; mounts $EC; echo "edge rollback done $(date -u +%FT%TZ) health=$s" ;;
rollback-manager)  # back to today's T2-five Manager state: T2 catalogue + policy files, image b0d2e90b
  gate_live
  echo "manager rollback start $(date -u +%FT%TZ)"
  mdc_t2 up -d --no-deps --pull never --force-recreate portal_manager_read 2>&1 | tail -n 5
  sleep 6; state; mounts $MC; echo "manager rollback done $(date -u +%FT%TZ)" ;;
*) echo "usage: paper_t1_release.sh status|stage|manager|edge|verify|rollback-edge|rollback-manager"; exit 64 ;;
esac
