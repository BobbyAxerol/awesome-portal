# CG-GOV-01 — Paper Exit exact decision pins

2026-10-12 · Codex · `docs/research-loop-plan` · base `5df904bd`.
Delivery SHA is the ordinary-hook commit containing this receipt. No remote
push, shared preview rebuild, migration, grant/identity/source/SSE activation,
frontend source/baseline edit or dev/main/production change.

## Finding and repair

Claude's discrepancy is confirmed: the verified Paper Exit manifest in
`PaperExitService.plan` contains `snapshot.evidence[].sha256`. Neither
`lineage[].digest`, finding hashes nor the aggregate `evidence_set_hash` is
that set. The earlier backend handoff's lineage-pin advice was incomplete and
is superseded here; frontend must not reconstruct the command set from it.

Existing GET `/api/v1/execution/governance/exit-reviews/:review_id` now publishes
optional `data.decision_context` after both manifest and source-snapshot integrity
checks. New strict generated component:
`execution-governance.d.ts::components["schemas"]["PaperExitDecisionContext"]`.
The R1/R2 `DecisionContext` is unchanged; Paper Exit never aliases their command.

- Pins: workspace, review id/version, manifest hash, source snapshot hash,
  sorted unique **complete manifest** evidence hashes (maximum128; no truncation).
- Existing command/schema/path: `GOVERNANCE_PAPER_EXIT_DECISION`,
  `governance.paper-exit-decision-plan-request.v1`,
  `/api/v1/execution/commands/plans`.
- Typed AVAILABLE/BLOCKED and reason; oversize hashes become null+blocked.
  Role, expiry, closed review, prior decision and unsupported quorum stay blocked.
- Existing per-verb eligibility is still authoritative. Incomplete/stale source
  or self-promotion blocks PROMOTE, not a legitimate safe EXTEND/REJECT. A context
  saying AVAILABLE is **not** blanket permission or downstream TS activation.
  POST plan/apply still verify workspace, current version, hashes, CSRF/Origin,
  actor, quorum, source snapshot, idempotency and immutable audit/decision rules.

## Tests and evidence boundary

Focused backend context19/19 and canonical contract7/7 PASS. Control API build
and frontend `tsc -b --noEmit` PASS without frontend edits. Regenerated only
the scoped Governance dependency set and snapshot; Profile generated output
stays byte-identical.

The existing isolated real-PostgreSQL/API Paper Exit suite adds:

1. Read EX-MET publishes four manifest hashes, while lineage has three hashes
   and two nulls. Sending the lineage set yields `EVIDENCE_HASH_MISMATCH` and no
   apply token; it is not silently repaired or applied.
2. EX-PROMOTE read context → exact typed plan body → apply → operation receipt;
   independent reviewer; idempotent decision/audit/outbox, one local grant,
   **zero execution commands**. Closed reread advances version and blocks context.
3. USER and unsupported quorum refuse context; the requester's safe decisions
   remain possible but self-promotion remains ineligible. Existing integrity,
   stale/source-absence, role/CSRF/intent and separation-of-duties tests remain.
4. Pure context bounds, uniqueness, wrong-command and availability invariants;
   legacy fixture without optional context and full response with it both validate.

Run these real API regressions once through the mandatory normal hook (no extra
manual full API/engine run). A successful delivery commit is their gate; final
output is retained privately at
`/home/bobby/.local/state/portal-governance-cross-loop/20261012/cg-gov-01-hook.log`.
DB-backed fixture authority is not shared-preview business/source qualification
or browser evidence. Shared preview still serves the older §56 API; Claude's
positive real browser lanes remain unobserved until an authorized rebuild/cell.

## Claude handoff — only bindings, preserve design

Consume `data.decision_context` with the new generated Paper Exit type. Verify
same-read workspace, review id/version, manifest/source hashes and command/schema
identity. Planning requires valid AVAILABLE context **and** the selected verb's
existing eligibility. Map its workspace/id/version/hash list to the existing
plan request; do not add aggregate/source hashes as unrecognized payload fields.
Use the same pins for request-key identity and reload/refusal handling. Never use
lineage/finding digests or `[]` as fallback. Old/absent context: disable the action
with reload/typed absence, not a guessed evidence set. Keep source links intact.

Extend Claude's existing37-test fixture lane with the published
`governance-review-context.synthetic.valid.json::paper_exit`; test exact request
body, wrong/missing/oversize pins, blocked context and the per-verb intersection.
Rebuild/browser retake remains separately authorized; no source flag or inserted
business rows just to create a positive screen. No layout/color/HiFi/baseline change.

## C4 and disposition

Pre-hook capacity:root621GiB,used459GiB,available162GiB (~26% free),9.3GiB memory
available; above20% hard limit, below30% observation threshold. Docker inventory:
images88.69GB,build cache195.4GB,volumes31.21GB; deploy runner active; zero
`control-api-test` containers before hook. These existing bytes are not deletion
targets. The normal hook owns
an isolated disposable PG/Node/network/temp cell with exact trap teardown; confirm
no `control-api-test` cell/network survives before handing off. No new named volume,
product account, migration or artifact bytes. Decision:`NO_ACTION_NEEDED` for
this slice; broader host cache cleanup is separate, no pruning here.

Backend CG-GOV-01 is DELIVERED only upon successful normal-hook commit. Frontend
binding and shared-preview positive browser receipts stay separate OPEN work.
