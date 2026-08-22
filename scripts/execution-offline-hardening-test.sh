#!/usr/bin/env bash
# PRE-IAM-04 credential-free hardening gate. It never contacts AWS-HK, opens a
# source connection, mutates Trading System state, or enables a delivery flag.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/scripts/contracts-test.sh"
"${ROOT_DIR}/scripts/control-api-test.sh"
"${ROOT_DIR}/scripts/execution-edge-test.sh"

printf 'PRE-IAM-04 offline security, contract, bounded-load, replay, restore and rollback gates passed.\n'
