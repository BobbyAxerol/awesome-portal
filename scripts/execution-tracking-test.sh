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
N09_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_05_N09_PORTAL_GOVERNANCE_WORKFLOW_GAPS.md"
N09_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N09_GOVERNANCE_WORKFLOW_HANDOFF.md"
OWNER_MASTER_REQUEST="${ROOT_DIR}/upgrade/backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md"
EXECUTION_UNIFIED_PLAN="${ROOT_DIR}/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md"
N14A_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md"
N14A_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N14A_RELEASE_AUTHORITY_HANDOFF.md"
N14B_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md"
N14B_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N14B_CURRENT_SOURCE_RELEASE_HANDOFF.md"
N15A_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md"
N15A_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N15A_FOUR_INTERFACE_GATEWAY_HANDOFF.md"
N15B_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md"
N15B_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N15B_CURRENT_GATEWAY_HANDOFF.md"
N16A_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_19_N16A_SOURCE_DARK_ROUTING_AND_EMERGENCY_POLICY.md"
N16A_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N16A_EMERGENCY_ROUTING_HANDOFF.md"
N16B_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md"
N16B_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N16B_CURRENT_PROTECTIVE_HANDOFF.md"
N17A_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_20_N17A_SOURCE_DARK_PRODUCTION_DR_PREPARATION.md"
N17A_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N17A_PRODUCTION_READINESS_HANDOFF.md"
N17B_REPORT="${ROOT_DIR}/upgrade/backend/EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md"
N17B_HANDOFF="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_TO_CLAUDE_N17B_EXACT_SET_HANDOFF.md"
DEBT_CLOSEOUT="${ROOT_DIR}/upgrade/backend/EX_BE_N13_N17_DEBT_CLOSEOUT.md"

for required_file in \
    "${OWNER_MASTER_REQUEST}" \
    "${EXECUTION_UNIFIED_PLAN}" \
    "${N14A_REPORT}" \
    "${N14A_HANDOFF}" \
    "${N14B_REPORT}" \
    "${N14B_HANDOFF}" \
    "${N15A_REPORT}" \
    "${N15A_HANDOFF}" \
    "${N15B_REPORT}" \
    "${N15B_HANDOFF}" \
    "${N16A_REPORT}" \
    "${N16A_HANDOFF}" \
    "${N16B_REPORT}" \
    "${N16B_HANDOFF}" \
    "${N17A_REPORT}" \
    "${N17A_HANDOFF}" \
    "${N17B_REPORT}" \
    "${N17B_HANDOFF}" \
    "${DEBT_CLOSEOUT}"
do
    if [[ ! -f "${required_file}" ]]; then
        echo "execution owner/phase plan is missing: ${required_file}" >&2
        exit 1
    fi
done
for token in \
    "OFFICIAL_SINGLE_OWNER_REQUEST" \
    "d4-paper-read-v2-request" \
    "n11-external-read-v1-request" \
    "n12-command-relay-v1-request" \
    "N01–N17 dependency audit" \
    "no additional Trading System feature request"
do
    if ! grep -Fq "${token}" "${OWNER_MASTER_REQUEST}"; then
        echo "official Trading System master request lost invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "N13A_COMPLETE_SOURCE_DARK / N13B_PORTAL_IMPLEMENTATION_ACCEPTED / CURRENT_SOURCE_SET_PINNED / PROFILE_RUNTIME_DARK" \
    "N14A_COMPLETE_SOURCE_DARK / N14B_PORTAL_COMPATIBILITY_ACCEPTED / PROFILE_RUNTIME_NOT_ACTIVATED" \
    "N15A_COMPLETE_SOURCE_DARK / N15B_CURRENT_QUERY_ACCEPTED / PRODUCT_RUNTIME_DARK" \
    "N16A_COMPLETE_SOURCE_DARK / N16B_CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED / PRODUCT_RUNTIME_DARK" \
    "N17A_COMPLETE_SOURCE_DARK / N17B_EXACT_CURRENT_SET_ACCEPTED / PAPER_PRIVATE_QUERY_QUALIFIED / LIVE_MUTATION_INACTIVE"
do
    if ! grep -Fq "${token}" "${EXECUTION_UNIFIED_PLAN}"; then
        echo "execution unified plan lost A/B split: ${token}" >&2
        exit 1
    fi
    if ! grep -Fq "${token}" "${TRACKER}"; then
        echo "shared tracker lost A/B split: ${token}" >&2
        exit 1
    fi
done

for token in \
    "Source-as-is compatibility decision" \
    "CONNECTED" \
    "DERIVED_FROM_EXISTING_SOURCE" \
    "SUPPORTED_BUT_NOT_ACTIVATED" \
    "SOURCE_DOES_NOT_CURRENTLY_EXIST" \
    "Read and command identities stay separate"
do
    if ! grep -Fq "${token}" "${EXECUTION_UNIFIED_PLAN}"; then
        echo "execution unified plan lost source-as-is invariant: ${token}" >&2
        exit 1
    fi
done

if grep -Fq "Keep N13B–N17B parked until" "${EXECUTION_UNIFIED_PLAN}"; then
    echo "execution unified plan restored the superseded global owner blocker" >&2
    exit 1
fi

for token in \
    "N14A_COMPLETE_SOURCE_DARK" \
    "PRODUCTION_INACTIVE" \
    "N14B_COMPATIBILITY_ADJUNCT_ACCEPTED_SEPARATELY" \
    "image@sha256"
do
    if ! grep -Fq "${token}" "${N14A_REPORT}"; then
        echo "N14A report lost source-dark release invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "N14A_COMPLETE_SOURCE_DARK" \
    "PRODUCTION_INACTIVE" \
    "do not expose release hashes" \
    "N14B"
do
    if ! grep -Fq "${token}" "${N14A_HANDOFF}"; then
        echo "N14A Claude handoff lost consumer boundary: ${token}" >&2
        exit 1
    fi
done
if ! grep -Fq "N14A backend — Portal release authority" "${TRACKER}"; then
    echo "shared tracker lost N14A closeout section" >&2
    exit 1
fi

for token in \
    "N14B_PORTAL_COMPATIBILITY_ACCEPTED" \
    "PAPER_CANDIDATE_PINNED" \
    "PROFILE_RUNTIME_NOT_ACTIVATED" \
    "PAPER_BINANCE_USDM" \
    "runtime_deployed=false" \
    "N15B is next"
do
    if ! grep -Fq "${token}" "${N14B_REPORT}"; then
        echo "N14B report lost immutable compatibility invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "PAPER_COMPATIBILITY_ACCEPTED" \
    "RUNTIME_NOT_ACTIVATED" \
    "Do not render commit/image/source hashes" \
    "Do not enable actions"
do
    if ! grep -Fq "${token}" "${N14B_HANDOFF}"; then
        echo "N14B Claude handoff lost consumer boundary: ${token}" >&2
        exit 1
    fi
done
if ! grep -Fq "N14B backend — immutable current-source release compatibility" "${TRACKER}"; then
    echo "shared tracker lost N14B closeout section" >&2
    exit 1
fi

for token in \
    "N15A_COMPLETE_SOURCE_DARK" \
    "SUPERSEDED_BY_N15B_CURRENT_ACCEPTANCE" \
    "Query" \
    "Command" \
    "Event" \
    "Artifact" \
    "network_attempts=0"
do
    if ! grep -Fq "${token}" "${N15A_REPORT}"; then
        echo "N15A report lost source-dark gateway invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "N15A_COMPLETE_SOURCE_DARK" \
    "PRODUCTION_INACTIVE" \
    "N15B" \
    "generated/execution-intercell-gateway.d.ts"
do
    if ! grep -Fq "${token}" "${N15A_HANDOFF}"; then
        echo "N15A Claude handoff lost consumer boundary: ${token}" >&2
        exit 1
    fi
done
if ! grep -Fq "N15A backend — Source-dark four-interface gateway" "${TRACKER}"; then
    echo "shared tracker lost N15A closeout section" >&2
    exit 1
fi

for token in \
    "N15B_CURRENT_QUERY_ACCEPTED" \
    "PAPER_BINANCE_USDM" \
    "PAPER_TRADING_SCREEN" \
    "COMMAND_DEFERRED_N16B" \
    "EVENT_ARTIFACT_TYPED_UNAVAILABLE" \
    "PRODUCT_RUNTIME_DARK"
do
    if ! grep -Fq "${token}" "${N15B_REPORT}"; then
        echo "N15B report lost current-capability acceptance invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "QUERY_ACCEPTED_FOR_PAPER_OVERVIEW_ONLY" \
    "DEFERRED_N16B" \
    "SOURCE_DOES_NOT_CURRENTLY_EXIST" \
    "N15B_QUERY_CAPABILITY_NOT_ACCEPTED"
do
    if ! grep -Fq "${token}" "${N15B_HANDOFF}"; then
        echo "N15B Claude handoff lost consumer boundary: ${token}" >&2
        exit 1
    fi
done
if ! grep -Fq "N15B backend — current-capability inter-cell gateway acceptance" "${TRACKER}"; then
    echo "shared tracker lost N15B closeout section" >&2
    exit 1
fi

for token in \
    "N16A_COMPLETE_SOURCE_DARK" \
    "SUPERSEDED_BY_N16B_CURRENT_PRIMITIVE_ACCEPTANCE" \
    "PRODUCTION_INACTIVE" \
    "network_attempts=0" \
    "R4"
do
    if ! grep -Fq "${token}" "${N16A_REPORT}"; then
        echo "N16A report lost source-dark emergency invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "N16A_COMPLETE_SOURCE_DARK" \
    "PRODUCTION_INACTIVE" \
    "N16B" \
    "generated/execution-emergency-routing.d.ts" \
    "Do **not** render a break-glass control"
do
    if ! grep -Fq "${token}" "${N16A_HANDOFF}"; then
        echo "N16A Claude handoff lost consumer boundary: ${token}" >&2
        exit 1
    fi
done
if ! grep -Fq "N16A backend — Source-dark routing and emergency policy" "${TRACKER}"; then
    echo "shared tracker lost N16A closeout section" >&2
    exit 1
fi

for token in \
    "N16B_CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED" \
    "LIVE_EMERGENCY_CLOSE_ONLY" \
    "PRODUCT_RUNTIME_DARK" \
    "live.emergency-close" \
    "source_mutations=0"
do
    if ! grep -Fq "${token}" "${N16B_REPORT}"; then
        echo "N16B report lost current protective invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "COMPATIBILITY_ACCEPTED / RUNTIME_DARK" \
    "ACCEPTED_CURRENT_PRIMITIVE" \
    "N16B_RUNTIME_ACTIVATION_PENDING" \
    "blind retry"
do
    if ! grep -Fq "${token}" "${N16B_HANDOFF}"; then
        echo "N16B Claude handoff lost consumer boundary: ${token}" >&2
        exit 1
    fi
done
if ! grep -Fq "N16B backend — current-primitive protective-path acceptance" "${TRACKER}"; then
    echo "shared tracker lost N16B closeout section" >&2
    exit 1
fi

for token in \
    "N17A_COMPLETE_SOURCE_DARK" \
    "N17B_JOINT_PRODUCTION_ACCEPTANCE_PENDING" \
    "PRODUCTION_INACTIVE" \
    "WAL PITR" \
    "encrypted logical" \
    "Network attempts outside the isolated Docker network: \`0\`"
do
    if ! grep -Fq "${token}" "${N17A_REPORT}"; then
        echo "N17A report lost source-dark production/DR invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "N17A_COMPLETE_SOURCE_DARK" \
    "PRODUCTION_INACTIVE" \
    "N17B" \
    "generated/execution-production-readiness.d.ts" \
    "no production-ready badge"
do
    if ! grep -Fq "${token}" "${N17A_HANDOFF}"; then
        echo "N17A Claude handoff lost consumer boundary: ${token}" >&2
        exit 1
    fi
done
if ! grep -Fq "N17A backend — Source-dark production/DR preparation" "${TRACKER}"; then
    echo "shared tracker lost N17A closeout section" >&2
    exit 1
fi

for token in \
    "N17B_EXACT_CURRENT_SET_ACCEPTED" \
    "PAPER_PRIVATE_QUERY_QUALIFIED" \
    "25/25" \
    "15 r/s" \
    "SIGNED_PRODUCT_IMAGE_NOT_PUBLISHED" \
    "LIVE_MUTATION_INACTIVE"
do
    if ! grep -Fq "${token}" "${N17B_REPORT}"; then
        echo "N17B report lost exact-set invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "N17B_EXACT_CURRENT_SET_ACCEPTED" \
    "PAPER_PRIVATE_QUERY_QUALIFIED" \
    "N17B_RATE_LIMIT_QUEUE_TIMEOUT" \
    "no timer-based" \
    "no enabled action"
do
    if ! grep -Fq "${token}" "${N17B_HANDOFF}"; then
        echo "N17B Claude handoff lost consumer boundary: ${token}" >&2
        exit 1
    fi
done
if ! grep -Fq "N17B backend — Exact current-set production acceptance" "${TRACKER}"; then
    echo "shared tracker lost N17B closeout section" >&2
    exit 1
fi

for token in \
    "MERGE_READY / PRODUCT_RUNTIME_INACTIVE" \
    "No \`MERGE_BLOCKER\` remains open" \
    "TD-EX-01" \
    "TD-EX-02" \
    "TD-EX-03" \
    "TD-EX-06" \
    "TD-FC-01" \
    "BR-EX-41…67"
do
    if ! grep -Fq "${token}" "${DEBT_CLOSEOUT}"; then
        echo "N13B-N17B debt closeout lost invariant: ${token}" >&2
        exit 1
    fi
done
for token in \
    "BR-EX-67" \
    "_next: BR-EX-68_" \
    "EX_BE_N13_N17_DEBT_CLOSEOUT.md"
do
    if ! grep -Fq "${token}" "${EXECUTION_UNIFIED_PLAN}"; then
        echo "execution unified plan lost debt/request reconciliation: ${token}" >&2
        exit 1
    fi
done

python3 - "${MASTER}" "${TRACKER}" "${ROADMAP}" "${LEDGER}" "${BACKEND_README}" "${ARCHITECTURE}" "${FRONTEND_HANDOFF}" "${CATALOG}" "${ADMISSION_HISTORY}" "${UNIFIED}" "${F2_REPORT}" "${F2_HANDOFF}" "${F3_REPORT}" "${F3_HANDOFF}" "${IAM_REVISION}" "${F4_REPORT}" "${F4_HANDOFF}" "${N09_REPORT}" "${N09_HANDOFF}" <<'PY'
from pathlib import Path
import json
import re
import sys

master, tracker, roadmap, ledger, backend, architecture, handoff, catalog_path, admission_history, unified, f2_report, f2_handoff, f3_report, f3_handoff, iam_revision, f4_report, f4_handoff, n09_report, n09_handoff = [Path(p) for p in sys.argv[1:]]
for path in (master, tracker, roadmap, ledger, backend, architecture, handoff, catalog_path, admission_history, unified, f2_report, f2_handoff, f3_report, f3_handoff, iam_revision, f4_report, f4_handoff, n09_report, n09_handoff):
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
n09 = n09_report.read_text()
n09h = n09_handoff.read_text()
n11_report = backend.parent / "EX_BE_01_N11_EXTERNAL_READ_CAPABILITIES_AND_ADAPTERS.md"
n11_handoff = tracker.parent / "CODEX_TO_CLAUDE_N11_EXTERNAL_READ_HANDOFF.md"
n12_report = backend.parent / "EX_BE_05B_N12_LIVE_COMMAND_RELAY.md"
n12_handoff = tracker.parent / "CODEX_TO_CLAUDE_N12_COMMAND_RELAY_HANDOFF.md"
n13a_report = backend.parent / "EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md"
n13a_handoff = tracker.parent / "CODEX_TO_CLAUDE_N13A_STAGED_ACTIVATION_HANDOFF.md"
for path in (n11_report, n11_handoff, n12_report, n12_handoff, n13a_report, n13a_handoff):
    if not path.is_file():
        raise SystemExit(f"N11/N12 tracking file missing: {path}")
n11 = n11_report.read_text()
n11h = n11_handoff.read_text()
n12 = n12_report.read_text()
n12h = n12_handoff.read_text()
n13a = n13a_report.read_text()
n13ah = n13a_handoff.read_text()

for label, text in (("N09 report", n09), ("N09 Claude handoff", n09h)):
    for token in (
        "INTEGRATION_COMPLETE / PRODUCTION_INACTIVE",
        "governance_write_enabled",
        "REQUEST_CHANGES",
        "assigned_to=me",
        "smoke plan",
    ):
        if token not in text:
            raise SystemExit(f"{label} lost N09 invariant {token}")
if "Codex N09 Portal governance/workflow gaps" not in t:
    raise SystemExit("tracker lost N09 shared-board row")
if "EX_BE_05_N09_PORTAL_GOVERNANCE_WORKFLOW_GAPS.md" not in b:
    raise SystemExit("backend README lost N09 closeout index")
for label, text in (("N11 report", n11), ("N11 Claude handoff", n11h)):
    for token in (
        "OWNER_PUBLICATION_PENDING",
        "PRODUCTION_INACTIVE",
    ):
        if token not in text:
            raise SystemExit(f"{label} lost N11 boundary {token}")
if "Rust compatibility adapter" not in n11 or "availability" not in n11h:
    raise SystemExit("N11 tracking files lost adapter/consumer boundary")
for label, text in (("N12 report", n12), ("N12 Claude handoff", n12h)):
    for token in ("OWNER_PUBLICATION_PENDING", "PRODUCTION_INACTIVE", "UNCERTAIN"):
        if token not in text:
            raise SystemExit(f"{label} lost N12 boundary {token}")
if "202" not in n12 or "202" not in n12h or "command kill switch" not in n12:
    raise SystemExit("N12 tracking files lost terminal/kill-switch semantics")
if "N12 backend — live command publication/relay gate" not in t:
    raise SystemExit("tracker lost N12 shared-board section")
for label, text in (("N13A report", n13a), ("N13A Claude handoff", n13ah)):
    for token in ("SOURCE_DARK", "N13B", "fixture", "false"):
        if token not in text:
            raise SystemExit(f"{label} lost N13A boundary {token}")
if "N13A backend — source-dark staged activation foundation" not in t:
    raise SystemExit("tracker lost N13A shared-board section")

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
    if (
        row is None
        or "PORTAL_ADAPTER_GATE_COMPLETE" not in row
        or "OWNER_PUBLICATION_PENDING" not in row
    ):
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
    if "IAM_EFFECTIVE_ALLOW_VERIFIED / LIVE_D2_UNAUTHORIZED" not in normalized:
        raise SystemExit(f"{label} lost the accepted D2 IAM authority gate")
if "a940447f0f96959e9980c86e16fe7786ec7a1c0e37931fd7cc84ea6be601fd9d" not in iamr:
    raise SystemExit("IAM revision report lost the private policy digest")
if "D2_ISOLATION_AUTHORITY_VERIFIED" not in iamr or "DryRunOperation" not in iamr:
    raise SystemExit("IAM revision report lost live DryRun acceptance evidence")

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
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    normalized = re.sub(r"\s+", " ", text)
    if "D4_READINESS_AUDITED / LIVE_D4_INPUTS_BLOCKED / NO_SOURCE_READ" not in normalized:
        raise SystemExit(f"{label} lost the D4 readiness/source-read stop-gate")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    normalized = re.sub(r"\s+", " ", text)
    if "D4_MAPPER_CORE_OFFLINE_COMPLETE / RUNTIME_FAIL_CLOSED / LIVE_INPUTS_BLOCKED" not in normalized:
        raise SystemExit(f"{label} lost the D4 mapper/runtime stop-gate")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    normalized = re.sub(r"\s+", " ", text)
    if "D4_ENCRYPTED_STORAGE_BOUNDARY_PREPARED / LIVE_VOLUME_NOT_PROVISIONED / NO_SOURCE_READ" not in normalized:
        raise SystemExit(f"{label} lost the D4 encrypted-storage stop-gate")

for label, text in (
    ("master", m),
    ("tracker", t),
    ("backend README", b),
    ("architecture guide", a),
    ("frontend handoff", h),
    ("unified plan", u),
):
    normalized = re.sub(r"\s+", " ", text)
    if "D4_OWNER_ACTION_PACKET_PREPARED / OWNER_ACTIONS_PENDING / NO_SOURCE_READ" not in normalized:
        raise SystemExit(f"{label} lost the D4 owner-action stop-gate")

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
    expected = (
        ("PORTAL_COMMAND_GATE_COMPLETE", "MASTER_OWNER_REQUEST_READY", "OWNER_PUBLICATION_PENDING", "PRODUCTION_INACTIVE")
        if request.startswith("BR-EX-28")
        else ("FOUNDATION_COMPLETE", "PRODUCTION_INACTIVE")
    )
    if row is None or any(token not in row for token in expected):
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
