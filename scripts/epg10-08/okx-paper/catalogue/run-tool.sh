#!/bin/sh
# real catalogue tool in ONE capped network-less container per call (flock docker.lock); stdin JSON in, stdout JSON out. usage: run-tool.sh <host dir> <binary name>
[ ! -e /home/bobby/.local/state/host-measurement-window.lock ] || { echo LOCKED >&2; exit 9; }
exec flock /home/bobby/.local/state/docker.lock docker run --rm -i --pull=never --network none --cpus 2 --memory 6g --user 1001:1001 \
  -v "$1":/t:ro --entrypoint "/t/$2" 8d4765a44514
