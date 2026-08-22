#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MASTER="${ROOT_DIR}/upgrade/EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md"
TRACKER="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/PHASE_TRACKER.md"
ROADMAP="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/ROADMAP_FRONTEND.md"
LEDGER="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/EXECUTION_REQUEST_LEDGER.md"
BACKEND_README="${ROOT_DIR}/upgrade/backend/README.md"
CATALOG="${ROOT_DIR}/packages/contracts/fixtures/execution-command-catalog.valid.json"

python3 - "${MASTER}" "${TRACKER}" "${ROADMAP}" "${LEDGER}" "${BACKEND_README}" "${CATALOG}" <<'PY'
from pathlib import Path
import json
import re
import sys

master, tracker, roadmap, ledger, backend, catalog_path = [Path(p) for p in sys.argv[1:]]
for path in (master, tracker, roadmap, ledger, backend, catalog_path):
    if not path.is_file():
        raise SystemExit(f"tracking file missing: {path}")

m = master.read_text()
t = tracker.read_text()
r = roadmap.read_text()
l = ledger.read_text()
b = backend.read_text()
c = json.loads(catalog_path.read_text())

qualified = "`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`"
for phase in (3, 14, 15, 16, 17):
    row = next((line for line in t.splitlines() if line.startswith(f"| {phase} |")), None)
    if row is None or qualified not in row:
        raise SystemExit(f"tracker phase {phase} does not carry qualified inactive status")

for phase in range(1, 7):
    token = f"| PRE-IAM-0{phase} |"
    expected = qualified
    for label, text in (("master", m), ("tracker", t)):
        row = next((line for line in text.splitlines() if line.startswith(token)), None)
        if row is None or expected not in row:
            raise SystemExit(f"{label} {token.strip()} is absent or not reconciled")

if "H-1…H-12 — **đã đóng**" not in r:
    raise SystemExit("frontend roadmap still lacks the H-series retirement marker")
if "Trading System contract owner" not in r or not re.search(r"Portal\s+compatibility adapter", r):
    raise SystemExit("frontend roadmap does not preserve Trading System route ownership")

for action in (
    "ops/command-journal", "ops/findings", "ops/alerts", "ops/dead-letters",
    "ops/trace-order", "ops/streams", "ops/alpha-activity", "ops/redis-retention",
):
    row = next((line for line in l.splitlines() if f"`{action}`" in line), None)
    if row is None or "EXTERNAL_CONTRACT_PENDING" not in row:
        raise SystemExit(f"request ledger lost unreachable Trading System action {action}")

if "Generic `redis/get` and `redis/scan` are explicitly **REJECTED" not in l:
    raise SystemExit("request ledger does not reject generic Redis access")
if "EX-BE-05b/F0" not in b or "PRE-IAM-06" not in b:
    raise SystemExit("backend README does not expose the reconciled next sequence")

phase6 = next((line for line in t.splitlines() if line.startswith("| 6 |")), None)
if phase6 is None or "`FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`" not in phase6:
    raise SystemExit("tracker phase 6 lost the qualified F0 foundation status")
for request in ("BR-EX-28 canonical command catalogue", "BR-EX-29 typed `conditions[]`"):
    row = next((line for line in l.splitlines() if request in line), None)
    if row is None or "`FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`" not in row:
        raise SystemExit(f"request ledger lost the accepted F0 status: {request}")

entries = c.get("entries", [])
if len(entries) != 64 or len({entry.get("key") for entry in entries}) != 64:
    raise SystemExit("canonical execution catalogue must contain 64 unique entries")
if any(entry.get("portal_reachable") is not False for entry in entries):
    raise SystemExit("an F0 catalogue entry became Portal-reachable")
by_key = {entry["key"]: entry for entry in entries}
for action in (
    "ops/command-journal", "ops/findings", "ops/alerts", "ops/dead-letters",
    "ops/trace-order", "ops/streams", "ops/alpha-activity", "ops/redis-retention",
):
    if by_key.get(action, {}).get("source_route_state") != "UNPUBLISHED":
        raise SystemExit(f"unpublished Trading System route changed state: {action}")
for action in ("redis/get", "redis/scan"):
    if by_key.get(action, {}).get("blocked_reason") != "GENERIC_REDIS_ACCESS_PROHIBITED":
        raise SystemExit(f"generic Redis capability became exposable: {action}")

# Status cells may use qualified compounds, but a literal standalone COMPLETE
# status would erase scope/activation meaning.
for label, text in (("master", m), ("tracker", t), ("ledger", l)):
    if re.search(r"(?i)(?:status[^\n]{0,30}|\|\s*)`COMPLETE`(?:\s*\||\s*$)", text, re.M):
        raise SystemExit(f"{label} contains a bare COMPLETE status")

print("Execution tracking reconciliation passed.")
PY
