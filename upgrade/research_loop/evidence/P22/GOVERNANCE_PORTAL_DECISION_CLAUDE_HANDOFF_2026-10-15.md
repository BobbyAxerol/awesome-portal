# Claude handoff — Portal-local Governance continuation

Bobby-approved backend slice, 2026-10-15. Canonical branch:
`docs/research-loop-plan`. Read the [continuation receipt](./GOVERNANCE_P23_P24_CONTINUATION_2026-10-15.md)
and [P23 dependency dispositions](../P23/GOVERNANCE_DEPENDENCY_DISPOSITION_2026-10-15.md)
before consuming. This supersedes **only** the earlier blanket statement that
R2 has no Portal-local command. It does not commission Execution commands,
change source authority, renew certificates, or enable live trading.

## 1. Story / authority matrix

| Screen / verb | Server fact to consume | Must not imply |
| --- | --- | --- |
| Research RC → Inbox → R1 | Same-read `decision_context`, per-verb `eligibility`, checklist `evidence_ref`, workspace | R1 approval deploys a strategy |
| R2 | Separate `GOVERNANCE_R2_DECISION`, ADMIN **and** scoped `governance.r2.decide`, immutable R1 parent, independent actor | An ADMIN role alone grants access; R1 command can approve R2 |
| R2 approved → Paper Exit capture | `capture_context` requires accepted R2 and real fresh Paper source tuple | A pending R2 or retained observation is accepted execution evidence |
| Paper Exit | Existing `GOVERNANCE_PAPER_EXIT_DECISION`; its **own** context and full evidence hashes | Parent/lineage digests equal the decision evidence set |
| Live | Actual `LIVE_GATE` record, own named command/context, `LIVE_PARENT_NOT_PUBLISHED` | R2 row is a Live review; named command means a valid Live parent policy exists |
| Execution grants/deployment/capital | Remain source/capability-qualified and inactive in this continuation | Portal approval creates a risk grant, starts a container or trades |

R2 positive decisions require approved/unexpired/complete R1. DENY remains a
safe local refusal; it does not assert source fitness. REQUEST_CHANGES needs
typed remediation conditions and independent authorship. Use the individual
eligibility booleans, **not** `locks.length === 0` for every verb. Existing
owner authority never bypasses workspace membership or separation of duties.

## 2. Exact generated contract / API binding

Run the scoped mechanical target from `packages/contracts`:

```bash
npm run generate:governance-review-context
```

Read `generated/execution-governance.d.ts` and, for the outer Live response,
`generated/execution-profile-read.d.ts`. Canonical sources are
`execution-governance-portal-decisions.v1.schema.json`,
`execution-governance-review-context.v1.schema.json`,
`execution-governance-r2-review.v1.schema.json`, and
`governance-live-decision-review.v1.schema.json`.

| Prefix | Named schemas | Command |
| --- | --- | --- |
| R1 | `R1DecisionPlanRequest`, `R1DecisionPlan`, `R1ApplyRequest`, `R1ApplyResponse`, `R1DecisionOperation` | `GOVERNANCE_R1_DECISION` |
| R2 | Same five names with `R2` prefix | `GOVERNANCE_R2_DECISION` |
| Live | Same five names with `Live` prefix | `GOVERNANCE_LIVE_DECISION` |

Paths remain same-origin: POST `/api/v1/execution/commands/plans`,
POST `/api/v1/execution/operations/{operation_id}/apply`, and
GET `/api/v1/execution/operations/{operation_id}?workspace_id=…`.
The schema/command identify the gate; never substitute R1's schema in R2/Live.
Plan/apply tokens are actor/workspace/operation/intent-bound. Keep CSRF and
Origin; do not put tokens in URLs/logs. A `202` apply is an operation receipt:
poll only that operation to terminal, do not treat HTTP acceptance as approval.

Every plan now publishes `authority_requirements`: exact capability, nullable
role constraint, required membership and separation-of-duties. The legacy
`required_approvers` is a compatibility/quorum display, **not authorization**.
`decision_authority: PORTAL_ONLY` and
`source_side_effect_requested: false` accompany R2/Live responses.

For R2, pin `decision_context.evidence_hashes` from that same read. Display
`decision_evidence_manifest` as the R2 review's own evidence. Existing
`evidence_manifest` / `r1_reference.digest` describe the R1 parent; neither is
a fallback for child decision pins. Changed version/policy/hash requires a
fresh read + plan with a new request key, never silently reuse the old intent.

Live's outer schema stays `governance.live-review.v1`; its backbone is now
`governance.live-decision-review.v1`, with gate `LIVE_GATE`. Do not require R2
read permission to read Live. Unpublished portfolio/currency stays null.
No actual Live predecessor link is published yet; **all Live decision verbs
remain blocked**. Do not invent Canary→Live linkage from a subject name.

## 3. Frontend changes requested — preserve approved design

- **FE-GOV-C01:** update `execution/api/governanceContext.ts` and typed adapters:
  current decoder accepts only the old R1 command/null-R2 shape. Accept each
  exact gate/schema/command pair; keep legacy/unavailable reads fail-closed.
- **FE-GOV-C02:** update `execution/api/httpApi.ts`: plan/apply schema currently
  hard-codes R1. Use the served, validated gate context and generated request
  union. Persist workspace in request, navigation and reload; do not parse
  command names from labels. Map `authority_requirements` explicitly.
- **FE-GOV-C03:** R2 buttons/plan summary use per-verb eligibility, exact child
  evidence manifest and Portal-only wording. Live uses its own backbone/read
  route and typed parent-policy refusal; do not enable Live or source actions.
  Command Center Live links now target `/live`, never `/r2`.
- **FE-GOV-C04:** explain `R2_APPROVAL_REQUIRED`, `R1_LINEAGE_UNPUBLISHED`,
  `R1_NOT_APPROVED`, `R1_EXPIRED`, `R1_PARENT_CHANGED`,
  `R1_EVIDENCE_MANIFEST_INTEGRITY_FAILED`, `LIVE_PARENT_NOT_PUBLISHED`,
  `APPROVAL_POLICY_CHANGED`, `ADMIN_ROLE_REQUIRED`, `APPROVER_ROLE_REQUIRED` and stale grant/session
  refusals with public copy + request ID, not raw server internals.
- **FE-GOV-C05:** old R2 captures can retain their original blocking finding.
  Never hide it or retrofit history. A new source-backed capture with a new
  request key is the valid path when source conditions become qualified.
  Retained preview continues to say capture is read-only/blocked.

No layout, palette, typography, chart, baseline or HiFi redesign is requested.
If a story adjustment needs visual changes, show Bobby the smallest proposal.

## 4. Acceptance and reporting

Canonical synthetic examples are explicitly labelled in
`fixtures/governance-review-context.synthetic.valid.json`; the canonical Live
fixture contains an actual Live-shaped backbone with a typed missing parent.
These are contract tests, **not** captured product-source evidence.

Required affected consumer tests: R1/R2/Live/Exit exact command binding; child
versus parent hashes; per-verb DENY/REQUEST_CHANGES; old/absent context; expired
approval/plan; grant or membership revoked; cross-workspace/actor; request-key
payload conflict; mismatch 409 without leaking foreign records; no source
side effects, no idle polling/stream in retained mode. Check 1280/660, keyboard,
deep link/reload and approved component integrity in a browser.

On the actual preview, record UI bundle, Control API image, source SHA,
workspace/record IDs and response hashes. Product R2 capture positive is
conditional on qualified source evidence; do **not** seed SQL, change a flag,
or call a synthetic projection a product receipt to unlock it. Technical
independent-reviewer flows are already covered in disposable PostgreSQL.

Update this packet, backend queue §60 and Unified with tested/blocked lane
dispositions and any CG request. P24 remains pending the affected consumer
receipt; even a successful preview review authorizes **no** dev/main merge,
remote push, signed release or production deployment.
