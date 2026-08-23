#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MASTER="${ROOT_DIR}/upgrade/EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md"
TRACKER="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/PHASE_TRACKER.md"
ROADMAP="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/ROADMAP_FRONTEND.md"
LEDGER="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/EXECUTION_REQUEST_LEDGER.md"
BACKEND_README="${ROOT_DIR}/upgrade/backend/README.md"
ARCHITECTURE="${ROOT_DIR}/upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md"
FRONTEND_HANDOFF="${ROOT_DIR}/apps/portal/registry/FRONTEND_HANDOFF.md"
CATALOG="${ROOT_DIR}/packages/contracts/fixtures/execution-command-catalog.valid.json"

python3 - "${MASTER}" "${TRACKER}" "${ROADMAP}" "${LEDGER}" "${BACKEND_README}" "${ARCHITECTURE}" "${FRONTEND_HANDOFF}" "${CATALOG}" <<'PY'
from pathlib import Path
import json
import re
import sys

master, tracker, roadmap, ledger, backend, architecture, handoff, catalog_path = [Path(p) for p in sys.argv[1:]]
for path in (master, tracker, roadmap, ledger, backend, architecture, handoff, catalog_path):
    if not path.is_file():
        raise SystemExit(f"tracking file missing: {path}")

m = master.read_text()
t = tracker.read_text()
r = roadmap.read_text()
l = ledger.read_text()
b = backend.read_text()
a = architecture.read_text()
h = handoff.read_text()
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
for label, text in (("architecture guide", a), ("frontend handoff", h)):
    for token in ("PRE-IAM-04", "PRE-IAM-05", "PRE-IAM-06", "EX-BE-05b/F0"):
        if token not in text:
            raise SystemExit(f"{label} lost reconciled phase {token}")
if "catalogue revision 2" not in a or "HASH_ONLY_NO_RAW" not in a:
    raise SystemExit("architecture guide lost F0 hardening policy")
if "catalogue revision 2" not in h or "owner_review_required" not in h:
    raise SystemExit("frontend handoff lost F0 revision-2 consumer rules")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
):
    if "D3_OFFLINE_PREPARATION_COMPLETE" not in text or "LIVE_D3_UNAUTHORIZED" not in text:
        raise SystemExit(f"{label} lost the qualified D3 offline/live boundary")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
):
    if "IAM_VERIFIED / D1_REVALIDATED / APPLICATION_DARK" not in text:
        raise SystemExit(f"{label} lost the IAM/D1 revalidation boundary")

phase6 = next((line for line in t.splitlines() if line.startswith("| 6 |")), None)
if phase6 is None or "`FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`" not in phase6:
    raise SystemExit("tracker phase 6 lost the qualified F0 foundation status")
for request in ("BR-EX-28 canonical command catalogue", "BR-EX-29 typed `conditions[]`"):
    row = next((line for line in l.splitlines() if request in line), None)
    if row is None or "`FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`" not in row:
        raise SystemExit(f"request ledger lost the accepted F0 status: {request}")

entries = c.get("entries", [])
if c.get("catalogue_revision") != 2:
    raise SystemExit("canonical execution catalogue must remain at hardened revision 2")
if len(entries) != 64 or len({entry.get("key") for entry in entries}) != 64:
    raise SystemExit("canonical execution catalogue must contain 64 unique entries")
if c.get("total_entries") != 64 or c.get("returned_entries") != len(entries):
    raise SystemExit("canonical execution catalogue counts drifted")
scope = c.get("scope") or {}
for field in ("workspace_id", "actor_user_id", "actor_role", "environment", "capability_state", "freshness_state", "policy_revision"):
    if not scope.get(field):
        raise SystemExit(f"canonical execution catalogue scope lost {field}")
if any(entry.get("portal_reachable") is not False for entry in entries):
    raise SystemExit("an F0 catalogue entry became Portal-reachable")
for entry in entries:
    is_observed_mutation = (
        entry.get("source_route_state") == "OBSERVED"
        and entry.get("http_method") != "GET"
    )
    if is_observed_mutation and (
        entry.get("risk_tier") == "R0_READ"
        or entry.get("owner_review_required") is not True
    ):
        raise SystemExit(f"observed mutation lost conservative risk/review: {entry.get('key')}")
    if entry.get("risk_tier") in {
        "R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE", "R4_LIVE_RISK_INCREASING",
    } and (
        entry.get("owner_review_required") is not True
        or entry.get("plan_required") is not True
        or entry.get("apply_required") is not True
    ):
        raise SystemExit(f"risk-bearing command lost review/plan/apply gate: {entry.get('key')}")
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
