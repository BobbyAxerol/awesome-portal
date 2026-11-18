#!/bin/bash
# Shell-level tests of sandbox_switch_step.sh memo-on/memo-off/pin-stage/pin-on/pin-off/verify WITHOUT touching docker: a fake `docker` and a fake `sleep` come first on PATH,
# the render check is a stub, the pin staging dir is a temp dir (SBX_PD). Reads the real approved files under the staging dir (hash gates are the real ones); skips if absent.
# Run: bash scripts/epg10-08/sandbox-switch/tests/test_step_shim.sh      (exit 0 = all assertions held)
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); SRC=$(dirname "$HERE"); SCRIPT=$SRC/sandbox_switch_step.sh
RD=/home/bobby/.local/state/portal-execution-edge/releases/sandbox-switch-20261116/render-final
[ -d "$RD" ] || { echo "SKIP: $RD not present (the approved renders are host files)"; exit 0; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
MC=trading-system-manager-read-sandbox-portal_manager_read-1; EC=portal-execution-edge-sandbox-execution-edge-1; WC=portal-execution-edge-sandbox-manager-projection-worker-1
NEW_M=sha256:8d4765a4451431ec6a5e146a24745d3bc791b411e1b0093bbf8cee8edc1044dd; NEW_E=sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054
OLD_E=sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e; OLD_M=sha256:0bd48db3ca54ce2b236caaf55f01a1c02bb6050d4cbb2a48c2d54f291aa873b7
REL=sha256:14778175eb6720c8b56ae0dd245023e2aff2e1afb161edb0ef6f32872699a1a5
fails=0
ok() { echo "ok   $*"; }
bad() { echo "FAIL $*"; fails=$((fails+1)); }
fresh() {   # live state of 2026-11-18: Manager and Edge on the new images, release pin, memo off, guard off
  export SHIM_STATE=$T/state; rm -rf "$SHIM_STATE"; mkdir -p "$SHIM_STATE"; : > "$SHIM_STATE/calls.log"
  echo $NEW_M > $SHIM_STATE/img.$MC; echo running > $SHIM_STATE/status.$MC; echo 0 > $SHIM_STATE/restarts.$MC; : > $SHIM_STATE/health.$MC
  echo $NEW_E > $SHIM_STATE/img.$EC; echo running > $SHIM_STATE/status.$EC; echo 0 > $SHIM_STATE/restarts.$EC; echo healthy > $SHIM_STATE/health.$EC
  echo $OLD_E > $SHIM_STATE/img.$WC; echo exited > $SHIM_STATE/status.$WC; echo 0 > $SHIM_STATE/restarts.$WC; : > $SHIM_STATE/health.$WC
  : > $SHIM_STATE/env.$MC; printf 'EDGE_ENVIRONMENT=sandbox\nEDGE_MANAGER_CATALOGUE_RELEASE_SHA256=%s\nEDGE_MANAGER_CATALOGUE_CACHE_TTL_MS=0\n' "$REL" > $SHIM_STATE/env.$EC
  : > $SHIM_STATE/env.$WC
  export SBX_PD=$T/pd RENDER_RC=0; rm -rf "$SBX_PD"
}
step() { PATH=$HERE/shim:$PATH SBX_RENDER=$HERE/shim/render_stub.sh SBX_SRC=$SRC bash $SCRIPT "$@" > $T/out.txt 2>&1; echo $? > $T/rc.txt; rc=$(cat $T/rc.txt); }
composes() { grep '^COMPOSE' $SHIM_STATE/calls.log; }
last_files() { composes | tail -1 | sed -E 's/.* files=([^ ]*( [^ ]*)*) args=.*/\1/'; }
expect_rc() { [ "$rc" = "$1" ] && ok "$2 (rc $rc)" || { bad "$2: rc $rc, wanted $1"; sed -n '1,8p' $T/out.txt; }; }
expect_files() { [ "$(last_files)" = "$1" ] && ok "compose files: $1" || bad "compose files '$(last_files)', wanted '$1'"; }
expect_no_compose() { [ -z "$(composes)" ] && ok "$1: no compose call" || bad "$1: compose was called: $(composes)"; }
env_of() { sed -n "s/^$1=//p" $SHIM_STATE/env.$EC; }
Z=edge-sandbox.rendered.json; M=override-edge-memo-on.yaml; P=override-sandbox-guard-pin-on.yaml

# --- 0. the script still parses and the usage line lists the new modes
bash -n $SCRIPT && ok "bash -n"; grep -q 'pin-on|pin-off' $SCRIPT && ok "usage lists pin-on/pin-off"

# --- 1. pin-stage: creates the dir once, never overwrites
fresh; step pin-stage; expect_rc 0 "pin-stage"; [ -f $SBX_PD/pin.sandbox.json ] && [ -f $SBX_PD/$P ] && ok "pin-stage wrote both files"; expect_no_compose "pin-stage"
step pin-stage; expect_rc 3 "second pin-stage refuses to overwrite"

# --- 2. pin-on from the live state (memo off): stack = render + pin override, nothing else
step pin-on; expect_rc 0 "pin-on"; expect_files "$Z $P"; [ "$(env_of EDGE_MANAGER_SOURCE_DB_PIN_FILE)" = /run/manager-source-pin/pin.json ] && ok "guard on after pin-on"
grep -q 'RENDER check --out .* --only edge --live' $SHIM_STATE/calls.log && ok "gate ran the scoped live check (--only edge --live)" || bad "gate did not run the scoped live check"
step pin-on; expect_rc 3 "second pin-on refuses"
# --- 3. memo-on with the guard on keeps the guard; pin-off with memo on keeps the memo; memo-off; each one recreate
step memo-on; expect_rc 0 "memo-on (guard on)"; expect_files "$Z $M $P"; [ "$(env_of EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS)" = 30000 ] && ok "memo on"
step memo-on; expect_rc 3 "memo-on twice refuses"
step pin-off; expect_rc 0 "pin-off (memo on)"; expect_files "$Z $M"; [ -z "$(env_of EDGE_MANAGER_SOURCE_DB_PIN_FILE)" ] && [ "$(env_of EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS)" = 30000 ] && ok "guard off, memo still on"
step pin-off; expect_rc 3 "pin-off twice refuses"
step memo-off; expect_rc 0 "memo-off"; expect_files "$Z"; [ "$(env_of EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS)" = 0 ] && ok "memo off"
step verify; expect_rc 0 "verify"; grep -q 'Edge overlay state: memo=off guard=off' $T/out.txt && ok "verify reports the overlay state"
# every recreate so far was the Edge only, in the Sandbox Edge project, and no mutating subcommand other than compose up ever reached the shim
if grep -E '^COMPOSE' $SHIM_STATE/calls.log | grep -v 'project=portal-execution-edge-sandbox ' | grep -q .; then bad "a compose call left the Sandbox Edge project"; else ok "all compose calls are in project portal-execution-edge-sandbox"; fi
if composes | grep -v 'args=-d --no-deps --pull never --force-recreate execution-edge$' | grep -q .; then bad "a compose call was not the single-service no-deps recreate"; else ok "all compose calls are 'up -d --no-deps --pull never --force-recreate execution-edge'"; fi
if grep -E '^docker (stop|start|restart|rm|kill|run|exec|pull|rmi|cp)' $SHIM_STATE/calls.log | grep -q .; then bad "a mutating docker subcommand was issued"; else ok "no stop/start/restart/rm/kill/run/exec/pull"; fi

# --- 4. a pin the Edge refuses at start rolls itself back to guard off and exits 4
fresh; step pin-stage; : > $SHIM_STATE/fail_pin_up; step pin-on; expect_rc 4 "pin-on with a refused pin"
[ "$(composes | wc -l)" = 2 ] && ok "two recreates (pin-on, automatic rollback)"; expect_files "$Z"; [ -z "$(env_of EDGE_MANAGER_SOURCE_DB_PIN_FILE)" ] && ok "rolled back to guard off"
# --- 5. gates refuse before any compose call
fresh; step pin-stage; echo $OLD_E > $SHIM_STATE/img.$EC; step pin-on; expect_rc 3 "pin-on with the Edge on the old image"; expect_no_compose "old Edge"
fresh; step pin-stage; echo $OLD_M > $SHIM_STATE/img.$MC; step pin-on; expect_rc 3 "pin-on with the Manager on the old image"; expect_no_compose "old Manager"
fresh; step pin-stage; sed -i 's/RELEASE_SHA256=.*/RELEASE_SHA256=sha256:0000/' $SHIM_STATE/env.$EC; step pin-on; expect_rc 3 "pin-on with another release pin"; expect_no_compose "wrong release"
fresh; step pin-stage; RENDER_RC=1 step pin-on; [ "$rc" != 0 ] && ok "pin-on stops when the live render check fails (rc $rc)"; expect_no_compose "drift"
fresh; step pin-on; expect_rc 2 "pin-on without the staged pin (hash gate)"; expect_no_compose "unstaged"
fresh; step pin-off; expect_rc 3 "pin-off with the guard already off"; expect_no_compose "pin-off guard off"
fresh; step memo-off; expect_rc 3 "memo-off with the memo already off"; expect_no_compose "memo-off"
# --- 6. the staged pin file differing from the approved hash is refused
fresh; step pin-stage; echo "{}" > $SBX_PD/pin.sandbox.json; step pin-on; expect_rc 2 "pin-on with a changed pin file"; expect_no_compose "changed pin"

echo; [ $fails = 0 ] && echo "ALL OK" || { echo "$fails FAILED"; exit 1; }
