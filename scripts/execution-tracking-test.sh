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
ADMISSION_HISTORY="${ROOT_DIR}/upgrade/backend/EX_BE_02_LIVE_D2_ADMISSION_CHECKPOINT.md"
IAM_REVISION="${ROOT_DIR}/upgrade/backend/EX_BE_02_D2_IAM_POLICY_REVISION_2.md"
UNIFIED="${ROOT_DIR}/upgrade/UNIFIED_IMPLEMENTATION_PLAN.md"
F2_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_05B_F2_SANDBOX_CERTIFICATION.md"
F2_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F2_HANDOFF.md"
F3_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_05B_F3_CANARY_CONTROL_ROOM.md"
F3_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F3_HANDOFF.md"
F4_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_05B_F4_LIVE_FULL_OPERATIONS.md"
F4_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_EX_BE_05B_F4_HANDOFF.md"

python3 - "${MASTER}" "${TRACKER}" "${ROADMAP}" "${LEDGER}" "${BACKEND_README}" "${ARCHITECTURE}" "${FRONTEND_HANDOFF}" "${CATALOG}" "${ADMISSION_HISTORY}" "${UNIFIED}" "${F2_REPORT}" "${F2_HANDOFF}" "${F3_REPORT}" "${F3_HANDOFF}" "${IAM_REVISION}" "${F4_REPORT}" "${F4_HANDOFF}" <<'PY'
from pathlib import Path
import json
import re
import sys

master, tracker, roadmap, ledger, backend, architecture, handoff, catalog_path, admission_history, unified, f2_report, f2_handoff, f3_report, f3_handoff, iam_revision, f4_report, f4_handoff = [Path(p) for p in sys.argv[1:]]
for path in (master, tracker, roadmap, ledger, backend, architecture, handoff, catalog_path, admission_history, unified, f2_report, f2_handoff, f3_report, f3_handoff, iam_revision, f4_report, f4_handoff):
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
history = admission_history.read_text()
u = unified.read_text()
f2 = f2_report.read_text()
f2h = f2_handoff.read_text()
f3 = f3_report.read_text()
f3h = f3_handoff.read_text()
iamr = iam_revision.read_text()
f4 = f4_report.read_text()
f4h = f4_handoff.read_text()

qualified = "`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`"
for phase in (3, 14, 15, 16, 17):
    row = next((line for line in t.splitlines() if line.startswith(f"| {phase} |")), None)
    if row is None or qualified not in row:
        raise SystemExit(f"tracker phase {phase} does not carry qualified inactive status")
phase12 = next((line for line in t.splitlines() if line.startswith("| 12 |")), None)
if phase12 is None or qualified not in phase12 or "F4" not in phase12:
    raise SystemExit("tracker phase 12 lost the qualified F4 source-dark boundary")

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

if "D2_ADMISSION_REJECTED / APPLICATION_DARK" not in history:
    raise SystemExit("D2 admission history lost the original rejected evidence")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
):
    if "D2_SHARED_HOST_REALIGNMENT_COMPLETE / LIVE_D2_UNAUTHORIZED" not in text:
        raise SystemExit(f"{label} lost the owner-approved D2 shared-host boundary")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
):
    normalized = re.sub(r"\s+", " ", text)
    if "HOST_PREFLIGHT_ACCEPTED / IAM_ISOLATION_NOT_AUTHORIZED / LIVE_D2_UNAUTHORIZED" not in normalized:
        raise SystemExit(f"{label} lost the D2 live requalification/IAM stop-gate")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("IAM revision report", iamr),
):
    normalized = re.sub(r"\s+", " ", text)
    if (
        "REVISION_2_REPORTED_ATTACHED / EFFECTIVE_ALLOW_NOT_PROVEN / LIVE_D2_UNAUTHORIZED"
        not in normalized
    ):
        raise SystemExit(f"{label} lost the D2 IAM revision-2 stop-gate")
if "bca3ee7d9aa7cc3d27318ce3e27d4e655becd9d7bea5a0b674768c62066fb476" not in iamr:
    raise SystemExit("IAM revision report lost the private policy digest")

for label, text in (
    ("master", m), ("tracker", t), ("backend README", b),
    ("architecture guide", a), ("frontend handoff", h),
    ("unified plan", u), ("F4 report", f4), ("F4 Claude handoff", f4h),
):
    for token in (
        "EX-BE-05b/F4",
        "INTEGRATION_COMPLETE / PRODUCTION_INACTIVE",
        "BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4",
    ):
        if token not in text:
            raise SystemExit(f"{label} lost F4 invariant {token}")
for token in (
    "GET /api/v1/execution/deployments/{deployment_id}/live",
    "active_for_live_full=false",
    "No F4 POST/command/SSE/source-ingestion route exists",
):
    if token not in f4:
        raise SystemExit(f"F4 report lost source-dark invariant {token}")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
):
    normalized = re.sub(r"\s+", " ", text)
    if "D2_ISOLATION_EXECUTABLE_PREPARED / LIVE_D2_UNAUTHORIZED" not in normalized:
        raise SystemExit(f"{label} lost the executable D2 isolation boundary")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
):
    if "D2_AUTHORIZATION_CONTRACT_PREPARED / LIVE_D2_UNAUTHORIZED" not in text:
        raise SystemExit(f"{label} lost the D2 authorization/live boundary")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    normalized = re.sub(r"\s+", " ", text)
    if "D4_OFFLINE_AUTHORIZATION_PREPARED / D3_PREDECESSOR_ACCEPTED / LIVE_D4_INPUTS_BLOCKED" not in normalized:
        raise SystemExit(f"{label} lost the D4 offline/live stop-gate")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    normalized = re.sub(r"\s+", " ", text)
    if "D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK / D2_RUNTIME_RESTORED" not in normalized:
        raise SystemExit(f"{label} lost the accepted D3/source-dark boundary")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("request ledger", l),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    if "full Portal" not in text or "SGP" not in text or "AWS-HK" not in text:
        raise SystemExit(f"{label} lost the SGP full-Portal/AWS-HK minimal-Edge placement")
    normalized = re.sub(r"\s+", " ", text)
    for token in ("5.00", "5,632", "4.00", "4,608"):
        if token not in normalized:
            raise SystemExit(f"{label} lost D2 resource boundary {token}")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("request ledger", l),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    normalized = re.sub(r"\s+", " ", text)
    if not re.search(r"no new EC2(?:/EIP(?:/D1B)?)?|không tạo EC2/EIP/D1B mới", normalized, re.I):
        raise SystemExit(f"{label} lost the no-new-EC2 D2 placement decision")

phase6 = next((line for line in t.splitlines() if line.startswith("| 6 |")), None)
if phase6 is None or "`FOUNDATION_COMPLETE / PRODUCTION_INACTIVE`" not in phase6:
    raise SystemExit("tracker phase 6 lost the qualified F0 foundation status")
phase7 = next((line for line in t.splitlines() if line.startswith("| 7 |")), None)
if phase7 is None or "`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`" not in phase7:
    raise SystemExit("tracker phase 7 lost the qualified F1a Operations Queue status")
phase8 = next((line for line in t.splitlines() if line.startswith("| 8 |")), None)
if phase8 is None or "`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`" not in phase8:
    raise SystemExit("tracker phase 8 lost the qualified F1b Incident Detail status")
phase10 = next((line for line in t.splitlines() if line.startswith("| 10 |")), None)
if phase10 is None or "`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`" not in phase10:
    raise SystemExit("tracker phase 10 lost the qualified F2 Sandbox Certification status")
phase11 = next((line for line in t.splitlines() if line.startswith("| 11 |")), None)
if phase11 is None or "`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`" not in phase11:
    raise SystemExit("tracker phase 11 lost the qualified F3 Canary Control Room status")
for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
):
    if "EX-BE-05b/F1a" not in text or "source" not in text.lower():
        raise SystemExit(f"{label} lost the F1a source-dark boundary")
for label, text in (
    ("master", m),
    ("tracker", t),
    ("request ledger", l),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    normalized = re.sub(r"\s+", " ", text)
    if "EX-BE-05b/F1b" not in normalized or "PRODUCTION_INACTIVE" not in normalized:
        raise SystemExit(f"{label} lost the qualified F1b Incident Detail boundary")
    if not re.search(r"(no auto-resume|never resumes?|cannot resume|không auto-resume)", normalized, re.I):
        raise SystemExit(f"{label} lost the F1b no-auto-resume invariant")
for label, text in (
    ("master", m),
    ("tracker", t),
    ("request ledger", l),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
    ("F2 report", f2),
    ("F2 Claude handoff", f2h),
):
    normalized = re.sub(r"\s+", " ", text)
    if "EX-BE-05b/F2" not in normalized or "PRODUCTION_INACTIVE" not in normalized:
        raise SystemExit(f"{label} lost the qualified F2 Sandbox Certification boundary")
    if not re.search(r"(?:exactly|fixed|đúng) seven|bảy bước|seven ordered|seven-step", normalized, re.I):
        raise SystemExit(f"{label} lost the canonical seven-step F2 boundary")
    if not re.search(r"(?:no|không có) (?:public )?(?:source-evidence|source evidence|`?outbox)|no `?outbox", normalized, re.I):
        raise SystemExit(f"{label} lost the F2 source-dark/no-outbox boundary")
    if not re.search(r"promotion.{0,100}blocked|blocked.{0,100}promotion", normalized, re.I):
        raise SystemExit(f"{label} lost the blocked F2 promotion invariant")
for label, text in (
    ("master", m),
    ("tracker", t),
    ("request ledger", l),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
    ("F3 report", f3),
    ("F3 Claude handoff", f3h),
):
    normalized = re.sub(r"\s+", " ", text)
    if "EX-BE-05b/F3" not in normalized or "PRODUCTION_INACTIVE" not in normalized:
        raise SystemExit(f"{label} lost the qualified F3 Canary boundary")
    if "BROKER_STALE_BLOCKS_SCALE_ONLY" not in normalized:
        raise SystemExit(f"{label} lost the protective/scale asymmetry")
    if not re.search(r"(?:no|không) (?:source ingestion|outbox|source|activation|command route)", normalized, re.I):
        raise SystemExit(f"{label} lost the F3 source-dark/no-side-effect boundary")
    if not re.search(r"(?:invisible|hidden|absent|ẩn).{0,80}(?:disabled|inactive|tắt)|(?:disabled|inactive|tắt).{0,80}(?:invisible|hidden|absent|ẩn)|visible=false.{0,80}enabled=false", normalized, re.I):
        raise SystemExit(f"{label} lost the F3 command-inactive visibility boundary")
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
